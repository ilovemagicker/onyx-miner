import { compareHash } from "./bitcoin";
import { formatExtranonce2, shareMeetsNetworkTarget } from "./stratum-math";
import { hexToBytes } from "./sha256";
import { StratumClient, type StratumJob } from "./stratum-client";
import type { PoolInfo } from "./pools";
import type { StratumWorkerIn, StratumWorkerOut } from "@/workers/stratum.worker";
import { clampWorkerCount, suggestedWorkers } from "./mine-controller";

export type PoolMineStats = {
  hashrate: number;
  totalHashes: number;
  bestHashHex: string;
  difficulty: number;
  accepted: number;
  rejected: number;
  submitted: number;
  /** Shares found for an old job/epoch and never sent to the pool. */
  staleDropped: number;
  jobs: number;
  status: string;
  workerCount: number;
  lastShareHash?: string;
  lastError?: string;
  /** Set when an Accepted share also meets job nbits network target (rare). */
  possibleBlockHint?: { hashHex: string; at: number };
};

type Listener = (s: PoolMineStats) => void;

const NONCE_SPACE = 0x100000000;
const BATCH = 2500;
/** If authorized but no mining.notify yet, surface a waiting hint. */
const JOB_WAIT_MS = 5000;

export class PoolMineController {
  private client = new StratumClient();
  private workers: Worker[] = [];
  private running = false;
  private job: StratumJob | null = null;
  private extranonce2Counter = 0;
  private user = "";
  private totalHashes = 0;
  private bestHashHex = "f".repeat(64);
  private difficulty = 1;
  private accepted = 0;
  private rejected = 0;
  private submitted = 0;
  private staleDropped = 0;
  /** jobId|en2|nonceHex — drop duplicate submits (NerdMiners "Duplicate"). */
  private submittedKeys = new Set<string>();
  private jobs = 0;
  private status = "idle";
  private lastShareHash?: string;
  private lastError?: string;
  private possibleBlockHint?: { hashHex: string; at: number };
  /** submit id → share hash + job nbits for post-accept network-target check */
  private pendingShares = new Map<number, { hashHex: string; nbits: string }>();
  private windowHashes = 0;
  private windowStart = 0;
  private hashrate = 0;
  private listeners = new Set<Listener>();
  private rateTimer: ReturnType<typeof setInterval> | null = null;
  private jobWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDone = 0;
  /** Bumped on every new job / difficulty re-dispatch; workers echo it back. */
  private jobEpoch = 0;
  private algo: import("./pools").AlgoId = "sha256d";

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  snapshot(): PoolMineStats {
    return {
      hashrate: this.hashrate,
      totalHashes: this.totalHashes,
      bestHashHex: this.bestHashHex,
      difficulty: this.difficulty,
      accepted: this.accepted,
      rejected: this.rejected,
      submitted: this.submitted,
      staleDropped: this.staleDropped,
      jobs: this.jobs,
      status: this.status,
      workerCount: this.workers.length,
      lastShareHash: this.lastShareHash,
      lastError: this.lastError,
      possibleBlockHint: this.possibleBlockHint,
    };
  }

  isRunning() {
    return this.running;
  }

