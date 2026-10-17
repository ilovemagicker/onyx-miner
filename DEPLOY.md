# Miner deploy notes

## Live (2026-10-17 HKT)
- **URL**: https://miner.onyxlab.dev
- **Also**: https://onyx-miner.vercel.app
- **Vercel project**: `onyx-miner` / `prj_ojh5xtwXavdSFS18bdtc1s66exSR`
- **Team**: `team_eBuGvhlSHHu9ozaBkA5yAxnt`
- **GitHub**: https://github.com/ilovemagicker/onyx-miner (`main`)
- **Cloudflare DNS**: CNAME `miner` → `cname.vercel-dns.com` (DNS-only)
- **Stratum proxy**: https://stratum.onyxlab.dev (Cloudflare Worker `onyx-stratum-proxy`)
  - WSS ↔ TCP allowlisted pools only
  - workers.dev: `onyx-stratum-proxy.0xzear.workers.dev`

## Modes
1. **Real pool** (default): WebSocket → CF Worker TCP → Stratum V1; shares submitted
2. **Local demo**: tip/bits headers, no pool

## Coins
| Coin | Status | Notes |
|------|--------|-------|
| BTC | Supported | Public Pool solo/PPLNS, CKPool solo, Atlas solo |
| BCH | Supported | ViaBTC (account required) |
| LTC/DOGE | Coming soon | Scrypt worker not shipped |
| XMR/KAS | Unsupported | Algo not practical / not implemented |

## Pools shipped
- `public-pool.io:3333` Solo BTC (suggest_difficulty → often diff 1)
- `public-pool.io:13333` PPLNS BTC
- `stratum.ckpool.org:3333` Solo BTC (~2%, higher start diff)
- `solo.atlaspool.io:3333` Solo BTC (higher start diff)
- `bch.viabtc.io:3333` BCH pool (ViaBTC login)

## Why Cloudflare Worker (not Vercel)
Vercel serverless cannot hold long-lived TCP to Stratum. Proxy is Cloudflare Worker using `cloudflare:sockets` `connect()` + WebSocketPair.

## i18n
Cookie `miner_locale`; default zh-Hant; EN | 繁中


## LTC / DOGE (Scrypt) — 2026-10-17
- Algo: `@noble/hashes` scrypt N=1024,r=1,p=1 (header as key+salt)
- Browser ~100–400 H/s (honest: much slower than SHA256d KH/s)
- Pools: LiteSolo EU/US, MySoloPool, Molepool EU, NexusPool
- DOGE uses LTC merge (AuxPoW); UI asks for LTC merge address
- Proxy allowlist updated on stratum.onyxlab.dev
