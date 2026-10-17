import { compareHash } from "./bitcoin";
import { formatExtranonce2 } from "./stratum-math";
import { hexToBytes } from "./sha256";
import { StratumClient, type StratumJob } from "./stratum-client";
import type { PoolInfo } from "./pools";
import type { StratumWorkerIn, StratumWorkerOut } from "@/workers/stratum.worker";
import { suggestedWorkers } from "./mine-controller";

export type PoolMineStats = {
  hashrate: number;
  totalHashes: number;
  bestHashHex: string;
  difficulty: number;
  accepted: number;
  rejected: number;
  submitted: number;
  jobs: number;
  status: string;
  workerCount: number;
  lastShareHash?: string;
  lastError?: string;
};

type Listener = (s: PoolMineStats) => void;

const NONCE_SPACE = 0x100000000;
const BATCH = 2500;

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
  private jobs = 0;
  private status = "idle";
  private lastShareHash?: string;
  private lastError?: string;
  private windowHashes = 0;
  private windowStart = 0;
  private hashrate = 0;
  private listeners = new Set<Listener>();
  private rateTimer: ReturnType<typeof setInterval> | null = null;
  private pendingDone = 0;
  private jobEpoch = 0;

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
      jobs: this.jobs,
      status: this.status,
      workerCount: this.workers.length,
      lastShareHash: this.lastShareHash,
      lastError: this.lastError,
    };
  }

  isRunning() {
    return this.running;
  }

  async start(pool: PoolInfo, user: string, password?: string) {
    if (this.running) return;
    this.user = user.trim();
    this.running = true;
    this.totalHashes = 0;
    this.bestHashHex = "f".repeat(64);
    this.accepted = 0;
    this.rejected = 0;
    this.submitted = 0;
    this.jobs = 0;
    this.lastError = undefined;
    this.lastShareHash = undefined;
    this.windowHashes = 0;
    this.windowStart = performance.now();
    this.hashrate = 0;
    this.extranonce2Counter = 0;
    this.status = "connecting";
    this.emit();

    this.client.setHandlers({
      onStatus: (s) => {
        this.status = s;
        this.emit();
      },
      onError: (e) => {
        this.lastError = e;
        this.status = "error";
        this.emit();
      },
      onDifficulty: (d) => {
        this.difficulty = d;
        this.emit();
        // restart round with new target
        if (this.job) this.dispatchRound();
      },
      onAuthorized: (ok) => {
        this.status = ok ? "authorized" : "auth_failed";
        this.emit();
      },
      onJob: (job) => {
        this.job = job;
        this.jobs += 1;
        this.status = "mining";
        if (job.cleanJobs) this.extranonce2Counter = 0;
        this.difficulty = this.client.getDifficulty();
        this.dispatchRound();
        this.emit();
      },
      onSubmitResult: (_id, accepted, error) => {
        if (accepted) this.accepted += 1;
        else {
          this.rejected += 1;
          if (error) this.lastError = error;
        }
        this.emit();
      },
    });

    try {
      await this.client.connect(pool, this.user, password || pool.password, 0.01);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.status = "error";
      this.running = false;
      this.emit();
      return;
    }

    this.spawnWorkers(suggestedWorkers());
    this.rateTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.windowStart) / 1000;
      if (dt > 0) this.hashrate = this.windowHashes / dt;
      this.windowHashes = 0;
      this.windowStart = now;
      this.emit();
    }, 1000);

    this.emit();
  }

  stop() {
    this.running = false;
    this.status = "idle";
    void this.client.close();
    for (const w of this.workers) {
      try {
        w.postMessage({ type: "stop" } satisfies StratumWorkerIn);
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
        new URL("../workers/stratum.worker.ts", import.meta.url)
      );
      w.onmessage = (ev: MessageEvent<StratumWorkerOut>) =>
        this.onWorkerMsg(ev.data);
      this.workers.push(w);
    }
  }

  private dispatchRound() {
    if (!this.running || !this.job || this.workers.length === 0) return;
    const job = this.job;
    const epoch = ++this.jobEpoch;
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
      const msg: StratumWorkerIn = {
        type: "mine",
        workerId: i,
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
        batchSize: BATCH,
      };
      // tag epoch on worker via closure — ignore stale dones
      (this.workers[i] as Worker & { __epoch?: number }).__epoch = epoch;
      this.workers[i].postMessage(msg);
    }
  }

  private onWorkerMsg(msg: StratumWorkerOut) {
    if (!this.running) return;
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
      this.submitted += 1;
      this.lastShareHash = msg.hashHex;
      this.client.submit({
        user: this.user,
        jobId: msg.jobId,
        extranonce2: msg.extranonce2,
        ntime: msg.ntime,
        nonceHex: msg.nonceHex,
      });
      this.emit();
      return;
    }
    if (msg.type === "done") {
      this.pendingDone -= 1;
      if (this.pendingDone <= 0 && this.running && this.job) {
        this.dispatchRound();
      }
    }
  }
}
