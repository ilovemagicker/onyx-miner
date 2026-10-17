import { bytesToHex, hexToBytes, reverseBytes, sha256d } from "./sha256";

export type NetworkSnapshot = {
  height: number;
  tipHash: string;
  prevHash: string;
  bits: number;
  bitsHex: string;
  difficulty: number;
  targetHex: string;
  timestamp: number;
  version: number;
  fetchedAt: number;
};

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Verify(hrp: string, data: number[], spec: "bech32" | "bech32m"): boolean {
  const constVal = spec === "bech32" ? 1 : 0x2bc830a3;
  return bech32Polymod(bech32HrpExpand(hrp).concat(data)) === constVal;
}

/** Validate common BTC addresses: legacy 1/3 and bech32/bech32m bc1. */
export function validateBtcAddress(addr: string): {
  ok: boolean;
  kind?: "p2pkh" | "p2sh" | "bech32" | "bech32m";
  error?: string;
} {
  const a = addr.trim();
  if (!a) return { ok: false, error: "empty" };

  if (/^[13][a-km-zA-HJ-NP-Z1-9]{24,34}$/.test(a)) {
    // Base58Check length + charset only (full checksum would need full base58 decode)
    return { ok: true, kind: a.startsWith("1") ? "p2pkh" : "p2sh" };
  }

  if (/^bc1[a-z0-9]{25,90}$/i.test(a)) {
    const lower = a.toLowerCase();
    const hrp = "bc";
    if (!lower.startsWith(hrp + "1")) return { ok: false, error: "hrp" };
    const dataPart = lower.slice(3);
    const data: number[] = [];
    for (const c of dataPart) {
      const idx = BECH32_CHARSET.indexOf(c);
      if (idx < 0) return { ok: false, error: "charset" };
      data.push(idx);
    }
    if (data.length < 6) return { ok: false, error: "short" };
    if (bech32Verify(hrp, data, "bech32")) return { ok: true, kind: "bech32" };
    if (bech32Verify(hrp, data, "bech32m")) return { ok: true, kind: "bech32m" };
    return { ok: false, error: "checksum" };
  }

  return { ok: false, error: "format" };
}

/** Compact bits → 32-byte big-endian target. */
export function bitsToTarget(bits: number): Uint8Array {
  const exp = bits >>> 24;
  const mant = bits & 0x007fffff;
  const target = new Uint8Array(32);
  if (exp <= 3) {
    const shifted = mant >> (8 * (3 - exp));
    target[29] = (shifted >>> 16) & 0xff;
    target[30] = (shifted >>> 8) & 0xff;
    target[31] = shifted & 0xff;
  } else {
    const offset = 32 - exp;
    if (offset >= 0 && offset <= 29) {
      target[offset] = (mant >>> 16) & 0xff;
      target[offset + 1] = (mant >>> 8) & 0xff;
      target[offset + 2] = mant & 0xff;
    }
  }
  // sign bit in compact form — if set, target is negative (invalid); ignore for demo
  return target;
}

export function difficultyFromBits(bits: number): number {
  // Fallback when API omits difficulty. Approximate via compact bits mantissa/exponent.
  const exp = bits >>> 24;
  const mant = bits & 0x007fffff;
  if (mant === 0) return 0;
  // difficulty_1 uses bits 0x1d00ffff → exp=29, mant=0xffff
  const exp1 = 0x1d;
  const mant1 = 0xffff;
  // difficulty ≈ (mant1 * 2^(8*(exp1-3))) / (mant * 2^(8*(exp-3)))
  const expDiff = 8 * (exp1 - exp);
  let ratio = mant1 / mant;
  // apply power of two carefully in float
  if (expDiff >= 0) ratio *= Math.pow(2, expDiff);
  else ratio /= Math.pow(2, -expDiff);
  return ratio;
}

export function hashMeetsTarget(hashBe: Uint8Array, targetBe: Uint8Array): boolean {
  for (let i = 0; i < 32; i++) {
    if (hashBe[i] < targetBe[i]) return true;
    if (hashBe[i] > targetBe[i]) return false;
  }
  return true;
}

/** Compare two 32-byte big-endian hashes; negative if a < b. */
export function compareHash(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Demo merkle root as explorer-style (display) hex. */
export function buildMerkleFromCoinbase(address: string, extranonce: number): string {
  const enc = new TextEncoder();
  const payload = enc.encode(
    `onyx-miner|${address || "demo"}|${extranonce}`
  );
  return bytesToHex(reverseBytes(sha256d(payload)));
}

/**
 * Assemble an 80-byte Bitcoin block header.
 * prevHashHex / merkleHex are display-order (reversed) hex as commonly shown in explorers;
 * we store them little-endian in the header as Bitcoin does.
 */
export function assembleHeader(opts: {
  version: number;
  prevHashHex: string;
  merkleHex: string;
  timestamp: number;
  bits: number;
  nonce: number;
}): Uint8Array {
  const header = new Uint8Array(80);
  const view = new DataView(header.buffer);
  view.setUint32(0, opts.version >>> 0, true);
  header.set(reverseBytes(hexToBytes(opts.prevHashHex)), 4);
  header.set(reverseBytes(hexToBytes(opts.merkleHex)), 36);
  view.setUint32(68, opts.timestamp >>> 0, true);
  view.setUint32(72, opts.bits >>> 0, true);
  view.setUint32(76, opts.nonce >>> 0, true);
  return header;
}

export function headerHashDisplay(header: Uint8Array): string {
  // sha256d then reverse for display
  return bytesToHex(reverseBytes(sha256d(header)));
}

export function formatHashrate(hps: number): string {
  if (!Number.isFinite(hps) || hps < 0) return "0 H/s";
  if (hps >= 1e12) return `${(hps / 1e12).toFixed(2)} TH/s`;
  if (hps >= 1e9) return `${(hps / 1e9).toFixed(2)} GH/s`;
  if (hps >= 1e6) return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps >= 1e3) return `${(hps / 1e3).toFixed(2)} KH/s`;
  return `${hps.toFixed(0)} H/s`;
}

export function estimateTimeToBlock(hashrate: number, difficulty: number): number {
  // expected hashes ≈ difficulty * 2^32
  if (hashrate <= 0 || difficulty <= 0) return Infinity;
  const expected = difficulty * 2 ** 32;
  return expected / hashrate; // seconds
}

export function formatDuration(seconds: number, locale: "zh-Hant" | "en"): string {
  if (!Number.isFinite(seconds) || seconds > 1e18) {
    return locale === "en" ? "effectively never" : "實質上永遠";
  }
  const units =
    locale === "en"
      ? [
          [60, "sec"],
          [60, "min"],
          [24, "hr"],
          [365.25, "day"],
          [100, "yr"],
          [10, "century"],
          [Infinity, "millennium"],
        ]
      : [
          [60, "秒"],
          [60, "分"],
          [24, "小時"],
          [365.25, "天"],
          [100, "年"],
          [10, "世紀"],
          [Infinity, "千年"],
        ];

  let v = seconds;
  let label = locale === "en" ? "sec" : "秒";
  for (let i = 0; i < units.length; i++) {
    const [div, name] = units[i] as [number, string];
    if (v < div || i === units.length - 1) {
      label = name;
      break;
    }
    v /= div as number;
    label = name;
  }
  const n = v >= 100 ? v.toExponential(2) : v.toFixed(1);
  return locale === "en" ? `~${n} ${label}` : `約 ${n} ${label}`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
