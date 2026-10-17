import WebSocket from "ws";
import {
  assembleStratumHeader,
  merkleFromCoinbase,
  targetFromDifficulty,
  hashMeetsTargetBE,
  reverseBytes,
  sha256d,
  bytesToHex,
  formatExtranonce2,
} from "../src/lib/stratum-math.ts";

type JobPack = {
  job: {
    jobId: string;
    prevhash: string;
    coinb1: string;
    coinb2: string;
    merkleBranches: string[];
    version: string;
    nbits: string;
    ntime: string;
  };
  en1: string;
  en2size: number;
  diff: number;
};

function onceJob(): Promise<JobPack> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://stratum.onyxlab.dev/");
    let en1 = "";
    let en2size = 4;
    let diff = 1;
    const t = setTimeout(() => reject(new Error("timeout")), 15000);
    ws.on("open", () =>
      ws.send(JSON.stringify({ type: "connect", host: "public-pool.io", port: 3333 }))
    );
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "status" && msg.state === "connected") {
        ws.send(
          JSON.stringify({ id: 1, method: "mining.subscribe", params: ["onyx-miner/1.2"] }) + "\n"
        );
      } else if (msg.id === 1 && msg.result) {
        en1 = msg.result[1];
        en2size = msg.result[2];
        ws.send(JSON.stringify({ id: 10, method: "mining.suggest_difficulty", params: [0.01] }) + "\n");
        ws.send(
          JSON.stringify({
            id: 2,
            method: "mining.authorize",
            params: ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "x"],
          }) + "\n"
        );
      } else if (msg.method === "mining.set_difficulty") {
        diff = msg.params[0];
      } else if (msg.method === "mining.notify") {
        const job = {
          jobId: msg.params[0],
          prevhash: msg.params[1],
          coinb1: msg.params[2],
          coinb2: msg.params[3],
          merkleBranches: msg.params[4],
          version: msg.params[5],
          nbits: msg.params[6],
          ntime: msg.params[7],
        };
        clearTimeout(t);
        ws.close();
        resolve({ job, en1, en2size, diff });
      }
    });
    ws.on("error", reject);
  });
}

async function main() {
const { job, en1, en2size, diff } = await onceJob();
console.log("job", job.jobId, "diff", diff, "en1", en1, "en2size", en2size);
const en2 = formatExtranonce2(0, en2size);
const merkle = merkleFromCoinbase(job.coinb1, en1, en2, job.coinb2, job.merkleBranches);
const target = targetFromDifficulty(diff);
let best = "f".repeat(64);
let hashes = 0;
const t0 = Date.now();
for (let nonce = 0; nonce < 250000; nonce++) {
  const header = assembleStratumHeader({
    versionHex: job.version,
    prevhashHex: job.prevhash,
    merkleRoot: merkle,
    ntimeHex: job.ntime,
    nbitsHex: job.nbits,
    nonce,
  });
  const disp = reverseBytes(sha256d(header));
  const hex = bytesToHex(disp);
  if (hex < best) best = hex;
  hashes++;
  if (hashMeetsTargetBE(disp, target)) {
    console.log("FOUND SHARE", hex, "nonce", nonce.toString(16));
    break;
  }
}
const dt = (Date.now() - t0) / 1000;
console.log(
  "hashes",
  hashes,
  "H/s",
  (hashes / dt).toFixed(0),
  "best",
  best.slice(0, 24),
  "target",
  bytesToHex(target).slice(0, 24)
);
}; main().catch(e=>{console.error(e); process.exit(1)});
