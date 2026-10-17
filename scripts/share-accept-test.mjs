import crypto from "crypto";
import WebSocket from "ws";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function sha256d(buf) {
  return crypto.createHash("sha256").update(crypto.createHash("sha256").update(buf).digest()).digest();
}
function hexToBytes(h) {
  return Buffer.from(h.length % 2 ? "0" + h : h, "hex");
}
function unswapPrev(hex) {
  const src = hexToBytes(hex.padStart(64, "0"));
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 4) {
    out[i] = src[i + 3];
    out[i + 1] = src[i + 2];
    out[i + 2] = src[i + 1];
    out[i + 3] = src[i];
  }
  return out;
}
const TRUE_DIFF_ONE = 2.695953529101131e67;
function submissionDiff(header) {
  const hashResult = sha256d(header);
  let number = 0;
  for (let i = hashResult.length - 1; i >= 0; i--) number = number * 256 + hashResult[i];
  return number === 0 ? Infinity : TRUE_DIFF_ONE / number;
}

if (!isMainThread) {
  const { job, merkle, nonceStart, nonceEnd, diff } = workerData;
  const merkleBuf = Buffer.from(merkle);
  let found = null;
  let hashes = 0;
  for (let nonce = nonceStart; nonce < nonceEnd; nonce++) {
    const header = Buffer.alloc(80);
    header.writeUInt32LE(parseInt(job.version, 16) >>> 0, 0);
    unswapPrev(job.prevhash).copy(header, 4);
    merkleBuf.copy(header, 36);
    header.writeUInt32LE(parseInt(job.ntime, 16) >>> 0, 68);
    header.writeUInt32LE(parseInt(job.nbits, 16) >>> 0, 72);
    header.writeUInt32LE(nonce >>> 0, 76);
    const d = submissionDiff(header);
    hashes++;
    if (d >= diff) {
      found = { nonce, d };
      break;
    }
  }
  parentPort.postMessage({ hashes, found });
} else {
  function merkleFromCoinbase(coinb1, en1, en2, coinb2, branches) {
    let merkle = sha256d(
      Buffer.concat([hexToBytes(coinb1), hexToBytes(en1), hexToBytes(en2), hexToBytes(coinb2)])
    );
    for (const br of branches) merkle = sha256d(Buffer.concat([merkle, hexToBytes(br)]));
    return merkle;
  }

  const ADDR = "bc1qx4gm2q462e2eczlxw9927mu5jv5chetukvp7vl.onyxfix";
  const ncpu = os.cpus().length;

  function connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket("wss://stratum.onyxlab.dev/");
      let en1 = "",
        en2size = 8,
        diff = 1,
        job = null;
      const t = setTimeout(() => reject(new Error("timeout")), 20000);
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
          ws.send(
            JSON.stringify({ id: 10, method: "mining.suggest_difficulty", params: [0.01] }) + "\n"
          );
          ws.send(
            JSON.stringify({ id: 2, method: "mining.authorize", params: [ADDR, "x"] }) + "\n"
          );
        } else if (msg.method === "mining.set_difficulty") {
          diff = msg.params[0];
        } else if (msg.method === "mining.notify") {
          job = {
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
          resolve({ ws, en1, en2size, diff, job });
        }
      });
      ws.on("error", reject);
    });
  }

  function submit(ws, id, job, en2, nonce) {
    const nonceHex = (nonce >>> 0).toString(16).padStart(8, "0");
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ timeout: true }), 15000);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timer);
          ws.off("message", onMsg);
          resolve(msg);
        }
      };
      ws.on("message", onMsg);
      ws.send(
        JSON.stringify({
          id,
          method: "mining.submit",
          params: [ADDR, job.jobId, en2, job.ntime, nonceHex],
        }) + "\n"
      );
    });
  }

  function mineChunk(job, merkle, diff, nonceStart, nonceEnd) {
    return new Promise((resolve, reject) => {
      const w = new Worker(__filename, {
        workerData: { job, merkle: [...merkle], nonceStart, nonceEnd, diff },
      });
      w.on("message", resolve);
      w.on("error", reject);
      w.on("exit", (code) => {
        if (code !== 0) reject(new Error("worker exit " + code));
      });
    });
  }

  const { ws, en1, en2size, diff, job: initialJob } = await connect();
  let job = initialJob;
  let curDiff = diff;
  console.log("diff", curDiff, "job", job.jobId, "cpus", ncpu);
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === "mining.notify") {
      job = {
        jobId: msg.params[0],
        prevhash: msg.params[1],
        coinb1: msg.params[2],
        coinb2: msg.params[3],
        merkleBranches: msg.params[4],
        version: msg.params[5],
        nbits: msg.params[6],
        ntime: msg.params[7],
      };
      console.log("new job", job.jobId);
    }
    if (msg.method === "mining.set_difficulty") {
      curDiff = msg.params[0];
      console.log("diff", curDiff);
    }
  });

  const deadline = Date.now() + 55 * 60 * 1000;
  let en2Counter = 1;
  let totalHashes = 0;
  let submitId = 6000;
  const t0 = Date.now();
  let accepted = 0,
    rejected = 0;

  while (Date.now() < deadline && accepted === 0) {
    const curJob = { ...job };
    const en2 = en2Counter.toString(16).padStart(en2size * 2, "0").slice(-en2size * 2);
    en2Counter++;
    const merkle = merkleFromCoinbase(
      curJob.coinb1,
      en1,
      en2,
      curJob.coinb2,
      curJob.merkleBranches
    );
    const SPAN = 32_000_000;
    const chunk = Math.floor(SPAN / ncpu);
    const results = await Promise.all(
      Array.from({ length: ncpu }, (_, i) => {
        const start = i * chunk;
        const end = i === ncpu - 1 ? SPAN : (i + 1) * chunk;
        return mineChunk(curJob, merkle, curDiff, start, end);
      })
    );
    if (job.jobId !== curJob.jobId) {
      console.log("stale after mine, skip");
      continue;
    }
    let roundHashes = 0;
    let candidate = null;
    for (const r of results) {
      roundHashes += r.hashes;
      if (r.found && (!candidate || r.found.d > candidate.d)) candidate = r.found;
    }
    totalHashes += roundHashes;
    const dt = (Date.now() - t0) / 1000;
    console.log(
      "round en2",
      en2,
      "H/s",
      (totalHashes / dt / 1000).toFixed(0) + "k",
      "elapsed",
      (dt / 60).toFixed(1) + "m",
      "cand",
      !!candidate
    );

    if (candidate) {
      console.log("CANDIDATE", candidate);
      const resp = await submit(ws, ++submitId, curJob, en2, candidate.nonce);
      console.log("SUBMIT", JSON.stringify(resp));
      if (resp.result === true) accepted++;
      else rejected++;
    }
  }
  const dt = (Date.now() - t0) / 1000;
  const out = {
    accepted,
    rejected,
    totalHashes,
    dt,
    Hps: totalHashes / dt,
  };
  console.log("FINAL", out);
  fs.writeFileSync("/tmp/share-test-result.json", JSON.stringify(out, null, 2));
  ws.close();
  process.exit(accepted > 0 ? 0 : 2);
}
