/// <reference lib="webworker" />

import {
  assembleStratumHeader,
  hashMeetsTargetBE,
  merkleFromCoinbase,
  reverseBytes,
  sha256d,
  targetFromDifficulty,
  bytesToHex,
} from "../lib/stratum-math";
import { scryptHeader } from "../lib/scrypt-pow";
import { compareHash } from "../lib/bitcoin";
import type { AlgoId } from "../lib/pools";

export type StratumWorkerIn =
  | {
      type: "mine";
      workerId: number;
      /** Controller epoch — echoed on every outbound message. */
      epoch: number;
      algo: AlgoId;
      jobId: string;
      prevhash: string;
      coinb1: string;
      coinb2: string;
      merkleBranches: string[];
      version: string;
      nbits: string;
      ntime: string;
      extranonce1: string;
      extranonce2: string;
      difficulty: number;
      nonceStart: number;
      nonceEnd: number;
      batchSize: number;
    }
  | { type: "stop"; epoch?: number };

export type StratumWorkerOut =
  | {
      type: "progress";
      workerId: number;
      epoch: number;
      hashes: number;
      bestHashHex: string;
    }
  | {
      type: "share";
      workerId: number;
      epoch: number;
      jobId: string;
      extranonce2: string;
      ntime: string;
      nonceHex: string;
      hashHex: string;
    }
  | { type: "done"; workerId: number; epoch: number };

let stopFlag = false;
/** Epoch of the mine loop currently running (0 = idle). */
let activeEpoch = 0;
let mineGeneration = 0;

function powHash(algo: AlgoId, header: Uint8Array): Uint8Array {
  if (algo === "scrypt") return scryptHeader(header);
  return sha256d(header);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

self.onmessage = (ev: MessageEvent<StratumWorkerIn>) => {
  const msg = ev.data;
  if (msg.type === "stop") {
    stopFlag = true;
    return;
  }
  if (msg.type !== "mine") return;

  // Abort any in-flight mine loop; only the latest generation continues.
  stopFlag = true;
  const gen = ++mineGeneration;
  stopFlag = false;
  activeEpoch = msg.epoch;
  void runMine(msg, gen);
};

async function runMine(msg: Extract<StratumWorkerIn, { type: "mine" }>, gen: number) {
  const target = targetFromDifficulty(msg.difficulty);
  const merkle = merkleFromCoinbase(
    msg.coinb1,
    msg.extranonce1,
    msg.extranonce2,
    msg.coinb2,
    msg.merkleBranches
  );

  let bestDisp = new Uint8Array(32).fill(0xff);
  let hashes = 0;
  let lastReport = 0;
  const batch = Math.max(8, msg.batchSize);
  const epoch = msg.epoch;

  for (let nonce = msg.nonceStart; nonce < msg.nonceEnd; nonce++) {
    if (stopFlag || gen !== mineGeneration) break;

    const header = assembleStratumHeader({
      versionHex: msg.version,
      prevhashHex: msg.prevhash,
      merkleRoot: merkle,
      ntimeHex: msg.ntime,
      nbitsHex: msg.nbits,
      nonce,
    });
    const digest = powHash(msg.algo, header);
    const disp = reverseBytes(digest);
    hashes++;

    if (compareHash(disp, bestDisp) < 0) {
      bestDisp = new Uint8Array(disp);
    }

    if (hashMeetsTargetBE(disp, target)) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "share",
        workerId: msg.workerId,
        epoch,
        jobId: msg.jobId,
        extranonce2: msg.extranonce2,
        ntime: msg.ntime,
        nonceHex: (nonce >>> 0).toString(16).padStart(8, "0"),
        hashHex: bytesToHex(disp),
      } satisfies StratumWorkerOut);
    }

    if (hashes - lastReport >= batch) {
      const delta = hashes - lastReport;
      lastReport = hashes;
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "progress",
        workerId: msg.workerId,
        epoch,
        hashes: delta,
        bestHashHex: bytesToHex(bestDisp),
      } satisfies StratumWorkerOut);
      // Yield so stop / newer mine messages can be processed (stale-job fix).
      await yieldToEventLoop();
      if (stopFlag || gen !== mineGeneration) break;
    }
  }

  // Only the latest generation reports final progress/done for its epoch.
  if (gen !== mineGeneration) return;

  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "progress",
    workerId: msg.workerId,
    epoch,
    hashes: hashes - lastReport,
    bestHashHex: bytesToHex(bestDisp),
  } satisfies StratumWorkerOut);
  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "done",
    workerId: msg.workerId,
    epoch,
  } satisfies StratumWorkerOut);
}

export {};
