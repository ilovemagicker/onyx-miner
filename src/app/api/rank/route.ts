import { NextResponse } from "next/server";
import {
  getSupabaseRestConfig,
  supabaseHeaders,
} from "@/lib/supabase-server";
import {
  boardFromEntries,
  type RankEntry,
  type RankSort,
  walletRankKey,
} from "@/lib/rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbRow = {
  wallet: string;
  accepted: number | string;
  peak_hashrate: number | string;
  updated_at: string;
};

function rowToEntry(row: DbRow): RankEntry | null {
  const wallet = typeof row.wallet === "string" ? row.wallet : "";
  const accepted = Number(row.accepted);
  const peakHashrate = Number(row.peak_hashrate);
  const updatedAt = Date.parse(row.updated_at);
  if (!wallet || !Number.isFinite(accepted) || accepted < 0) return null;
  return {
    wallet,
    accepted: Math.floor(accepted),
    peakHashrate:
      Number.isFinite(peakHashrate) && peakHashrate > 0 ? peakHashrate : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function parseSort(raw: string | null): RankSort {
  return raw === "hashrate" ? "hashrate" : "accepted";
}

/** Soft IP rate limit (best-effort per isolate). */
const ipHits = new Map<string, { t: number; n: number }>();
function allowIp(ip: string, max = 120): boolean {
  const now = Date.now();
  const cur = ipHits.get(ip);
  if (!cur || now - cur.t > 60_000) {
    ipHits.set(ip, { t: now, n: 1 });
    return true;
  }
  if (cur.n >= max) return false;
  cur.n += 1;
  return true;
}

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sort = parseSort(url.searchParams.get("sort"));
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Math.min(
      50,
      Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20)
    );

    const { url: base, key } = getSupabaseRestConfig();
    const order =
      sort === "hashrate"
        ? "peak_hashrate.desc,accepted.desc"
        : "accepted.desc,peak_hashrate.desc";
    const endpoint = `${base}/rest/v1/miner_leaderboard?select=wallet,accepted,peak_hashrate,updated_at&order=${order}&limit=${limit}`;
    const res = await fetch(endpoint, {
      headers: supabaseHeaders(key),
      cache: "no-store",
    });
    const payload = await readJsonSafe(res);
    if (!res.ok) {
      const detail =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message: unknown }).message)
          : `http_${res.status}`;
      return NextResponse.json(
        { error: "rank_fetch_failed", detail },
        { status: 502 }
      );
    }

    const rows = Array.isArray(payload) ? (payload as DbRow[]) : [];
    const entries: RankEntry[] = [];
    for (const row of rows) {
      const e = rowToEntry(row);
      if (e) entries.push(e);
    }

    return NextResponse.json(
      {
        version: 1 as const,
        sort,
        board: boardFromEntries(entries),
        fetchedAt: Date.now(),
        disclaimer: "shares_not_payouts",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const status = message === "supabase_env_missing" ? 503 : 500;
    return NextResponse.json(
      { error: "rank_fetch_failed", detail: message },
      { status }
    );
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allowIp(ip, 90)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const obj = body as {
    wallet?: unknown;
    acceptedDelta?: unknown;
    peakHashrate?: unknown;
  };

  const walletRaw = typeof obj.wallet === "string" ? obj.wallet : "";
  const wallet = walletRankKey(walletRaw);
  if (!wallet) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }

  let acceptedDelta = 0;
  if (obj.acceptedDelta !== undefined && obj.acceptedDelta !== null) {
    const n = Number(obj.acceptedDelta);
    if (!Number.isFinite(n) || n < 0 || n > 25 || Math.floor(n) !== n) {
      return NextResponse.json({ error: "delta_out_of_range" }, { status: 400 });
    }
    acceptedDelta = n;
  }

  let peakHashrate: number | null = null;
  if (obj.peakHashrate !== undefined && obj.peakHashrate !== null) {
    const n = Number(obj.peakHashrate);
    if (!Number.isFinite(n) || n <= 0 || n > 1e12) {
      return NextResponse.json({ error: "peak_out_of_range" }, { status: 400 });
    }
    peakHashrate = n;
  }

  if (acceptedDelta === 0 && peakHashrate === null) {
    return NextResponse.json({ error: "empty_report" }, { status: 400 });
  }

  try {
    const { url: base, key } = getSupabaseRestConfig();
    const res = await fetch(`${base}/rest/v1/rpc/report_miner_rank`, {
      method: "POST",
      headers: supabaseHeaders(key, { Prefer: "return=representation" }),
      body: JSON.stringify({
        p_wallet: walletRaw,
        p_accepted_delta: acceptedDelta,
        p_peak_hashrate: peakHashrate,
      }),
      cache: "no-store",
    });
    const payload = await readJsonSafe(res);
    if (!res.ok) {
      const msg =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message: unknown }).message)
          : `http_${res.status}`;
      if (/rate_limited/i.test(msg)) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      if (
        /invalid_wallet|delta_out_of_range|peak_out_of_range|empty_report/i.test(
          msg
        )
      ) {
        return NextResponse.json(
          { error: "invalid_report", detail: msg },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "rank_report_failed", detail: msg },
        { status: 502 }
      );
    }

    const row = (Array.isArray(payload) ? payload[0] : payload) as DbRow | null;
    const entry = row ? rowToEntry(row) : null;
    return NextResponse.json({
      ok: true,
      entry,
      disclaimer: "shares_not_payouts",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const status = message === "supabase_env_missing" ? 503 : 500;
    return NextResponse.json(
      { error: "rank_report_failed", detail: message },
      { status }
    );
  }
}
