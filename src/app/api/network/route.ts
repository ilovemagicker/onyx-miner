import { NextResponse } from "next/server";
import { bitsToTarget, difficultyFromBits } from "@/lib/bitcoin";
import { bytesToHex } from "@/lib/sha256";

export const runtime = "edge";
export const revalidate = 0;

type MempoolBlock = {
  id: string;
  height: number;
  version: number;
  timestamp: number;
  bits: number;
  difficulty: number;
  previousblockhash?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`upstream ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export async function GET() {
  try {
    const tipHash = await fetch(
      "https://mempool.space/api/blocks/tip/hash",
      { next: { revalidate: 0 } }
    ).then(async (r) => {
      if (!r.ok) throw new Error(`tip hash ${r.status}`);
      return (await r.text()).trim();
    });

    const block = await fetchJson<MempoolBlock>(
      `https://mempool.space/api/block/${tipHash}`
    );

    const bits = block.bits >>> 0;
    const target = bitsToTarget(bits);
    const difficulty =
      typeof block.difficulty === "number" && block.difficulty > 0
        ? block.difficulty
        : difficultyFromBits(bits);

    return NextResponse.json(
      {
        height: block.height,
        tipHash: block.id,
        prevHash: block.previousblockhash ?? block.id,
        bits,
        bitsHex: bits.toString(16).padStart(8, "0"),
        difficulty,
        targetHex: bytesToHex(target),
        timestamp: block.timestamp,
        version: block.version ?? 0x20000000,
        fetchedAt: Date.now(),
        source: "mempool.space",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "network_fetch_failed", detail: message },
      { status: 502 }
    );
  }
}
