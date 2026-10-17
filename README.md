# Miner · Onyx Labs

Browser-based Bitcoin **solo mining demo** — client-side double SHA-256 via Web Workers.

- Live: https://miner.onyxlab.dev
- Brand: **Onyx Labs** (onyxlab.dev)
- Educational only: KH/s hashrate; will not profitably find blocks.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Web Workers

## Dev

```bash
npm install
npm run dev
```

## Mining work source

- Network tip / bits / difficulty from [mempool.space](https://mempool.space) via `/api/network`
- Headers assembled locally; merkle root is a demo coinbase tag (address + extranonce)
- Workers scan nonce space; bump extranonce when exhausted
- No third-party pool; no auto-start

## Homepage blurb (for onyxlab.dev)

**Miner** — 瀏覽器端 BTC solo 挖礦演示。本機 Web Workers 雙重 SHA-256，即時算力與全網難度對照。教育用途，不會獲利。
