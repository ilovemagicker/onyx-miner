import { bytesToHex, hexToBytes, reverseBytes, sha256d } from "./sha256";
import { compareHash } from "./bitcoin";

/** Difficulty 1 target (Bitcoin): 0x00000000ffff0000... */
export const DIFF1_TARGET = hexToBytes(
  "00000000ffff0000000000000000000000000000000000000000000000000000"
);

/** Share target for a given stratum difficulty (floating). */
export function targetFromDifficulty(diff: number): Uint8Array {
  if (!Number.isFinite(diff) || diff <= 0) return new Uint8Array(DIFF1_TARGET);
  // target = diff1 / diff  (256-bit)
  // Use big-endian byte arithmetic via BigInt
  const d1 = bytesToBig(DIFF1_TARGET);
  const precise = divBigFloat(d1, diff);
  return bigToBytes32(precise);
}

function bytesToBig(b: Uint8Array): bigint {
  let n = BigInt(0);
  for (const x of b) n = (n << BigInt(8)) | BigInt(x);
  return n;
}

function bigToBytes32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & BigInt(0xff));
    x >>= BigInt(8);
  }
  return out;
}

/** Approximate bigint division by float: n / f */
function divBigFloat(n: bigint, f: number): bigint {
  if (f <= 0) return n;
  // n / f = (n * scale) / (f * scale)
  const scale = 1_000_000;
  const denom = BigInt(Math.max(1, Math.round(f * scale)));
  return (n * BigInt(scale)) / denom;
}

export function hashMeetsTargetBE(hashBE: Uint8Array, targetBE: Uint8Array): boolean {
  return compareHash(hashBE, targetBE) <= 0;
}

/**
 * Build merkle root (display/internal) from stratum job parts.
 * Returns 32-byte digest in internal (sha256d) order — reverse for header LE field.
 */
export function merkleFromCoinbase(
  coinb1Hex: string,
  extranonce1Hex: string,
  extranonce2Hex: string,
  coinb2Hex: string,
  merkleBranchesHex: string[]
): Uint8Array {
  const coinbase = concatHex(coinb1Hex, extranonce1Hex, extranonce2Hex, coinb2Hex);
  let merkle = sha256d(coinbase);
  for (const branch of merkleBranchesHex) {
    const b = hexToBytes(branch);
    const cat = new Uint8Array(64);
    cat.set(merkle, 0);
    cat.set(b, 32);
    merkle = sha256d(cat);
  }
  return merkle;
}

function concatHex(...parts: string[]): Uint8Array {
  const bins = parts.map((p) => hexToBytes(p.length % 2 ? "0" + p : p));
  const len = bins.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const b of bins) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

/** Pack uint32 as little-endian bytes hex (8 hex chars). */
export function u32LeHex(n: number): string {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return bytesToHex(b);
}

export function parseU32Hex(hex: string): number {
  return parseInt(hex, 16) >>> 0;
}

/**
 * Assemble 80-byte header for a stratum job.
 * prevhashHex from stratum goes into the header as-is (already LE-word ordered).
 * merkleRoot internal digest is byte-reversed into the header.
 */
export function assembleStratumHeader(opts: {
  versionHex: string;
  prevhashHex: string;
  merkleRoot: Uint8Array;
  ntimeHex: string;
  nbitsHex: string;
  nonce: number;
}): Uint8Array {
  const header = new Uint8Array(80);
  header.set(hexToBytes(padHex(opts.versionHex, 8)).reverse(), 0); // version LE
  // Actually version/ntime/nbits from stratum are big-endian hex of the uint32 value;
  // header stores them little-endian.
  const ver = parseU32Hex(opts.versionHex);
  const ntime = parseU32Hex(opts.ntimeHex);
  const nbits = parseU32Hex(opts.nbitsHex);
  const view = new DataView(header.buffer);
  view.setUint32(0, ver, true);
  header.set(hexToBytes(padHex(opts.prevhashHex, 64)), 4);
  header.set(reverseBytes(opts.merkleRoot), 36);
  view.setUint32(68, ntime, true);
  view.setUint32(72, nbits, true);
  view.setUint32(76, opts.nonce >>> 0, true);
  return header;
}

function padHex(h: string, len: number): string {
  const s = h.toLowerCase().replace(/^0x/, "");
  return s.length >= len ? s.slice(0, len) : s.padStart(len, "0");
}

export function formatExtranonce2(n: number, size: number): string {
  const hex = n.toString(16);
  const need = size * 2;
  return hex.padStart(need, "0").slice(-need);
}

export { bytesToHex, reverseBytes, sha256d, hexToBytes };