  async start(
    pool: PoolInfo,
    user: string,
    password?: string,
    workerCount?: number
  ) {
    if (this.running) return;
    this.user = user.trim();
    this.algo = pool.algo;
    this.running = true;
    this.job = null;
    this.totalHashes = 0;
    this.bestHashHex = "f".repeat(64);
    this.accepted = 0;
    this.rejected = 0;
    this.submitted = 0;
    this.staleDropped = 0;
    this.submittedKeys.clear();
    this.jobs = 0;
    this.jobEpoch = 0;
    this.lastError = undefined;
    this.lastShareHash = undefined;
    this.possibleBlockHint = undefined;
    this.pendingShares.clear();
    this.windowHashes = 0;
    this.windowStart = performance.now();
    this.hashrate = 0;
    this.extranonce2Counter = 0;
    this.status = "connecting";
    this.emit();

    // Spawn workers BEFORE connect so an early mining.notify can dispatch.
    // Scrypt is heavy — soft-cap at 4 unless the user picked lower.
    const requested = clampWorkerCount(workerCount ?? suggestedWorkers());
    const nWorkers =
      this.algo === "scrypt" ? Math.min(4, requested) : requested;
    this.spawnWorkers(nWorkers);
    this.rateTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.windowStart) / 1000;
      if (dt > 0) this.hashrate = this.windowHashes / dt;
      this.windowHashes = 0;
      this.windowStart = now;
      this.emit();
    }, 1000);
    this.emit();

    this.client.setHandlers({
      onStatus: (s) => {
        // Don't clobber mining / waiting_job with intermediate proxy labels
        // except during connect / terminal states.
        if (
          s === "tcp_connected" ||
          s === "connecting" ||
          s === "closed" ||
          s === "tcp_closed"
        ) {
          if (this.status === "connecting" || s === "closed" || s === "tcp_closed") {
            this.status = s === "tcp_connected" ? "connecting" : s;
            if ((s === "closed" || s === "tcp_closed") && this.jobs > 0) {
              this.lastError =
                this.lastError ||
                "pool_tcp_closed: 礦池斷線（可能拒 UA／協定）。請改 NerdMiners.org 或 SoloMining.de 並硬重新整理。";
            }
          }
        } else if (s === "authorized" && this.jobs === 0) {
          this.status = "authorized";
          this.armJobWaitWatch();
        }
        this.emit();
      },
      onError: (e) => {
        this.lastError = e;
        this.status = "error";
        this.clearJobWaitWatch();
        this.emit();
      },
      onDifficulty: (d) => {
        this.difficulty = d;
        this.emit();
        // Difficulty change invalidates in-flight work at the old target.
        if (this.job) this.dispatchRound({ abortPrevious: true });
      },
      onAuthorized: (ok) => {
        if (ok) {
          this.status = this.jobs > 0 ? "mining" : "authorized";
          if (this.jobs === 0) this.armJobWaitWatch();
          // Job may have arrived before authorize; ensure workers are hashing.
          if (this.job) this.dispatchRound({ abortPrevious: true });
        } else {
          this.status = "auth_failed";
          this.clearJobWaitWatch();
        }
        this.emit();
      },
      onJob: (job) => {
        this.job = job;
        this.jobs += 1;
        this.status = "mining";
        this.clearJobWaitWatch();
        if (job.cleanJobs) this.extranonce2Counter = 0;
        this.difficulty = this.client.getDifficulty();
        // New notify → abort old nonce search immediately (NerdMiners stale reject).
        this.dispatchRound({ abortPrevious: true });
        this.emit();
      },
      onSubmitResult: (id, accepted, error) => {
        const meta = this.pendingShares.get(id);
        this.pendingShares.delete(id);
        if (accepted) {
          this.accepted += 1;
          if (
            meta &&
            shareMeetsNetworkTarget(meta.hashHex, meta.nbits)
          ) {
            this.possibleBlockHint = {
              hashHex: meta.hashHex,
              at: Date.now(),
            };
          }
        } else {
          this.rejected += 1;
          if (error) this.lastError = error;
        }
        this.emit();
      },
    });

    try {
      await this.client.connect(pool, this.user, password || pool.password, 0.00015);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.status = "error";
      this.running = false;
      this.clearJobWaitWatch();
      this.teardownWorkers();
      this.emit();
      return;
    }

    // Safety: job may have been stored while workers were already up, or
    // connect resolved before onJob finished dispatching — re-dispatch.
    if (this.running && this.job) {
      this.dispatchRound({ abortPrevious: true });
    } else if (this.running && this.jobs === 0) {
      this.status = "authorized";
      this.armJobWaitWatch();
    }

    this.emit();
  }

  stop() {
    this.running = false;
    this.status = "idle";
    this.job = null;
    this.pendingShares.clear();
    this.jobEpoch += 1; // invalidate any in-flight worker messages
    this.abortWorkers();
    this.clearJobWaitWatch();
    void this.client.close();
    this.teardownWorkers();
    if (this.rateTimer) {
      clearInterval(this.rateTimer);
      this.rateTimer = null;
    }
    this.hashrate = 0;
    this.emit();
  }

  private armJobWaitWatch() {
    this.clearJobWaitWatch();
    this.jobWaitTimer = setTimeout(() => {
      this.jobWaitTimer = null;
      if (!this.running || this.jobs > 0) return;
      if (
        this.status === "authorized" ||
        this.status === "connecting" ||
        this.status === "tcp_connected"
      ) {
        this.status = "waiting_job";
        this.emit();
      }
    }, JOB_WAIT_MS);
  }

  private clearJobWaitWatch() {
    if (this.jobWaitTimer) {
      clearTimeout(this.jobWaitTimer);
      this.jobWaitTimer = null;
    }
  }

  private abortWorkers() {
    for (const w of this.workers) {
      try {
        w.postMessage({ type: "stop", epoch: this.jobEpoch } satisfies StratumWorkerIn);
      } catch {
        /* ignore */
      }
    }
  }

  private teardownWorkers() {
    this.abortWorkers();
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers = [];
  }

  private spawnWorkers(n: number) {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(
        new URL("../workers/stratum.worker.ts", import.meta.url)
      );
      w.onmessage = (ev: MessageEvent<StratumWorkerOut>) =>
        this.onWorkerMsg(ev.data);
      this.workers.push(w);
    }
  }

  private dispatchRound(_opts?: { abortPrevious?: boolean }) {
    if (!this.running || !this.job || this.workers.length === 0) return;
    const job = this.job;

    // Always bump epoch + stop in-flight work. Covers new notify, difficulty
    // change, and extranonce2 rollover — prevents stale job_id submits and
    // pendingDone double-counts when workers finish an aborted round.
    this.jobEpoch += 1;
    this.abortWorkers();

    const epoch = this.jobEpoch;
    const n = this.workers.length;
    const chunk = Math.floor(NONCE_SPACE / n);
    this.pendingDone = n;
    const en2 = formatExtranonce2(
      this.extranonce2Counter++,
      this.client.getExtranonce2Size()
    );

    for (let i = 0; i < n; i++) {
      const nonceStart = i * chunk;
      const nonceEnd = i === n - 1 ? NONCE_SPACE : (i + 1) * chunk;
      const batch = this.algo === "scrypt" ? 32 : BATCH;
      const msg: StratumWorkerIn = {
        type: "mine",
        workerId: i,
        epoch,
        algo: this.algo,
        jobId: job.jobId,
        prevhash: job.prevhash,
        coinb1: job.coinb1,
        coinb2: job.coinb2,
        merkleBranches: job.merkleBranches,
        version: job.version,
        nbits: job.nbits,
        ntime: job.ntime,
        extranonce1: this.client.getExtranonce1(),
        extranonce2: en2,
        difficulty: this.difficulty,
        nonceStart,
        nonceEnd,
        batchSize: batch,
      };
      this.workers[i].postMessage(msg);
    }
  }

  private onWorkerMsg(msg: StratumWorkerOut) {
    if (!this.running) return;

    // Drop everything from an aborted epoch (stale job / old difficulty).
    if (msg.epoch !== this.jobEpoch) {
      if (msg.type === "share") {
        this.staleDropped += 1;
        this.emit();
      }
      return;
    }

    if (msg.type === "progress") {
      this.totalHashes += msg.hashes;
      this.windowHashes += msg.hashes;
      try {
        const best = hexToBytes(msg.bestHashHex);
        const cur = hexToBytes(this.bestHashHex);
        if (compareHash(best, cur) < 0) this.bestHashHex = msg.bestHashHex;
      } catch {
        /* ignore */
      }
      this.emit();
      return;
    }

    if (msg.type === "share") {
      // Belt-and-suspenders: job id must still match the active notify.
      if (!this.job || msg.jobId !== this.job.jobId) {
        this.staleDropped += 1;
        this.emit();
        return;
      }
      const key = `${msg.jobId}|${msg.extranonce2}|${msg.nonceHex}`;
      if (this.submittedKeys.has(key)) {
        this.staleDropped += 1;
        this.emit();
        return;
      }
      // Bound memory: keep recent keys only.
      if (this.submittedKeys.size > 4000) this.submittedKeys.clear();
      this.submittedKeys.add(key);
      this.submitted += 1;
      this.lastShareHash = msg.hashHex;
      const submitId = this.client.submit({
        user: this.user,
        jobId: msg.jobId,
        extranonce2: msg.extranonce2,
        ntime: msg.ntime,
        nonceHex: msg.nonceHex,
      });
      this.pendingShares.set(submitId, {
        hashHex: msg.hashHex,
        nbits: this.job.nbits,
      });
      // Bound memory if pool never replies.
      if (this.pendingShares.size > 200) {
        const first = this.pendingShares.keys().next().value;
        if (first !== undefined) this.pendingShares.delete(first);
      }
      this.emit();
      return;
    }

    if (msg.type === "done") {
      this.pendingDone -= 1;
      if (this.pendingDone <= 0 && this.running && this.job) {
        // Next extranonce2 on the same notify (epoch bumps inside dispatchRound).
        this.dispatchRound();
      }
    }
  }
}
