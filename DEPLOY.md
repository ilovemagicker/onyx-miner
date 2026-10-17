# Miner deploy notes

## Target
- **URL**: https://miner.onyxlab.dev
- **Vercel project**: `onyx-miner`
- **Team**: `team_eBuGvhlSHHu9ozaBkA5yAxnt`
- **GitHub**: https://github.com/ilovemagicker/onyx-miner
- **Cloudflare DNS**: CNAME `miner` → `cname.vercel-dns.com` (DNS-only)

## i18n
- Cookie `miner_locale` + localStorage; default zh-Hant
- Switcher EN | 繁中

## Notes
- Production create may be blocked — use preview deploy + `assign_alias` like Vault/Clip.
