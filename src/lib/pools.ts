export type CoinId = "BTC" | "BCH" | "LTC" | "DOGE" | "XMR" | "KAS";
export type CoinStatus = "supported" | "coming" | "unsupported";
export type PoolKind = "solo" | "pool";
export type AlgoId = "sha256d" | "scrypt";

export type CoinInfo = {
  id: CoinId;
  algo: AlgoId | string;
  status: CoinStatus;
  note_zh: string;
  note_en: string;
};

export type PoolInfo = {
  id: string;
  coin: CoinId;
  name: string;
  kind: PoolKind;
  algo: AlgoId;
  host: string;
  port: number;
  userFormat_zh: string;
  userFormat_en: string;
  password: string;
  feeNote_zh: string;
  feeNote_en: string;
  homepage?: string;
  /** Pool status / dashboard page (search or overview). */
  statusUrl?: string;
  /**
   * Per-address status URL. `{address}` is replaced with the payout address
   * (Stratum username with optional `.worker` suffix stripped).
   */
  statusUrlTemplate?: string;
  /** Stratum mining.subscribe user-agent (some pools whitelist NerdMiner*). */
  userAgent?: string;
  /** If set, UI shows optional merge address field (for DOGE merge mining). */
  mergeHint?: "ltc-for-doge" | "doge-in-password";
};

export const PROXY_WS_URL =
  process.env.NEXT_PUBLIC_STRATUM_PROXY || "wss://stratum.onyxlab.dev/";

export const COINS: CoinInfo[] = [
  {
    id: "BTC",
    algo: "sha256d",
    status: "supported",
    note_zh: "真實 Stratum 礦池／Solo",
    note_en: "Real Stratum pool / solo",
  },
  {
    id: "BCH",
    algo: "sha256d",
    status: "supported",
    note_zh: "真實 Stratum（ViaBTC）",
    note_en: "Real Stratum (ViaBTC)",
  },
  {
    id: "LTC",
    algo: "scrypt",
    status: "supported",
    note_zh: "Scrypt · 瀏覽器約百 H/s 級，遠慢於 SHA256d",
    note_en: "Scrypt · browser ~100s H/s, much slower than SHA256d",
  },
  {
    id: "DOGE",
    algo: "scrypt",
    status: "supported",
    note_zh: "多為 LTC 合併挖礦 · Scrypt · 需 LTC 地址＋DOGE 獎勵地址",
    note_en: "Usually LTC merge-mine · Scrypt · need LTC addr + DOGE payout",
  },
  {
    id: "XMR",
    algo: "RandomX",
    status: "unsupported",
    note_zh: "瀏覽器無法實用跑 RandomX",
    note_en: "RandomX not practical in browsers",
  },
  {
    id: "KAS",
    algo: "kHeavyHash",
    status: "unsupported",
    note_zh: "尚未實作此演算法",
    note_en: "Algorithm not implemented",
  },
];

