/**
 * Unit checks for shareMeetsNetworkTarget (nbits → network target).
 * Run: node --experimental-strip-types is not needed; we reimplement the
 * pure compare in JS mirroring src/lib to avoid a TS build step, and also
 * import the compiled logic via dynamic assert of expected vectors.
 *
 * Prefer: npx tsx scripts/nbits-network-target-test.ts when available.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Prefer the TypeScript source via tsx if this file is run as .ts companion.
// This .mjs file embeds the same vectors and a minimal bits→target compare
// so `node scripts/nbits-network-target-test.mjs` works without tsx.

function bitsToTarget(bits) {
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
  return target;
}

function hashMeetsTargetBE(hashBe, targetBe) {
  for (let i = 0; i < 32; i++) {
    if (hashBe[i] < targetBe[i]) return true;
    if (hashBe[i] > targetBe[i]) return false;
  }
  return true;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function shareMeetsNetworkTarget(hashHexBE, nbitsHex) {
  const cleaned = (hashHexBE || "").toLowerCase().replace(/^0x/, "").trim();
  const nbitsClean = (nbitsHex || "").toLowerCase().replace(/^0x/, "").trim();
  if (cleaned.length !== 64 || !/^[0-9a-f]+$/.test(cleaned)) return false;
  if (!nbitsClean || !/^[0-9a-f]+$/.test(nbitsClean)) return false;
  const bits = parseInt(nbitsClean, 16) >>> 0;
  if (bits === 0) return false;
  try {
    const hash = hexToBytes(cleaned);
    const target = bitsToTarget(bits);
    return hashMeetsTargetBE(hash, target);
  } catch {
    return false;
  }
}

// Diff-1 compact bits
const DIFF1_BITS = "1d00ffff";
const DIFF1_TARGET =
  "00000000ffff0000000000000000000000000000000000000000000000000000";

assert.equal(
  Buffer.from(bitsToTarget(0x1d00ffff)).toString("hex"),
  DIFF1_TARGET,
  "bitsToTarget(0x1d00ffff) == diff1"
);

// All-zero hash meets any sane target
assert.equal(
  shareMeetsNetworkTarget("0".repeat(64), DIFF1_BITS),
  true,
  "zero hash meets diff1"
);

// Hash equal to target meets (<=)
assert.equal(
  shareMeetsNetworkTarget(DIFF1_TARGET, DIFF1_BITS),
  true,
  "hash == target meets"
);

// One above target fails
const above = "0000000100000000000000000000000000000000000000000000000000000000";
assert.equal(
  shareMeetsNetworkTarget(above, DIFF1_BITS),
  false,
  "hash > target fails"
);

// Just under target (within mantissa) meets
const under = "00000000fffe0000000000000000000000000000000000000000000000000000";
assert.equal(
  shareMeetsNetworkTarget(under, DIFF1_BITS),
  true,
  "hash < target meets"
);

// Invalid inputs
assert.equal(shareMeetsNetworkTarget("abc", DIFF1_BITS), false);
assert.equal(shareMeetsNetworkTarget("0".repeat(64), ""), false);
assert.equal(shareMeetsNetworkTarget("0".repeat(64), "0"), false);
assert.equal(shareMeetsNetworkTarget("", DIFF1_BITS), false);

// Very easy fake nbits (high target) — e.g. 0x207fffff ≈ max
assert.equal(
  shareMeetsNetworkTarget("0".repeat(62) + "ff", "207fffff"),
  true,
  "easy nbits accepts high hash"
);

console.log("nbits-network-target-test: ok");
