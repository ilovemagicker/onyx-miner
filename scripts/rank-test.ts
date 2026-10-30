import assert from "node:assert/strict";
import {
  addAcceptedShares,
  emptyRankBoard,
  parseRankBoard,
  shortenWallet,
  sortedRank,
  touchPeakHashrate,
  walletRankKey,
} from "../src/lib/rank";

assert.equal(walletRankKey("  bc1QXYZ.onyx  "), "bc1qxyz");
assert.equal(walletRankKey("bc1qxyz.phone"), "bc1qxyz");
assert.equal(walletRankKey("1BoatSLRHkZWT8Nv5MmAmNrDGiza62eQz2"), "1BoatSLRHkZWT8Nv5MmAmNrDGiza62eQz2");
assert.equal(walletRankKey(""), "");

let board = emptyRankBoard();
const a1 = addAcceptedShares(board, "bc1qaaa.onyx", 2);
assert.ok(a1);
board = a1.board;
assert.equal(a1.entry.accepted, 2);

const a2 = addAcceptedShares(board, "BC1QAAA.phone", 3);
assert.ok(a2);
board = a2.board;
assert.equal(a2.entry.accepted, 5);
assert.equal(Object.keys(board.entries).length, 1);

const h = touchPeakHashrate(board, "bc1qaaa", 120_000);
assert.ok(h);
board = h.board;
assert.equal(h.entry.peakHashrate, 120_000);
const h2 = touchPeakHashrate(board, "bc1qaaa", 90_000);
assert.ok(h2);
assert.equal(h2.entry.peakHashrate, 120_000);

const other = addAcceptedShares(board, "bc1qbbb", 1);
assert.ok(other);
board = other.board;
const byAccepted = sortedRank(board, "accepted");
assert.equal(byAccepted[0].wallet, "bc1qaaa");
assert.equal(byAccepted[0].accepted, 5);

const peakB = touchPeakHashrate(board, "bc1qbbb", 500_000);
assert.ok(peakB);
board = peakB.board;
const byHash = sortedRank(board, "hashrate");
assert.equal(byHash[0].wallet, "bc1qbbb");

assert.equal(addAcceptedShares(board, "bc1qaaa", 0), null);
assert.equal(addAcceptedShares(board, "", 1), null);

const round = parseRankBoard(JSON.parse(JSON.stringify(board)));
assert.equal(round.entries["bc1qaaa"].accepted, 5);
assert.equal(shortenWallet("bc1qaaabbbcccddd"), "bc1qaa…cddd");

console.log("rank-test.ts: ok");