export const POOLS: PoolInfo[] = [
  // —— BTC ——
  {
    id: "btc-public-solo",
    coin: "BTC",
    name: "Public Pool (Solo)",
    kind: "solo",
    algo: "sha256d",
    host: "public-pool.io",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "0% · Solo · 現況地板難度=1（ESP32/NerdMiner 同）。官網 worker 要 Accepted≥1",
    feeNote_en: "0% · Solo · live floor difficulty=1 (same for ESP32/NerdMiner). Pool workers need Accepted≥1",
    homepage: "https://web.public-pool.io/",
    statusUrl: "https://web.public-pool.io/",
    statusUrlTemplate: "https://web.public-pool.io/#/app/{address}",
  },
  {
    id: "btc-public-pplns",
    coin: "BTC",
    name: "Public Pool (PPLNS)",
    kind: "pool",
    algo: "sha256d",
    host: "public-pool.io",
    port: 13333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "0% PPLNS · 地板難度=1（與 Solo／ESP32 相同）",
    feeNote_en: "0% PPLNS · floor difficulty=1 (same as Solo / ESP32)",
    homepage: "https://web.public-pool.io/",
    statusUrl: "https://web.public-pool.io/",
    statusUrlTemplate: "https://web.public-pool.io/#/app/{address}",
  },
  {
    id: "btc-seth-solo",
    coin: "BTC",
    name: "Seth Solo (NerdMiner fork)",
    kind: "solo",
    algo: "sha256d",
    host: "pool.sethforprivacy.com",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "實測連線不穩（proxy 曾斷流）；優先用 NerdMiners.org／SoloMining.de",
    feeNote_en: "Probe unstable (proxy stream cancel); prefer NerdMiners.org / SoloMining.de",
    homepage: "https://pool.sethforprivacy.com/",
    statusUrl: "https://pool.sethforprivacy.com/",
    statusUrlTemplate: "https://pool.sethforprivacy.com/api/client/{address}",
  },
  {
    id: "btc-stompi-solo",
    coin: "BTC",
    name: "Stompi Solo (NerdMiner fork)",
    kind: "solo",
    algo: "sha256d",
    host: "pool.stompi.de",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "實測 authorize 失敗；優先用 NerdMiners.org／SoloMining.de",
    feeNote_en: "Probe authorize failed; prefer NerdMiners.org / SoloMining.de",
    homepage: "http://web.stompi.de/",
    statusUrl: "http://web.stompi.de/",
    statusUrlTemplate: "http://web.stompi.de/#/app/{address}",
  },
  {
    id: "btc-nerdminers-org",
    coin: "BTC",
    name: "NerdMiners.org Solo",
    kind: "solo",
    algo: "sha256d",
    host: "pool.nerdminers.org",
    userAgent: "NerdMinerV2/onyx-1.3",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "推薦 · 難度≈0.001 · 需 NerdMiner UA（本站已自動帶）· 數十秒內可 Accepted",
    feeNote_en: "Recommended · diff≈0.001 · NerdMiner UA auto · Accepted in tens of seconds",
    homepage: "https://pool.nerdminers.org/",
    statusUrl: "https://pool.nerdminers.org/",
    statusUrlTemplate: "https://pool.nerdminers.org/users/{address}",
  },
  {
    id: "btc-solomining-de",
    coin: "BTC",
    name: "SoloMining.de (low-diff)",
    kind: "solo",
    algo: "sha256d",
    host: "pool.solomining.de",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "實測接受 suggest 0.00015 · 與 NerdMiner DEFAULT_DIFFICULTY 一致",
    feeNote_en: "Probed honors suggest 0.00015 · matches NerdMiner DEFAULT_DIFFICULTY",
    homepage: "https://pool.solomining.de/",
    statusUrl: "https://pool.solomining.de/",
    statusUrlTemplate: "https://pool.solomining.de/#/app/{address}",
  },
  {
    id: "btc-ckpool-solo",
    coin: "BTC",
    name: "CKPool Solo",
    kind: "solo",
    algo: "sha256d",
    host: "stratum.ckpool.org",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "約 2% · 起始難度偏高",
    feeNote_en: "~2% · higher start difficulty",
    homepage: "https://solo.ckpool.org/",
    statusUrl: "https://solo.ckpool.org/",
    statusUrlTemplate: "http://raw.stats.ckpool.org/users/{address}",
  },
  {
    id: "btc-atlas-solo",
    coin: "BTC",
    name: "AtlasPool Solo",
    kind: "solo",
    algo: "sha256d",
    host: "solo.atlaspool.io",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "Solo · 起始難度偏高",
    feeNote_en: "Solo · higher start difficulty",
    homepage: "https://atlaspool.io/",
    statusUrl: "https://atlaspool.io/",
  },
  // —— BCH ——
  {
    id: "bch-viabtc",
    coin: "BCH",
    name: "ViaBTC BCH",
    kind: "pool",
    algo: "sha256d",
    host: "bch.viabtc.io",
    port: 3333,
    userFormat_zh: "ViaBTC 子帳戶名.worker（需先註冊）",
    userFormat_en: "ViaBTC sub-account.worker (register first)",
    password: "x",
    feeNote_zh: "需 ViaBTC 帳號",
    feeNote_en: "ViaBTC account required",
    homepage: "https://www.viabtc.com/",
    statusUrl: "https://www.viabtc.com/",
  },
  // —— LTC ——
  {
    id: "ltc-litesolo-eu",
    coin: "LTC",
    name: "LiteSolo EU",
    kind: "solo",
    algo: "scrypt",
    host: "eu.litesolo.org",
    port: 3333,
    userFormat_zh: "LTC 地址（L／M／ltc1…，可加 .worker）",
    userFormat_en: "LTC address (L/M/ltc1…, optional .worker)",
    password: "x",
    feeNote_zh: "Solo 合併 · 約 1% · 密碼可填 DOGE=你的DOGE地址",
    feeNote_en: "Solo merge · ~1% · password may be DOGE=yourDogeAddr",
    homepage: "https://litesolo.org/",
    statusUrl: "https://litesolo.org/",
    mergeHint: "doge-in-password",
  },
  {
    id: "ltc-litesolo-us",
    coin: "LTC",
    name: "LiteSolo US",
    kind: "solo",
    algo: "scrypt",
    host: "us.litesolo.org",
    port: 3333,
    userFormat_zh: "LTC 地址（L／M／ltc1…）",
    userFormat_en: "LTC address (L/M/ltc1…)",
    password: "x",
    feeNote_zh: "Solo 合併 · 約 1%",
    feeNote_en: "Solo merge · ~1%",
    homepage: "https://litesolo.org/",
    statusUrl: "https://litesolo.org/",
    mergeHint: "doge-in-password",
  },
  {
    id: "ltc-mysolo",
    coin: "LTC",
    name: "MySoloPool Scrypt",
    kind: "solo",
    algo: "scrypt",
    host: "scrypt.mysolopool.com",
    port: 3341,
    userFormat_zh: "LTC地址 或 LTC.DOGE地址",
    userFormat_en: "LTC addr or LTC.DOGE addr",
    password: "x",
    feeNote_zh: "LTC+DOGE Solo 合併 · vardiff",
    feeNote_en: "LTC+DOGE solo merge · vardiff",
    homepage: "https://doge.mysolopool.com/",
    statusUrl: "https://doge.mysolopool.com/",
  },
  {
    id: "ltc-molepool",
    coin: "LTC",
    name: "Molepool EU (low)",
    kind: "solo",
    algo: "scrypt",
    host: "eu.molepool.com",
    port: 2601,
    userFormat_zh: "LTC 地址（可加 .worker）",
    userFormat_en: "LTC address (optional .worker)",
    password: "x",
    feeNote_zh: "低算力埠 · 密碼可 doge=DOGE地址",
    feeNote_en: "Low-hashrate port · password doge=DOGE addr",
    homepage: "https://ltc.molepool.com/help",
    statusUrl: "https://ltc.molepool.com/",
    mergeHint: "doge-in-password",
  },
  {
    id: "ltc-nexus",
    coin: "LTC",
    name: "NexusPool Lite",
    kind: "solo",
    algo: "scrypt",
    host: "lite.nexuspool.io",
    port: 3354,
    userFormat_zh: "LTC.DOGE.worker 或 LTC＋密碼 doge=",
    userFormat_en: "LTC.DOGE.worker or LTC + password doge=",
    password: "x",
    feeNote_zh: "LTC+DOGE Solo 合併",
    feeNote_en: "LTC+DOGE solo merge",
    homepage: "https://nexuspool.io/ltc",
    statusUrl: "https://nexuspool.io/ltc",
  },
  // —— DOGE (merge via LTC parent) ——
  {
    id: "doge-litesolo-eu",
    coin: "DOGE",
    name: "LiteSolo EU (merge)",
    kind: "solo",
    algo: "scrypt",
    host: "eu.litesolo.org",
    port: 3333,
    userFormat_zh: "使用者名稱＝LTC 地址；密碼＝DOGE=你的DOGE地址",
    userFormat_en: "Username=LTC address; password=DOGE=yourDogeAddr",
    password: "DOGE=",
    feeNote_zh: "合併挖礦 · 填 DOGE 獎勵地址＋下方 LTC 合併地址",
    feeNote_en: "Merge-mine · fill DOGE payout + LTC merge address below",
    homepage: "https://litesolo.org/",
    statusUrl: "https://litesolo.org/",
    mergeHint: "ltc-for-doge",
  },
  {
    id: "doge-mysolo",
    coin: "DOGE",
    name: "MySoloPool (merge)",
    kind: "solo",
    algo: "scrypt",
    host: "scrypt.mysolopool.com",
    port: 3341,
    userFormat_zh: "自動組成 LTC.DOGE 作為使用者名稱",
    userFormat_en: "Builds LTC.DOGE as username automatically",
    password: "x",
    feeNote_zh: "需同時提供 LTC 與 DOGE 地址",
    feeNote_en: "Needs both LTC and DOGE addresses",
    homepage: "https://doge.mysolopool.com/",
    statusUrl: "https://doge.mysolopool.com/",
    mergeHint: "ltc-for-doge",
  },
  {
    id: "doge-molepool",
    coin: "DOGE",
    name: "Molepool EU (merge)",
    kind: "solo",
    algo: "scrypt",
    host: "eu.molepool.com",
    port: 2601,
    userFormat_zh: "使用者＝LTC；密碼＝doge=DOGE地址",
    userFormat_en: "User=LTC; password=doge=DOGE addr",
    password: "doge=",
    feeNote_zh: "低算力埠 · 合併",
    feeNote_en: "Low-hashrate · merge",
    homepage: "https://ltc.molepool.com/help",
    statusUrl: "https://ltc.molepool.com/",
    mergeHint: "ltc-for-doge",
  },
];

export function poolsForCoin(coin: CoinId): PoolInfo[] {
  return POOLS.filter((p) => p.coin === coin);
}

/** Payout address only (strip optional `.worker` suffix). */
export function payoutAddressOnly(address: string): string {
  const raw = address.trim();
  if (!raw) return "";
  const dot = raw.indexOf(".");
  return dot > 0 ? raw.slice(0, dot) : raw;
}

/**
 * Build a pool status / dashboard URL.
 * Prefers a per-address deep link when the address is filled; otherwise the
 * pool search/overview page (or homepage).
 */
export function resolvePoolStatusUrl(
  pool: PoolInfo,
  address?: string
): string | null {
  const payout = address ? payoutAddressOnly(address) : "";
  if (pool.statusUrlTemplate && payout) {
    return pool.statusUrlTemplate.replaceAll("{address}", payout);
  }
  return pool.statusUrl ?? pool.homepage ?? null;
}
