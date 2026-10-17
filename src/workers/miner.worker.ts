/// <reference lib="webworker" />

import { assembleHeader, compareHash, hashMeetsTarget } from "../lib/bitcoin";
import {
  bytesToHex,
  hexToBytes,
  reverseBytes,
  sha256d,
} from "../lib/sha256";

export type WorkerIn =
  | {
      type: "mine";
      workerId: number;
      version: number;
      prevHashHex: string;
      merkleHex: string;
      timestamp: number;
      bits: number;
      targetHex: string;
      nonceStart: number;
      nonceEnd: number;
      batchSize: number;
    }
  | { type: "stop" };

export type WorkerOut =
  | {
      type: "progress";
      workerId: number;
      hashes: number;
      bestHashHex: string;
      bestNonce: number;
      lastNonce: number;
    }
  | {
      type: "found";
      workerId: number;
      nonce: number;
      hashHex: string;
      headerHex: string;
    }
  | { type: "done"; workerId: number; hashes: number };

let stopFlag = false;

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === "stop") {
    stopFlag = true;
    return;
  }
  if (msg.type !== "mine") return;
  stopFlag = false;

  const target = hexToBytes(msg.targetHex);
  // best in display/numeric order (reversed digest) — lower is better
  let bestDisp = new Uint8Array(32).fill(0xff);
  let bestNonce = msg.nonceStart;
  let hashes = 0;
  let lastReport = 0;

  for (let nonce = msg.nonceStart; nonce < msg.nonceEnd && !stopFlag; nonce++) {
    const header = assembleHeader({
      version: msg.version,
      prevHashHex: msg.prevHashHex,
      merkleHex: msg.merkleHex,
      timestamp: msg.timestamp,
      bits: msg.bits,
      nonce,
    });
    const digest = sha256d(header);
    const disp = reverseBytes(digest);
    hashes++;

    if (compareHash(disp, bestDisp) < 0) {
      bestDisp = new Uint8Array(disp);
      bestNonce = nonce;
    }

    if (hashMeetsTarget(disp, target)) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "found",
        workerId: msg.workerId,
        nonce,
        hashHex: bytesToHex(disp),
        headerHex: bytesToHex(header),
      } satisfies WorkerOut);
    }

    if (hashes - lastReport >= msg.batchSize) {
      const delta = hashes - lastReport;
      lastReport = hashes;
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "progress",
        workerId: msg.workerId,
        hashes: delta,
        bestHashHex: bytesToHex(bestDisp),
        bestNonce,
        lastNonce: nonce,
      } satisfies WorkerOut);
    }
  }

  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "progress",
    workerId: msg.workerId,
    hashes: hashes - lastReport,
    bestHashHex: bytesToHex(bestDisp),
    bestNonce,
    lastNonce: Math.max(msg.nonceStart, msg.nonceEnd - 1),
  } satisfies WorkerOut);

  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "done",
    workerId: msg.workerId,
    hashes,
  } satisfies WorkerOut);
};

export {};
