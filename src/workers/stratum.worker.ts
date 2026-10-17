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
import { compareHash } from "../lib/bitcoin";

export type StratumWorkerIn =
  | {
      type: "mine";
      workerId: number;
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
  | { type: "stop" };

export type StratumWorkerOut =
  | {
      type: "progress";
      workerId: number;
      hashes: number;
      bestHashHex: string;
    }
  | {
      type: "share";
      workerId: number;
      jobId: string;
      extranonce2: string;
      ntime: string;
      nonceHex: string;
      hashHex: string;
    }
  | { type: "done"; workerId: number };

let stopFlag = false;

self.onmessage = (ev: MessageEvent<StratumWorkerIn>) => {
  const msg = ev.data;
  if (msg.type === "stop") {
    stopFlag = true;
    return;
  }
  if (msg.type !== "mine") return;
  stopFlag = false;

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

  for (let nonce = msg.nonceStart; nonce < msg.nonceEnd && !stopFlag; nonce++) {
    const header = assembleStratumHeader({
      versionHex: msg.version,
      prevhashHex: msg.prevhash,
      merkleRoot: merkle,
      ntimeHex: msg.ntime,
      nbitsHex: msg.nbits,
      nonce,
    });
    const digest = sha256d(header);
    const disp = reverseBytes(digest);
    hashes++;

    if (compareHash(disp, bestDisp) < 0) {
      bestDisp = new Uint8Array(disp);
    }

    if (hashMeetsTargetBE(disp, target)) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "share",
        workerId: msg.workerId,
        jobId: msg.jobId,
        extranonce2: msg.extranonce2,
        ntime: msg.ntime,
        nonceHex: (nonce >>> 0).toString(16).padStart(8, "0"),
        hashHex: bytesToHex(disp),
      } satisfies StratumWorkerOut);
    }

    if (hashes - lastReport >= msg.batchSize) {
      const delta = hashes - lastReport;
      lastReport = hashes;
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "progress",
        workerId: msg.workerId,
        hashes: delta,
        bestHashHex: bytesToHex(bestDisp),
      } satisfies StratumWorkerOut);
    }
  }

  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "progress",
    workerId: msg.workerId,
    hashes: hashes - lastReport,
    bestHashHex: bytesToHex(bestDisp),
  } satisfies StratumWorkerOut);
  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "done",
    workerId: msg.workerId,
  } satisfies StratumWorkerOut);
};

export {};
