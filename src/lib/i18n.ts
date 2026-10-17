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
    appName: "Online Solo Miner",
    brandSub: "Onyx Labs",
    tagline: "瀏覽器 BTC／BCH 真實 Stratum 挖礦＋本地演示",
    language: "語言",
    disclaimerTitle: "重要聲明",
    disclaimerSummary:
      "瀏覽器算力極低 · 僅供學習 · 不自動開始",
    disclaimer:
      "瀏覽器算力通常只有數十～數百 KH/s，對 BTC／BCH 幾乎無經濟收益。此工具供學習 Stratum 協議與 PoW。不會自動開始；私鑰不會出現在此站。",
    privacy:
      "真實模式經 Onyx Cloudflare Worker（stratum.onyxlab.dev）轉發到你選的礦池；地址只作 stratum 使用者名稱。",
    proxyNote: "Proxy：stratum.onyxlab.dev（僅允許精選礦池主機）",
    disclaimerDetails: "詳情",
    modeDemo: "本地演示",
    modePool: "真實礦池",
    modeDemoHint: "不上礦池",
    setup: "SETUP",
    hud: "HUD",
    coin: "幣種",
    pool: "礦池",
    kindSolo: "Solo",
    kindPool: "共同礦池",
    poolKindSolo: "Solo",
    poolKindShared: "共同礦池",
    poolKindSharedHint:
      "共同礦池（PPLNS）按 share 分獎。瀏覽器算力極低，Accepted／收益都很少，但比 Solo 獨自撞塊穩一点。難度跟池走。",
    poolKindSoloHint:
      "Solo：中獎獨拿整塊獎勵。瀏覽器幾乎不可能中塊；低難度池（如 NerdMiners）主要用來練 Accepted。",
    statusSupported: "可用",
    statusComing: "即將推出",
    statusUnsupported: "不支援",
    addressLabel: "獎勵地址／礦工帳號",
    addressPlaceholder: "bc1… / 1… 或礦池要求的帳號.worker",
    addressHint: "多數 Solo：填 BTC 地址即可。ViaBTC 等需先註冊子帳號。",
    addressInvalid: "地址／帳號格式看起來無效",
    addressOk: "格式看起來可用",
    passwordLabel: "密碼（多數填 x）",
    start: "▶ 開始挖礦",
    stop: "■ 停止",
    connectingBtn: "連線中…",
    mining: "挖礦中",
    idle: "待機",
    statusIdle: "待機",
    statusConnecting: "連線中",
    statusAuthorized: "已授權",
    statusMining: "挖礦中",
    statusError: "錯誤",
    statusAuthFailed: "授權失敗",
    statusUnknown: "狀態：{raw}",
    hashrate: "算力",
    hashesTried: "已嘗試雜湊",
    bestHash: "目前最佳雜湊",
    workers: "瀏覽器執行緒",
    etaFirstShare: "預估第一筆 Accepted",
    poolSearchNote: "官網 worker／算力＝Accepted 後才有（ESP32 亦同）。站內「瀏覽器執行緒」只代表本機雜湊，不是礦池 worker 數。",
    buildStamp: "建置",
    stratumUser: "實際送出的礦工名稱",
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
    sharesStaleDropped: "過期未交",
    jobsReceived: "工作數",
    poolStatus: "連線狀態",
    lastShare: "最近 share",
    poolFee: "說明",
    selectPool: "請選擇礦池",
    needAddress: "請填寫地址或礦工帳號",
    coinBlocked: "此幣種尚未支援真實挖礦",
    coinAlgoBlocked: "瀏覽器不支援此演算法",
    highDiffWarn:
      "對照 ESP32／NerdMiner：public-pool 原始碼只在 Accepted share 後才寫入 worker；官網「有幾個 worker」≠ 連上就顯示。NerdMiner 靠 suggest_difficulty≈0.00015 快速交 share；但 managed public-pool.io 現況地板=1（GitHub #152，ESP32 同樣受影響）。站內看 Accepted；請改選「NerdMiners.org Solo」或「SoloMining.de」（實測難度 0.001／0.00015）。",
    connectWallet: "連接錢包",
    disconnectWallet: "中斷連接",
    connectedAs: "已連接",
    walletPick: "選擇錢包",
    walletNone: "未偵測到 BTC 瀏覽器錢包（UniSat／OKX／Leather／Xverse）",
    walletInstall: "安裝",
    walletConnecting: "連接中…",
    walletError: "連接失敗",
    walletRejected: "已取消連接",
    walletCleared: "已清除錢包地址",
    disconnectConfirm: "要清除已填入的獎勵地址嗎？",
    walletHint: "僅讀取支付地址填入上方欄位，不會要求簽名或私鑰。可手動修改。",
    walletBchNote: "BCH 請手動貼上地址（或 ViaBTC 帳號）；錢包連接目前支援 BTC。",
    mergeLtcLabel: "LTC 合併挖礦地址（必填）",
    mergeLtcHint: "DOGE 多為 LTC AuxPoW 合併；使用者名稱／密碼會依礦池規則自動組合。",
    mergeLtcPlaceholder: "ltc1… 或 L…／M…",
    needMergeLtc: "請填寫 LTC 合併地址",
    scryptSlowWarn:
      "Scrypt（LTC／DOGE）在瀏覽器通常只有約百 H/s，遠慢於 SHA256d 的 KH/s，僅供學習。",
    startDisabledNoNetwork: "需先載入網路資料",
    startDisabledAddress: "請填寫有效地址",
    startDisabledCoin: "此幣種不可挖",
    startDisabledPool: "請選擇礦池",
    startDisabledMerge: "請填寫有效 LTC 合併地址",
    shareAcceptedToast: "Share 已接受",
    shareRejectedToast: "Share 被拒絕",
    statusWaitingJob: "等待礦池派工",
    waitingJobHint: "已授權，尚無工作 — 礦池可能稍後才派 mining.notify；請確認地址格式（Public Pool：BTC 地址，可加 .worker）。",
    waitingJobToast: "已連上礦池，等待派工…",
    poolAuthorizedToast: "礦池已授權",
    viewPoolStatus: "在礦池查看狀態",
    viewPoolStatusHint: "新分頁開啟礦池儀表板；有地址時盡量直達該地址狀態頁。",
    viewPoolStatusPaste: "開啟後請在礦池頁貼上你的地址搜尋。",
    poolDashboard: "礦池狀態",
  },
  en: {
    appName: "Online Solo Miner",
    brandSub: "Onyx Labs",
    tagline: "Browser BTC/BCH real Stratum mining + local demo",
    language: "Language",
    disclaimerTitle: "Important disclaimer",
    disclaimerSummary:
      "Browser hashrate is tiny · learning only · never auto-starts",
    disclaimer:
      "Browser hashrate is typically tens–hundreds of KH/s — not economically useful for BTC/BCH. This is for learning Stratum and PoW. Mining never auto-starts; we never ask for private keys.",
    privacy:
      "Pool mode tunnels via an Onyx Cloudflare Worker (stratum.onyxlab.dev) to your chosen pool; your address is only used as the Stratum username.",
    proxyNote: "Proxy: stratum.onyxlab.dev (allowlisted pool hosts only)",
    disclaimerDetails: "Details",
    modeDemo: "Local demo",
    modePool: "Real pool",
    modeDemoHint: "No pool",
    setup: "SETUP",
    hud: "HUD",
    coin: "Coin",
    pool: "Pool",
    kindSolo: "Solo",
    kindPool: "Shared pool",
    poolKindSolo: "Solo",
    poolKindShared: "Shared pool",
    poolKindSharedHint:
      "Shared PPLNS pays by shares. Browser hashrate is tiny — rare Accepted and near-zero payout — but steadier than solo block lottery. Difficulty follows the pool.",
    poolKindSoloHint:
      "Solo: you keep a full block if you find one. Browsers almost never will; low-diff pools (e.g. NerdMiners) are mainly for practicing Accepted shares.",
    statusSupported: "Supported",
    statusComing: "Coming soon",
    statusUnsupported: "Unsupported",
    addressLabel: "Payout address / worker login",
    addressPlaceholder: "bc1… / 1… or pool account.worker",
    addressHint:
      "Most solo pools: your coin address. ViaBTC etc. need a registered sub-account.",
    addressInvalid: "Address / login format looks invalid",
    addressOk: "Format looks usable",
    passwordLabel: "Password (usually x)",
    start: "▶ Start mining",
    stop: "■ Stop",
    connectingBtn: "Connecting…",
    mining: "Mining",
    idle: "Idle",
    statusIdle: "Idle",
    statusConnecting: "Connecting",
    statusAuthorized: "Authorized",
    statusMining: "Mining",
    statusError: "Error",
    statusAuthFailed: "Auth failed",
    statusUnknown: "Status: {raw}",
    hashrate: "Hashrate",
    hashesTried: "Hashes tried",
    bestHash: "Best hash so far",
    workers: "Browser threads",
    etaFirstShare: "ETA to first Accepted",
    poolSearchNote: "Pool workers/hashrate appear only after Accepted (ESP32 same). On-site browser threads ≠ pool worker count.",
    buildStamp: "Build",
    stratumUser: "Stratum username sent",
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
    sharesStaleDropped: "Stale dropped",
    jobsReceived: "Jobs",
    poolStatus: "Status",
    lastShare: "Last share",
    poolFee: "Notes",
    selectPool: "Select a pool",
    needAddress: "Enter an address or worker login",
    coinBlocked: "This coin is not available for real mining yet",
    coinAlgoBlocked: "This algorithm is not supported in the browser",
    highDiffWarn:
      "vs ESP32/NerdMiner: public-pool only inserts a worker after an Accepted share — connect alone does not list you. NerdMiner used suggest_difficulty≈0.00015 for fast shares; managed public-pool.io now floors at 1 (GitHub #152; ESP32 hit the same). Watch on-site Accepted, switch to NerdMiners.org Solo or SoloMining.de (probed diff 0.001 / 0.00015).",
    connectWallet: "Connect wallet",
    disconnectWallet: "Disconnect",
    connectedAs: "Connected",
    walletPick: "Choose wallet",
    walletNone:
      "No BTC browser wallet detected (UniSat / OKX / Leather / Xverse)",
    walletInstall: "Install",
    walletConnecting: "Connecting…",
    walletError: "Connection failed",
    walletRejected: "Connection cancelled",
    walletCleared: "Cleared wallet address",
    disconnectConfirm: "Clear the filled payout address?",
    walletHint:
      "We only read your payment address into the field above — no signing, no private keys. You can edit it manually.",
    walletBchNote:
      "For BCH, paste an address (or ViaBTC login) manually; wallet connect supports BTC for now.",
    mergeLtcLabel: "LTC merge-mine address (required)",
    mergeLtcHint:
      "DOGE is usually AuxPoW-merged with LTC; username/password are built per pool rules.",
    mergeLtcPlaceholder: "ltc1… or L…/M…",
    needMergeLtc: "Enter an LTC merge address",
    scryptSlowWarn:
      "Browser Scrypt (LTC/DOGE) is typically ~100s H/s — much slower than SHA256d KH/s. Learning only.",
    startDisabledNoNetwork: "Load network data first",
    startDisabledAddress: "Enter a valid address",
    startDisabledCoin: "This coin cannot be mined",
    startDisabledPool: "Select a pool",
    startDisabledMerge: "Enter a valid LTC merge address",
    shareAcceptedToast: "Share accepted",
    shareRejectedToast: "Share rejected",
    statusWaitingJob: "Waiting for pool job",
    waitingJobHint: "Authorized, but no job yet — the pool may send mining.notify shortly. Check username format (Public Pool: BTC address, optional .worker).",
    waitingJobToast: "Connected — waiting for pool work…",
    poolAuthorizedToast: "Pool authorized",
    viewPoolStatus: "View status on pool",
    viewPoolStatusHint: "Opens the pool dashboard in a new tab; deep-links to your address when filled.",
    viewPoolStatusPaste: "On the pool page, paste your address to search.",
    poolDashboard: "Pool status",
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
