export type CoinId = "BTC" | "BCH" | "LTC" | "DOGE" | "XMR" | "KAS";
export type CoinStatus = "supported" | "coming" | "unsupported";
export type PoolKind = "solo" | "pool";

export type CoinInfo = {
  id: CoinId;
  algo: string;
  status: CoinStatus;
  note_zh: string;
  note_en: string;
};

export type PoolInfo = {
  id: string;
  coin: CoinId;
  name: string;
  kind: PoolKind;
  host: string;
  port: number;
  userFormat_zh: string;
  userFormat_en: string;
  password: string;
  feeNote_zh: string;
  feeNote_en: string;
  homepage?: string;
};

export const PROXY_WS_URL =
  process.env.NEXT_PUBLIC_STRATUM_PROXY || "wss://stratum.onyxlab.dev/";

export const COINS: CoinInfo[] = [
  {
    id: "BTC",
    algo: "SHA256d",
    status: "supported",
    note_zh: "真實 Stratum 礦池／Solo",
    note_en: "Real Stratum pool / solo",
  },
  {
    id: "BCH",
    algo: "SHA256d",
    status: "supported",
    note_zh: "真實 Stratum（ViaBTC）",
    note_en: "Real Stratum (ViaBTC)",
  },
  {
    id: "LTC",
    algo: "Scrypt",
    status: "coming",
    note_zh: "Scrypt worker 尚未實作",
    note_en: "Scrypt worker not implemented yet",
  },
  {
    id: "DOGE",
    algo: "Scrypt",
    status: "coming",
    note_zh: "Scrypt worker 尚未實作",
    note_en: "Scrypt worker not implemented yet",
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
  {
    id: "btc-public-solo",
    coin: "BTC",
    name: "Public Pool (Solo)",
    kind: "solo",
    host: "public-pool.io",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "0% · 找到區塊歸你 · 建議難度可談",
    feeNote_en: "0% · block pays your address · vardiff/suggest",
    homepage: "https://web.public-pool.io/",
  },
  {
    id: "btc-public-pplns",
    coin: "BTC",
    name: "Public Pool (PPLNS)",
    kind: "pool",
    host: "public-pool.io",
    port: 13333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "0% PPLNS 分潤",
    feeNote_en: "0% PPLNS",
    homepage: "https://web.public-pool.io/",
  },
  {
    id: "btc-ckpool-solo",
    coin: "BTC",
    name: "CKPool Solo",
    kind: "solo",
    host: "stratum.ckpool.org",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "約 2% · 經典 Solo 服務 · 起始難度偏高",
    feeNote_en: "~2% · classic solo · higher start difficulty",
    homepage: "https://solo.ckpool.org/",
  },
  {
    id: "btc-atlas-solo",
    coin: "BTC",
    name: "AtlasPool Solo",
    kind: "solo",
    host: "solo.atlaspool.io",
    port: 3333,
    userFormat_zh: "你的 BTC 地址（可加 .worker）",
    userFormat_en: "Your BTC address (optional .worker)",
    password: "x",
    feeNote_zh: "Solo · 起始難度偏高",
    feeNote_en: "Solo · higher start difficulty",
    homepage: "https://atlaspool.io/",
  },
  {
    id: "bch-viabtc",
    coin: "BCH",
    name: "ViaBTC BCH",
    kind: "pool",
    host: "bch.viabtc.io",
    port: 3333,
    userFormat_zh: "ViaBTC 子帳戶名.worker（需先註冊）",
    userFormat_en: "ViaBTC sub-account.worker (register first)",
    password: "x",
    feeNote_zh: "需 ViaBTC 帳號；瀏覽器算力幾乎無收益",
    feeNote_en: "ViaBTC account required; browser hashrate earns ~nothing",
    homepage: "https://www.viabtc.com/",
  },
];

export function poolsForCoin(coin: CoinId): PoolInfo[] {
  return POOLS.filter((p) => p.coin === coin);
}
