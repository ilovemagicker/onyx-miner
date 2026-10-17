# Miner · Onyx Labs

Browser **Stratum** miner for BTC/BCH (SHA256d) plus a local educational demo.

- Live: https://miner.onyxlab.dev
- Proxy: https://stratum.onyxlab.dev
- Brand: **Onyx Labs**

## Features
- Real pool / solo mining via WebSocket → Cloudflare Worker → Stratum TCP
- Curated allowlisted pools (Public Pool, CKPool, Atlas, ViaBTC BCH)
- Local demo mode (no pool)
- EN / 繁中 UI
- Explicit Start/Stop; no private keys

## Dev
```bash
npm install
npm run dev
```

## Honesty
Browser KH/s will not earn meaningful BTC. For learning Stratum & PoW.
