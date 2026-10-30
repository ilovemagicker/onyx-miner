import assert from "node:assert/strict";
import { shareMeetsNetworkTarget } from "../src/lib/stratum-math";
import { bitsToTarget } from "../src/lib/bitcoin";
import { bytesToHex } from "../src/lib/sha256";

const DIFF1_BITS = "1d00ffff";
const DIFF1_TARGET =
  "00000000ffff0000000000000000000000000000000000000000000000000000";

assert.equal(bytesToHex(bitsToTarget(0x1d00ffff)), DIFF1_TARGET);
assert.equal(shareMeetsNetworkTarget("0".repeat(64), DIFF1_BITS), true);
assert.equal(shareMeetsNetworkTarget(DIFF1_TARGET, DIFF1_BITS), true);
assert.equal(
  shareMeetsNetworkTarget(
    "0000000100000000000000000000000000000000000000000000000000000000",
    DIFF1_BITS
  ),
  false
);
assert.equal(
  shareMeetsNetworkTarget(
    "00000000fffe0000000000000000000000000000000000000000000000000000",
    DIFF1_BITS
  ),
  true
);
assert.equal(shareMeetsNetworkTarget("abc", DIFF1_BITS), false);
assert.equal(shareMeetsNetworkTarget("0".repeat(64), ""), false);
assert.equal(shareMeetsNetworkTarget("0".repeat(64), "00"), false);

console.log("nbits-network-target-test.ts: ok");
