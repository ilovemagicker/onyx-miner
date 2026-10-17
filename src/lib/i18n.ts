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
    tagline: "瀏覽器端 BTC Solo 挖礦演示",
    language: "語言",
    disclaimerTitle: "重要聲明",
    disclaimer:
      "這是教育／演示工具。瀏覽器算力通常只有數十～數百 KH/s，相對全網 EH/s 可忽略；solo 挖到區塊的機率趨近於零，不會獲利。不會自動挖礦，也不會把你的地址送到第三方礦池。",
    privacy:
      "挖礦只在你的瀏覽器執行；獎勵地址只存在本機（除非你自行複製分享）。",
    addressLabel: "BTC 獎勵地址（可選）",
    addressPlaceholder: "bc1… 或 1… / 3…",
    addressHint: "演示用顯示／coinbase 標記；不會代你廣播區塊。",
    addressInvalid: "地址格式無效",
    addressOk: "地址格式看起來有效",
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
    target: "目標（bits）",
    tipHash: "最新區塊",
    timeToBlock: "預估出塊時間（以目前算力）",
    network: "網路狀態",
    refreshNetwork: "重新整理網路資料",
    loadingNetwork: "載入 Bitcoin 網路資料…",
    networkError: "無法取得網路資料（mempool.space）",
    howItWorks: "運作方式",
    howBody:
      "使用 Web Workers 對 80-byte 區塊標頭做雙重 SHA-256（SHA256d）。標頭以 mempool.space 的 tip／bits 組出，並用你的地址與 extranonce 產生演示用 merkle root。Nonce 用盡後會遞增 extranonce。不會連線未知礦池，也不會自動開始。",
    footer: "由 Onyx Labs 製作 · miner.onyxlab.dev",
    homeLink: "onyxlab.dev",
    metTarget: "理論上碰到目標！（演示不會廣播）",
    extranonce: "Extranonce",
    nonce: "Nonce 進度",
    cores: "建議執行緒",
  },
  en: {
    appName: "Miner",
    brandSub: "Onyx Labs",
    tagline: "Browser BTC solo mining demo",
    language: "Language",
    disclaimerTitle: "Important disclaimer",
    disclaimer:
      "Educational demo only. Browser hashrate is typically tens–hundreds of KH/s versus network EH/s — solo block chance is effectively zero; this will not profit. Mining never starts until you click Start, and we do not send your address to a third-party pool.",
    privacy:
      "Mining runs entirely in your browser; the reward address stays local unless you copy it yourself.",
    addressLabel: "BTC reward address (optional)",
    addressPlaceholder: "bc1… or 1… / 3…",
    addressHint: "Used for display / coinbase tag in this demo; we never broadcast blocks for you.",
    addressInvalid: "Invalid address format",
    addressOk: "Address format looks valid",
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
    target: "Target (bits)",
    tipHash: "Tip hash",
    timeToBlock: "Est. time to block at current hashrate",
    network: "Network",
    refreshNetwork: "Refresh network data",
    loadingNetwork: "Loading Bitcoin network data…",
    networkError: "Could not fetch network data (mempool.space)",
    howItWorks: "How it works",
    howBody:
      "Web Workers run double SHA-256 (SHA256d) over 80-byte block headers built from mempool.space tip/bits, with a demo merkle root from your address + extranonce. When the nonce space is exhausted we bump extranonce. No unknown pools; no auto-start.",
    footer: "Built by Onyx Labs · miner.onyxlab.dev",
    homeLink: "onyxlab.dev",
    metTarget: "Hash met network target! (demo does not broadcast)",
    extranonce: "Extranonce",
    nonce: "Nonce progress",
    cores: "Suggested workers",
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
