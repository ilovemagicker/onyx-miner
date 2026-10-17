/**
 * Probe NerdMiners.org: subscribe with NerdMinerV2 UA, mine briefly,
 * submit shares, watch job rotation + accept/reject.
 * Also simulates "stale submit" of a previous job_id to confirm pool rejects it.
 */
import crypto from "crypto";
import WebSocket from "ws";

const PROXY = "wss://stratum.onyxlab.dev/";
const HOST = "pool.nerdminers.org";
const PORT = 3333;
const UA = "NerdMinerV2/onyx-1.3";
const ADDR = "bc1qx4gm2q462e2eczlxw9927mu5jv5chetukvp7vl.onyxstale";

function sha256d(buf) {
  return crypto.createHash("sha256").update(crypto.createHash("sha256").update(buf).digest()).digest();
}
function hexToBytes(h) {
  const s = h.length % 2 ? "0" + h : h;
  return Buffer.from(s, "hex");
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
function merkleFromCoinbase(coinb1, en1, en2, coinb2, branches) {
  let merkle = sha256d(
    Buffer.concat([hexToBytes(coinb1), hexToBytes(en1), hexToBytes(en2), hexToBytes(coinb2)])
  );
  for (const br of branches) merkle = sha256d(Buffer.concat([merkle, hexToBytes(br)]));
  return merkle;
}
const DIFF1 = BigInt("0x00000000ffff0000000000000000000000000000000000000000000000000000");
function targetFromDiff(diff) {
  if (!diff || diff <= 0) return DIFF1;
  const scale = 1_000_000n;
  const denom = BigInt(Math.max(1, Math.round(diff * 1_000_000)));
  return (DIFF1 * scale) / denom;
}
function hashMeets(hashBE, targetBE) {
  const h = BigInt("0x" + Buffer.from(hashBE).toString("hex"));
  const t = BigInt("0x" + Buffer.from(targetBE).toString("hex"));
  return h <= t;
}
function bigTo32(n) {
  let hex = n.toString(16).padStart(64, "0");
  return Buffer.from(hex.slice(-64), "hex");
}

const ws = new WebSocket(PROXY);
let en1 = "", en2size = 4, diff = 1, job = null;
let nextId = 100;
const pending = new Map();
let accepted = 0, rejected = 0, submitted = 0, jobs = 0;
let lastJobId = null;
const rejectReasons = [];

function send(obj) {
  ws.send(JSON.stringify(obj) + "\n");
}

function submit(jobId, en2, ntime, nonce) {
  const id = nextId++;
  const nonceHex = (nonce >>> 0).toString(16).padStart(8, "0");
  submitted++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ timeout: true });
    }, 12000);
    pending.set(id, { resolve, timer });
    send({
      id,
      method: "mining.submit",
      params: [ADDR, jobId, en2, ntime, nonceHex],
    });
  });
}

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "connect", host: HOST, port: PORT }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "error") {
    console.error("proxy error", msg);
    process.exit(1);
  }
  if (msg.type === "status" && msg.state === "connected") {
    send({ id: 1, method: "mining.subscribe", params: [UA] });
    return;
  }
  if (msg.id === 1) {
    if (!Array.isArray(msg.result)) {
      console.error("subscribe rejected", msg);
      process.exit(1);
    }
    en1 = msg.result[1];
    en2size = msg.result[2] || 4;
    console.log("subscribed en1", en1, "en2size", en2size);
    send({ id: 2, method: "mining.authorize", params: [ADDR, "x"] });
    send({ id: 3, method: "mining.suggest_difficulty", params: [0.00015] });
    return;
  }
  if (msg.id === 2) {
    console.log("authorize", msg.result, msg.error);
    return;
  }
  if (msg.method === "mining.set_difficulty") {
    diff = msg.params[0];
    console.log("diff", diff);
    return;
  }
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
      clean: msg.params[8],
    };
    jobs++;
    if (lastJobId && lastJobId !== job.jobId) {
      console.log("JOB ROTATED", lastJobId, "->", job.jobId, "clean", job.clean);
    }
    lastJobId = job.jobId;
    console.log("job", job.jobId, "clean", job.clean);
    return;
  }
  if (typeof msg.id === "number" && pending.has(msg.id)) {
    const { resolve, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    const ok = msg.result === true && !msg.error;
    if (ok) accepted++;
    else {
      rejected++;
      rejectReasons.push(msg.error || msg.result);
      console.log("REJECT", JSON.stringify(msg.error || msg.result));
    }
    resolve(msg);
  }
});

async function mineOneShare(activeJob, maxNonce = 5_000_000) {
  const en2 = (1).toString(16).padStart(en2size * 2, "0");
  const merkle = merkleFromCoinbase(
    activeJob.coinb1, en1, en2, activeJob.coinb2, activeJob.merkleBranches
  );
  const target = bigTo32(targetFromDiff(diff));
  for (let nonce = 0; nonce < maxNonce; nonce++) {
    if (!job || job.jobId !== activeJob.jobId) {
      return { stale: true, jobId: activeJob.jobId };
    }
    const header = Buffer.alloc(80);
    header.writeUInt32LE(parseInt(activeJob.version, 16) >>> 0, 0);
    unswapPrev(activeJob.prevhash).copy(header, 4);
    merkle.copy(header, 36);
    header.writeUInt32LE(parseInt(activeJob.ntime, 16) >>> 0, 68);
    header.writeUInt32LE(parseInt(activeJob.nbits, 16) >>> 0, 72);
    header.writeUInt32LE(nonce >>> 0, 76);
    const digest = sha256d(header);
    const disp = Buffer.from(digest).reverse();
    if (hashMeets(disp, target)) {
      return { nonce, en2, jobId: activeJob.jobId, ntime: activeJob.ntime };
    }
  }
  return null;
}

async function main() {
  // wait for first job
  const t0 = Date.now();
  while (!job && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  if (!job) {
    console.error("no job");
    process.exit(1);
  }

  const deadline = Date.now() + 90_000;
  let staleProbeDone = false;

  while (Date.now() < deadline && accepted + rejected < 30) {
    const j = { ...job };
    const found = await mineOneShare(j, 8_000_000);
    if (!found) {
      console.log("no share in span, diff", diff);
      continue;
    }
    if (found.stale) {
      console.log("local stale skip (job rotated while mining)", found.jobId);
      continue;
    }
    // If job already rotated, skip submit (mimics our fix)
    if (!job || job.jobId !== found.jobId) {
      console.log("DROP stale before submit", found.jobId, "current", job?.jobId);
      continue;
    }
    const resp = await submit(found.jobId, found.en2, found.ntime, found.nonce);
    console.log(
      "submit",
      found.jobId,
      "nonce",
      found.nonce,
      "->",
      resp.result === true ? "ACCEPT" : "REJECT/timeout",
      "A/R",
      accepted,
      rejected
    );

    // Once we have an accepted share and a rotation happened, probe stale submit once
    if (!staleProbeDone && accepted >= 1 && jobs >= 2) {
      const oldId = found.jobId;
      if (job.jobId !== oldId) {
        console.log("STALE PROBE submit old job", oldId);
        const r = await submit(oldId, found.en2, found.ntime, found.nonce);
        console.log("STALE PROBE result", JSON.stringify(r.error || r.result));
        staleProbeDone = true;
      }
    }
  }

  console.log(
    JSON.stringify(
      { accepted, rejected, submitted, jobs, diff, rejectReasons: rejectReasons.slice(0, 5) },
      null,
      2
    )
  );
  ws.close();
  process.exit(rejected > accepted * 2 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
