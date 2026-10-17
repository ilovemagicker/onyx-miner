import {
  buildMerkleFromCoinbase,
  compareHash,
  type NetworkSnapshot,
} from "./bitcoin";
import { hexToBytes } from "./sha256";
import type { WorkerIn, WorkerOut } from "@/workers/miner.worker";

export type MineStats = {
  hashrate: number;
  totalHashes: number;
  bestHashHex: string;
  bestNonce: number;
  extranonce: number;
  workerCount: number;
  found: boolean;
  foundHashHex?: string;
  foundNonce?: number;
};

type Listener = (s: MineStats) => void;

const NONCE_SPACE = 0x100000000;
const BATCH = 2500;

/** Hard cap for concurrent mining workers. */
export function maxWorkers(): number {
  const hc =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(8, hc));
}

/**
 * Conservative default: 1, or min(2, cores-1) when the device has spare cores.
 * Prefer responsiveness over max hashrate until the user opts into performance mode.
 */
export function suggestedWorkers(): number {
  const hc =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  if (hc <= 1) return 1;
  return Math.min(2, Math.max(1, hc - 1));
}

/** Clamp a user-selected worker count into [1, maxWorkers()]. */
export function clampWorkerCount(n: number): number {
  const max = maxWorkers();
  if (!Number.isFinite(n)) return suggestedWorkers();
  return Math.max(1, Math.min(max, Math.floor(n)));
}

export class MineController {
  private workers: Worker[] = [];
  private running = false;
  private extranonce = 0;
  private totalHashes = 0;
  private bestHashHex = "f".repeat(64);
  private bestNonce = 0;
  private found = false;
  private foundHashHex?: string;
  private foundNonce?: number;
  private windowHashes = 0;
  private windowStart = 0;
  private hashrate = 0;
  private listeners = new Set<Listener>();
  private network: NetworkSnapshot | null = null;
  private address = "";
  private pendingDone = 0;
  private rateTimer: ReturnType<typeof setInterval> | null = null;
  private merkleHex = "";

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  snapshot(): MineStats {
    return {
      hashrate: this.hashrate,
      totalHashes: this.totalHashes,
      bestHashHex: this.bestHashHex,
      bestNonce: this.bestNonce,
      extranonce: this.extranonce,
      workerCount: this.workers.length,
      found: this.found,
      foundHashHex: this.foundHashHex,
      foundNonce: this.foundNonce,
    };
  }

  isRunning() {
    return this.running;
  }

  setAddress(addr: string) {
    this.address = addr.trim();
  }

  start(network: NetworkSnapshot, workerCount?: number) {
    if (this.running) return;
    this.network = network;
    this.running = true;
    this.found = false;
    this.foundHashHex = undefined;
    this.foundNonce = undefined;
    this.totalHashes = 0;
    this.bestHashHex = "f".repeat(64);
    this.bestNonce = 0;
    this.windowHashes = 0;
    this.windowStart = performance.now();
    this.hashrate = 0;
    this.extranonce = 0;

    const n = clampWorkerCount(workerCount ?? suggestedWorkers());
    this.spawnWorkers(n);
    this.rateTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.windowStart) / 1000;
      if (dt > 0) this.hashrate = this.windowHashes / dt;
      this.windowHashes = 0;
      this.windowStart = now;
      this.emit();
    }, 1000);

    this.dispatchRound();
    this.emit();
  }

  stop() {
    this.running = false;
    for (const w of this.workers) {
      try {
        w.postMessage({ type: "stop" } satisfies WorkerIn);
      } catch {
        /* ignore */
      }
      w.terminate();
    }
    this.workers = [];
    if (this.rateTimer) {
      clearInterval(this.rateTimer);
      this.rateTimer = null;
    }
    this.hashrate = 0;
    this.emit();
  }

  private spawnWorkers(n: number) {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(
        new URL("../workers/miner.worker.ts", import.meta.url)
      );
      w.onmessage = (ev: MessageEvent<WorkerOut>) => this.onWorkerMsg(ev.data);
      this.workers.push(w);
    }
  }

  private dispatchRound() {
    if (!this.running || !this.network || this.workers.length === 0) return;
    const net = this.network;
    this.merkleHex = buildMerkleFromCoinbase(this.address, this.extranonce);
    const n = this.workers.length;
    const chunk = Math.floor(NONCE_SPACE / n);
    this.pendingDone = n;

    // Use current wall time for timestamp field (clamped reasonably)
    const timestamp = Math.max(net.timestamp + 1, Math.floor(Date.now() / 1000));

    for (let i = 0; i < n; i++) {
      const nonceStart = i * chunk;
      const nonceEnd = i === n - 1 ? NONCE_SPACE : (i + 1) * chunk;
      const msg: WorkerIn = {
        type: "mine",
        workerId: i,
        version: 0x20000000,
        prevHashHex: net.tipHash,
        merkleHex: this.merkleHex,
        timestamp,
        bits: net.bits,
        targetHex: net.targetHex,
        nonceStart,
        nonceEnd,
        batchSize: BATCH,
      };
      this.workers[i].postMessage(msg);
    }
  }

  private onWorkerMsg(msg: WorkerOut) {
    if (!this.running) return;

    if (msg.type === "progress") {
      this.totalHashes += msg.hashes;
      this.windowHashes += msg.hashes;
      try {
        const best = hexToBytes(msg.bestHashHex);
        const cur = hexToBytes(this.bestHashHex);
        if (compareHash(best, cur) < 0) {
          this.bestHashHex = msg.bestHashHex;
          this.bestNonce = msg.bestNonce;
        }
      } catch {
        /* ignore bad hex */
      }
      this.emit();
      return;
    }

    if (msg.type === "found") {
      this.found = true;
      this.foundHashHex = msg.hashHex;
      this.foundNonce = msg.nonce;
      this.bestHashHex = msg.hashHex;
      this.bestNonce = msg.nonce;
      this.emit();
      return;
    }

    if (msg.type === "done") {
      this.pendingDone -= 1;
      if (this.pendingDone <= 0 && this.running) {
        this.extranonce += 1;
        this.dispatchRound();
        this.emit();
      }
    }
  }
}
