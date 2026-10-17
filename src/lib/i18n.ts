export type Locale = "zh-Hant" | "en";

export const LOCALE_COOKIE = "miner_locale";
export const LOCALE_STORAGE_KEY = "miner_locale";
export const DEFAULT_LOCALE: Locale = "zh-Hant";
export const SUPPORTED_LOCALES: Locale[] = ["zh-Hant", "en"];
export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-Hant": "繁中",
  en: "EN",
};

const dict = {
  "zh-Hant": {
    appName: "Miner",
    brandSub: "Onyx Labs",
    tagline: "瀏覽器 BTC／BCH 真實 Stratum 挖礦＋本地演示",
    language: "語言",
    disclaimerTitle: "重要聲明",
    disclaimer:
      "瀏覽器算力通常只有數十～數百 KH/s，對 BTC／BCH 幾乎無經濟收益。此工具供學習 Stratum 協議與 PoW。不會自動開始；私鑰不會出現在此站。",
    privacy:
      "真實模式經 Onyx Cloudflare Worker（stratum.onyxlab.dev）轉發到你選的礦池；地址只作 stratum 使用者名稱。",
    modeDemo: "本地演示",
    modePool: "真實礦池",
    coin: "幣種",
    pool: "礦池",
    kindSolo: "Solo",
    kindPool: "礦池",
    statusSupported: "可用",
    statusComing: "即將推出",
    statusUnsupported: "不支援",
    addressLabel: "獎勵地址／礦工帳號",
    addressPlaceholder: "bc1… / 1… 或礦池要求的帳號.worker",
    addressHint: "多數 Solo：填 BTC 地址即可。ViaBTC 等需先註冊子帳號。",
    addressInvalid: "地址／帳號格式看起來無效",
    addressOk: "格式看起來可用",
    passwordLabel: "密碼（多數填 x）",
    start: "開始挖礦",
    stop: "停止",
    mining: "挖礦中",
    idle: "待機",
    hashrate: "算力",
    hashesTried: "已嘗試雜湊",
    bestHash: "目前最佳雜湊",
    workers: "工作執行緒",
    height: "區塊高度",
    difficulty: "難度",
    shareDiff: "份額難度",
    target: "目標（bits）",
    tipHash: "最新區塊",
    timeToBlock: "預估出塊時間（以目前算力）",
    network: "網路狀態",
    refreshNetwork: "重新整理網路資料",
    loadingNetwork: "載入 Bitcoin 網路資料…",
    networkError: "無法取得網路資料（mempool.space）",
    howItWorks: "運作方式",
    howBody:
      "真實模式：瀏覽器 WebSocket → Onyx Stratum Proxy（Cloudflare Worker TCP）→ 礦池。Worker 做雙重 SHA-256，提交符合份額難度的 share。本地演示仍用 tip／bits 自建標頭、不上礦池。",
    footer: "由 Onyx Labs 製作 · miner.onyxlab.dev",
    homeLink: "onyxlab.dev",
    metTarget: "碰到網路目標！（演示不會廣播）",
    extranonce: "Extranonce",
    cores: "建議執行緒",
    sharesAccepted: "已接受",
    sharesRejected: "已拒絕",
    sharesSubmitted: "已提交",
    jobsReceived: "工作數",
    poolStatus: "連線狀態",
    lastShare: "最近 share",
    poolFee: "說明",
    selectPool: "請選擇礦池",
    needAddress: "請填寫地址或礦工帳號",
    coinBlocked: "此幣種尚未支援真實挖礦",
    highDiffWarn:
      "此礦池份額難度偏高，瀏覽器可能很久才有 accepted share；算力與協議仍是真實的。",
    proxyNote: "Proxy：stratum.onyxlab.dev（僅允許精選礦池主機）",
  },
  en: {
    appName: "Miner",
    brandSub: "Onyx Labs",
    tagline: "Browser BTC/BCH real Stratum mining + local demo",
    language: "Language",
    disclaimerTitle: "Important disclaimer",
    disclaimer:
      "Browser hashrate is typically tens–hundreds of KH/s — not economically useful for BTC/BCH. This is for learning Stratum and PoW. Mining never auto-starts; we never ask for private keys.",
    privacy:
      "Pool mode tunnels via an Onyx Cloudflare Worker (stratum.onyxlab.dev) to your chosen pool; your address is only used as the Stratum username.",
    modeDemo: "Local demo",
    modePool: "Real pool",
    coin: "Coin",
    pool: "Pool",
    kindSolo: "Solo",
    kindPool: "Pool",
    statusSupported: "Supported",
    statusComing: "Coming soon",
    statusUnsupported: "Unsupported",
    addressLabel: "Payout address / worker login",
    addressPlaceholder: "bc1… / 1… or pool account.worker",
    addressHint: "Most solo pools: your coin address. ViaBTC etc. need a registered sub-account.",
    addressInvalid: "Address / login format looks invalid",
    addressOk: "Format looks usable",
    passwordLabel: "Password (usually x)",
    start: "Start mining",
    stop: "Stop",
    mining: "Mining",
    idle: "Idle",
    hashrate: "Hashrate",
    hashesTried: "Hashes tried",
    bestHash: "Best hash so far",
    workers: "Workers",
    height: "Block height",
    difficulty: "Difficulty",
    shareDiff: "Share difficulty",
    target: "Target (bits)",
    tipHash: "Tip hash",
    timeToBlock: "Est. time to block at current hashrate",
    network: "Network",
    refreshNetwork: "Refresh network data",
    loadingNetwork: "Loading Bitcoin network data…",
    networkError: "Could not fetch network data (mempool.space)",
    howItWorks: "How it works",
    howBody:
      "Pool mode: browser WebSocket → Onyx Stratum Proxy (Cloudflare Worker TCP) → pool. Workers run double SHA-256 and submit shares that meet share difficulty. Local demo still builds headers from tip/bits and never talks to a pool.",
    footer: "Built by Onyx Labs · miner.onyxlab.dev",
    homeLink: "onyxlab.dev",
    metTarget: "Hash met network target! (demo does not broadcast)",
    extranonce: "Extranonce",
    cores: "Suggested workers",
    sharesAccepted: "Accepted",
    sharesRejected: "Rejected",
    sharesSubmitted: "Submitted",
    jobsReceived: "Jobs",
    poolStatus: "Status",
    lastShare: "Last share",
    poolFee: "Notes",
    selectPool: "Select a pool",
    needAddress: "Enter an address or worker login",
    coinBlocked: "This coin is not available for real mining yet",
    highDiffWarn:
      "This pool’s share difficulty is high — accepted shares may be rare in a browser. Hashrate and protocol are still real.",
    proxyNote: "Proxy: stratum.onyxlab.dev (allowlisted pool hosts only)",
  },
} as const;

export type MessageKey = keyof (typeof dict)["zh-Hant"];

export function isLocale(v: unknown): v is Locale {
  return v === "zh-Hant" || v === "en";
}

export function localeFromAcceptLanguage(al: string): Locale {
  return al.toLowerCase().startsWith("zh") ? "zh-Hant" : "en";
}

export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  let s: string = dict[locale][key] ?? dict["zh-Hant"][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`)
  );
  const raw = match ? decodeURIComponent(match[1]) : null;
  return isLocale(raw) ? raw : null;
}

export function readLocaleStorage(): Locale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function detectInitialLocale(): Locale {
  const stored = readLocaleCookie() ?? readLocaleStorage();
  if (stored) return stored;
  if (typeof navigator !== "undefined" && navigator.language) {
    return localeFromAcceptLanguage(navigator.language);
  }
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale) {
  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax`;
  }
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "en" ? "en" : "zh-Hant";
  }
}
