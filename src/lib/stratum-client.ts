import { PROXY_WS_URL, type PoolInfo } from "./pools";

export type StratumJob = {
  jobId: string;
  prevhash: string;
  coinb1: string;
  coinb2: string;
  merkleBranches: string[];
  version: string;
  nbits: string;
  ntime: string;
  cleanJobs: boolean;
};

type Handler = {
  onStatus?: (s: string) => void;
  onError?: (e: string) => void;
  onDifficulty?: (d: number) => void;
  onJob?: (job: StratumJob) => void;
  onAuthorized?: (ok: boolean) => void;
  onSubmitResult?: (id: number, accepted: boolean, error?: string) => void;
};

export class StratumClient {
  private ws: WebSocket | null = null;
  private nextId = 3;
  private pending = new Map<
    number,
    { type: "submit"; nonce: number }
  >();
  private extranonce1 = "";
  private extranonce2Size = 4;
  private difficulty = 1;
  private handlers: Handler = {};
  private connected = false;
  /** Last suggest_difficulty value (NerdMiner-compatible keepalive). */
  private suggestDiff = 0.00015;
  private suggestKeepalive: ReturnType<typeof setInterval> | null = null;

  getExtranonce1() {
    return this.extranonce1;
  }
  getExtranonce2Size() {
    return this.extranonce2Size;
  }
  getDifficulty() {
    return this.difficulty;
  }
  isConnected() {
    return this.connected;
  }

  setHandlers(h: Handler) {
    this.handlers = h;
  }

  async connect(pool: PoolInfo, user: string, password: string, suggestDiff = 0.00015) {
    await this.close();
    const userAgent = pool.userAgent || "onyx-miner/1.3";
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(PROXY_WS_URL);
      this.ws = ws;
      let settled = false;

      const fail = (msg: string) => {
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
        this.handlers.onError?.(msg);
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({ type: "connect", host: pool.host, port: pool.port })
        );
      };

      ws.onerror = () => fail("websocket_error");
      ws.onclose = () => {
        this.connected = false;
        this.handlers.onStatus?.("closed");
      };

      ws.onmessage = (ev) => {
        const raw = String(ev.data);
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        // Proxy control
        if (msg.type === "error") {
          fail(String(msg.message || "proxy_error"));
          return;
        }
        if (msg.type === "status") {
          if (msg.state === "connected") {
            this.handlers.onStatus?.("tcp_connected");
            this.send({
              id: 1,
              method: "mining.subscribe",
              params: [userAgent],
            });
          } else if (msg.state === "tcp_closed") {
            this.connected = false;
            this.handlers.onStatus?.("tcp_closed");
          }
          return;
        }

        // Stratum responses / notifies
        if (msg.method === "mining.set_difficulty") {
          const d = Number((msg.params as number[])?.[0]);
          if (d > 0) {
            this.difficulty = d;
            this.handlers.onDifficulty?.(d);
          }
          return;
        }
        if (msg.method === "mining.notify") {
          const p = msg.params as unknown[];
          if (!p || p.length < 8) return;
          const job: StratumJob = {
            jobId: String(p[0]),
            prevhash: String(p[1]),
            coinb1: String(p[2]),
            coinb2: String(p[3]),
            merkleBranches: (p[4] as string[]) || [],
            version: String(p[5]),
            nbits: String(p[6]),
            ntime: String(p[7]),
            cleanJobs: Boolean(p[8]),
          };
          this.handlers.onJob?.(job);
          return;
        }

        if (msg.id === 1) {
          // Valid subscribe: [ [subs], extranonce1, extranonce2_size ]
          // Some pools (e.g. nerdminers.org) reject UA with a *string* result
          // and error:null — must not treat that as success.
          if (!Array.isArray(msg.result)) {
            fail(
              `subscribe_rejected: ${
                typeof msg.result === "string"
                  ? msg.result
                  : JSON.stringify(msg.error || msg.result)
              }`
            );
            return;
          }
          const result = msg.result as unknown[];
          this.extranonce1 = String(result[1] || "");
          const en2 = Number(result[2]);
          this.extranonce2Size = Number.isFinite(en2) && en2 > 0 ? en2 : 4;
          this.suggestDiff = suggestDiff;
          // NerdMiner order: authorize first, then suggest_difficulty
          this.send({
            id: 2,
            method: "mining.authorize",
            params: [user, password || "x"],
          });
          this.sendSuggestDifficulty();
          this.armSuggestKeepalive();
          return;
        }

        if (msg.id === 2) {
          const ok = msg.result === true && !msg.error;
          this.connected = ok;
          this.handlers.onAuthorized?.(ok);
          if (ok) {
            if (!settled) {
              settled = true;
              resolve();
            }
            this.handlers.onStatus?.("authorized");
          } else {
            fail(
              `authorize_failed: ${JSON.stringify(msg.error || msg.result)}`
            );
          }
          return;
        }

        if (typeof msg.id === "number" && this.pending.has(msg.id)) {
          const accepted = msg.result === true && !msg.error;
          const err = msg.error
            ? JSON.stringify(msg.error)
            : accepted
              ? undefined
              : "rejected";
          this.pending.delete(msg.id);
          this.handlers.onSubmitResult?.(msg.id, accepted, err);
        }
      };
    });
  }

  submit(opts: {
    user: string;
    jobId: string;
    extranonce2: string;
    ntime: string;
    nonceHex: string;
  }): number {
    const id = this.nextId++;
    this.pending.set(id, { type: "submit", nonce: parseInt(opts.nonceHex, 16) });
    this.send({
      id,
      method: "mining.submit",
      params: [
        opts.user,
        opts.jobId,
        opts.extranonce2,
        opts.ntime,
        opts.nonceHex,
      ],
    });
    return id;
  }

  private send(obj: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj) + "\n");
  }

  /** mining.suggest_difficulty — same as NerdMiner DEFAULT_DIFFICULTY path. */
  private sendSuggestDifficulty() {
    const id = this.nextId++;
    this.send({
      id,
      method: "mining.suggest_difficulty",
      params: [this.suggestDiff],
    });
  }

  /** NerdMiner re-sends suggest ~every 30s as keepalive / re-negotiate. */
  private armSuggestKeepalive() {
    this.clearSuggestKeepalive();
    this.suggestKeepalive = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.sendSuggestDifficulty();
    }, 30_000);
  }

  private clearSuggestKeepalive() {
    if (this.suggestKeepalive) {
      clearInterval(this.suggestKeepalive);
      this.suggestKeepalive = null;
    }
  }

  async close() {
    this.connected = false;
    this.clearSuggestKeepalive();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.pending.clear();
  }
}
