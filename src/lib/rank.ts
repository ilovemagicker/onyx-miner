/**
 * Wallet-keyed global rank helpers for Accepted shares + peak hashrate.
 * Server stores the board (Supabase); these pure helpers shape UI / API.
 * Same payout address with different .worker suffixes aggregates.
 * Does not imply pool payouts.
 */

export type RankEntry = {
  wallet: string;
  accepted: number;
  peakHashrate: number;
  updatedAt: number;
};

export type RankBoard = {
  version: 1;
  entries: Record<string, RankEntry>;
};

export type RankSort = "accepted" | "hashrate";

export function walletRankKey(raw: string): string {
  const base = raw.trim().split(".")[0]?.trim() ?? "";
  if (!base) return "";
  // Bech32 is case-insensitive; normalize for stable keys.
  if (/^(bc1|tb1|bcrt1|ltc1)/i.test(base)) return base.toLowerCase();
  return base;
}

export function emptyRankBoard(): RankBoard {
  return { version: 1, entries: {} };
}

export function boardFromEntries(list: RankEntry[]): RankBoard {
  const entries: Record<string, RankEntry> = {};
  for (const e of list) {
    if (!e?.wallet) continue;
    entries[e.wallet] = e;
  }
  return { version: 1, entries };
}

export function parseRankBoard(raw: unknown): RankBoard {
  if (!raw || typeof raw !== "object") return emptyRankBoard();
  const obj = raw as { version?: unknown; entries?: unknown };
  if (obj.version !== 1 || !obj.entries || typeof obj.entries !== "object") {
    return emptyRankBoard();
  }
  const entries: Record<string, RankEntry> = {};
  for (const [k, v] of Object.entries(obj.entries as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Partial<RankEntry>;
    const wallet = typeof e.wallet === "string" ? e.wallet : k;
    const accepted = Number(e.accepted);
    const peakHashrate = Number(e.peakHashrate);
    const updatedAt = Number(e.updatedAt);
    if (!wallet || !Number.isFinite(accepted) || accepted < 0) continue;
    entries[wallet] = {
      wallet,
      accepted: Math.floor(accepted),
      peakHashrate:
        Number.isFinite(peakHashrate) && peakHashrate > 0 ? peakHashrate : 0,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
  }
  return { version: 1, entries };
}

/** Merge a single server entry into a local board snapshot. */
export function upsertRankEntry(
  board: RankBoard,
  entry: RankEntry
): RankBoard {
  return {
    version: 1,
    entries: { ...board.entries, [entry.wallet]: entry },
  };
}

/** Add Accepted share delta for a wallet key. Returns updated entry or null. */
export function addAcceptedShares(
  board: RankBoard,
  walletRaw: string,
  delta: number,
  now = Date.now()
): { board: RankBoard; entry: RankEntry } | null {
  const wallet = walletRankKey(walletRaw);
  if (!wallet || !Number.isFinite(delta) || delta <= 0) return null;
  const prev = board.entries[wallet];
  const entry: RankEntry = {
    wallet,
    accepted: (prev?.accepted ?? 0) + Math.floor(delta),
    peakHashrate: prev?.peakHashrate ?? 0,
    updatedAt: now,
  };
  return {
    board: {
      version: 1,
      entries: { ...board.entries, [wallet]: entry },
    },
    entry,
  };
}

/** Raise peak hashrate if higher. */
export function touchPeakHashrate(
  board: RankBoard,
  walletRaw: string,
  hashrate: number,
  now = Date.now()
): { board: RankBoard; entry: RankEntry } | null {
  const wallet = walletRankKey(walletRaw);
  if (!wallet || !Number.isFinite(hashrate) || hashrate <= 0) return null;
  const prev = board.entries[wallet];
  const peak = Math.max(prev?.peakHashrate ?? 0, hashrate);
  if (prev && peak === prev.peakHashrate) {
    return { board, entry: prev };
  }
  const entry: RankEntry = {
    wallet,
    accepted: prev?.accepted ?? 0,
    peakHashrate: peak,
    updatedAt: now,
  };
  return {
    board: {
      version: 1,
      entries: { ...board.entries, [wallet]: entry },
    },
    entry,
  };
}

export function sortedRank(
  board: RankBoard,
  sort: RankSort,
  limit = 20
): RankEntry[] {
  const list = Object.values(board.entries);
  list.sort((a, b) => {
    if (sort === "accepted") {
      if (b.accepted !== a.accepted) return b.accepted - a.accepted;
      if (b.peakHashrate !== a.peakHashrate) return b.peakHashrate - a.peakHashrate;
      return a.wallet.localeCompare(b.wallet);
    }
    if (b.peakHashrate !== a.peakHashrate) return b.peakHashrate - a.peakHashrate;
    if (b.accepted !== a.accepted) return b.accepted - a.accepted;
    return a.wallet.localeCompare(b.wallet);
  });
  return list.slice(0, limit);
}

export function shortenWallet(wallet: string, head = 6, tail = 4): string {
  if (wallet.length <= head + tail + 1) return wallet;
  return `${wallet.slice(0, head)}…${wallet.slice(-tail)}`;
}

/** Client: fetch global board from /api/rank */
export async function fetchRankBoard(
  sort: RankSort = "accepted",
  limit = 20
): Promise<RankBoard> {
  const res = await fetch(`/api/rank?sort=${sort}&limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rank_http_${res.status}`);
  const data = (await res.json()) as {
    board?: unknown;
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  return parseRankBoard(data.board);
}

/** Client: report Accepted delta and/or peak hashrate */
export async function reportRankProgress(input: {
  wallet: string;
  acceptedDelta?: number;
  peakHashrate?: number;
}): Promise<RankEntry | null> {
  const res = await fetch("/api/rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 429) return null;
  if (!res.ok) throw new Error(`rank_report_${res.status}`);
  const data = (await res.json()) as { entry?: RankEntry | null };
  return data.entry ?? null;
}
