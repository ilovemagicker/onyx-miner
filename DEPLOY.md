# Miner deploy notes

## Live (2026-10-17 HKT)
- **URL**: https://miner.onyxlab.dev
- **Also**: https://onyx-miner.vercel.app
- **Vercel project**: `onyx-miner` / `prj_ojh5xtwXavdSFS18bdtc1s66exSR`
- **Deployment**: `dpl_DvbTNsZdeEGyBMpMWZx97rjmzS5P` (production)
- **Team**: `team_eBuGvhlSHHu9ozaBkA5yAxnt` (ilovemagickers-projects)
- **GitHub**: https://github.com/ilovemagicker/onyx-miner (`main`)
- **Cloudflare DNS**: CNAME `miner` → `cname.vercel-dns.com` (DNS-only / grey cloud) ✅
- **Marketing entry**: onyxlab.dev tools list (Miner)

## Mining work source
- `/api/network` proxies mempool.space tip hash + block bits/difficulty/height
- Client builds 80-byte headers; demo merkle from address + extranonce
- Web Workers scan nonce (up to 8); bump extranonce when space exhausted
- Double SHA-256 verified against Bitcoin genesis header

## i18n
- Cookie `miner_locale` + localStorage; default zh-Hant
- Switcher EN | 繁中

## Homepage blurb
**Miner** — 瀏覽器端 BTC solo 挖礦演示。本機 Web Workers 雙重 SHA-256，即時算力與全網難度對照。教育用途，不會獲利。
