import type { PoolInfo } from "./pools";

/** Build Stratum username/password for the selected pool + addresses. */
export function buildStratumCredentials(opts: {
  pool: PoolInfo;
  address: string;
  password: string;
  mergeLtc?: string;
}): { user: string; password: string; error?: string } {
  const addr = opts.address.trim();
  const ltc = (opts.mergeLtc || "").trim().split(".")[0];
  const doge = addr.split(".")[0];
  const pass = opts.password.trim() || "x";

  if (opts.pool.coin === "DOGE" && opts.pool.mergeHint === "ltc-for-doge") {
    if (!ltc) {
      return { user: "", password: "", error: "need_ltc_merge" };
    }
    if (opts.pool.id.startsWith("doge-mysolo")) {
      return { user: `${ltc}.${doge}`, password: pass === "DOGE=" || pass === "doge=" ? "x" : pass };
    }
    if (opts.pool.id.startsWith("doge-molepool")) {
      return { user: ltc, password: `doge=${doge}` };
    }
    // LiteSolo-style
    return { user: ltc, password: `DOGE=${doge}` };
  }

  return { user: addr, password: pass };
}
