"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageSwitcher, useI18n } from "@/components/locale-provider";
import {
  estimateTimeToBlock,
  formatDuration,
  formatHashrate,
  formatNumber,
  validateBtcAddress,
  validateLtcAddress,
  validateDogeAddress,
  type NetworkSnapshot,
} from "@/lib/bitcoin";
import { buildStratumCredentials } from "@/lib/stratum-credentials";
import {
  MineController,
  clampWorkerCount,
  maxWorkers,
  suggestedWorkers,
} from "@/lib/mine-controller";
import type { MineStats } from "@/lib/mine-controller";
import {
  COINS,
  poolsForCoin,
  resolvePoolStatusUrl,
  type CoinId,
  type PoolInfo,
} from "@/lib/pools";
import {
  PoolMineController,
  type PoolMineStats,
} from "@/lib/pool-mine-controller";
import { WalletConnectBar } from "@/components/wallet-connect";
import { RankBoardPanel } from "@/components/rank-board";
import { MinerCharacter } from "@/components/miner-character";
import type { MessageKey } from "@/lib/i18n";
import {
  emptyRankBoard,
  fetchRankBoard,
  reportRankProgress,
  upsertRankEntry,
  type RankBoard as RankBoardData,
} from "@/lib/rank";

const ADDR_KEY = "onyx_miner_address";
const MODE_KEY = "onyx_miner_mode";
const COIN_KEY = "onyx_miner_coin";
const POOL_KEY = "onyx_miner_pool";
const WORKERS_KEY = "onyx_miner_workers";

type Mode = "demo" | "pool";
type Layer = "none" | "rank" | "about" | "pools";

function mapPoolStatus(
  status: string,
  mining: boolean,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): { label: string; lamp: string } {
  switch (status) {
    case "idle":
      return { label: t("statusIdle"), lamp: "idle" };
    case "connecting":
    case "tcp_connected":
      return { label: t("statusConnecting"), lamp: "connecting" };
    case "authorized":
      return { label: t("statusAuthorized"), lamp: "authorized" };
    case "waiting_job":
      return { label: t("statusWaitingJob"), lamp: "authorized" };
    case "mining":
      return { label: t("statusMining"), lamp: "mining" };
    case "auth_failed":
      return { label: t("statusAuthFailed"), lamp: "error" };
    case "error":
      return { label: t("statusError"), lamp: "error" };
    case "closed":
    case "tcp_closed":
      return {
        label: mining ? t("statusError") : t("statusIdle"),
        lamp: mining ? "error" : "idle",
      };
    default:
      return {
        label: t("statusUnknown", { raw: status }),
        lamp: "idle",
      };
  }
}


function etaFirstShareLabel(
  hashrate: number,
  difficulty: number,
  locale: "zh-Hant" | "en"
): string {
  if (!Number.isFinite(hashrate) || hashrate <= 0 || !Number.isFinite(difficulty) || difficulty <= 0) {
    return "—";
  }
  // ~2^32 hashes per difficulty-1 share
  const seconds = (difficulty * 0x100000000) / hashrate;
  return formatDuration(seconds, locale);
}

function StatCard({
  label,
  children,
  accent,
  flash,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
  flash?: "ok" | "danger" | null;
}) {
  return (
    <div
      className={`pixel-panel p-3 sm:p-4 ${accent ? "mining-glow" : ""} ${
        flash === "ok" ? "share-flash" : flash === "danger" ? "share-flash-danger" : ""
      }`}
    >
      <div className="pixel-label mb-1">{label}</div>
      <div className="text-zinc-100">{children}</div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className="inline-block opacity-70"
      aria-hidden
    >
      <rect x="3" y="5" width="6" height="5" fill="currentColor" />
      <path
        d="M4 5V3.5a2 2 0 0 1 4 0V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function MinerApp() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>("pool");
  const [coin, setCoin] = useState<CoinId>("BTC");
  const [poolId, setPoolId] = useState<string>("btc-nerdminers-org");
  /** Solo vs shared (PPLNS) — filters the pool list. */
  const [poolKind, setPoolKind] = useState<"solo" | "pool">("solo");
  /** Concurrent mining workers (performance mode). */
  const [workerCount, setWorkerCount] = useState(1);
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("x");
  const [mergeLtc, setMergeLtc] = useState("");
  const [addrTouched, setAddrTouched] = useState(false);
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"default" | "rare">("default");
  const prevPossibleBlockAt = useRef(0);
  const [stratumUserShown, setStratumUserShown] = useState("");
  const [acceptedFlash, setAcceptedFlash] = useState(false);
  const [rejectedFlash, setRejectedFlash] = useState(false);
  const prevAccepted = useRef(0);
  const prevRejected = useRef(0);
  const prevStatus = useRef("idle");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [demoStats, setDemoStats] = useState<MineStats>({
    hashrate: 0,
    totalHashes: 0,
    bestHashHex: "f".repeat(64),
    bestNonce: 0,
    extranonce: 0,
    workerCount: 0,
    found: false,
  });
  const [poolStats, setPoolStats] = useState<PoolMineStats>({
    hashrate: 0,
    totalHashes: 0,
    bestHashHex: "f".repeat(64),
    difficulty: 1,
    accepted: 0,
    rejected: 0,
    submitted: 0,
    staleDropped: 0,
    jobs: 0,
    status: "idle",
    workerCount: 0,
  });

  const [rankBoard, setRankBoard] = useState<RankBoardData>(() => emptyRankBoard());
  const rankHashTick = useRef(0);
  const prevAcceptedForRank = useRef(0);

  /** One-screen UX: overlays + collapsible panels (presentation only). */
  const [layer, setLayer] = useState<Layer>("none");
  const [bestExpanded, setBestExpanded] = useState(false);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false);
  const [setupMiningCollapsed, setSetupMiningCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const demoRef = useRef<MineController | null>(null);
  const poolRef = useRef<PoolMineController | null>(null);
  const workerMax = useMemo(() => maxWorkers(), []);
  const workerDefault = useMemo(() => suggestedWorkers(), []);
  const workerPresets = useMemo(
    () => [1, 2, 4, 8].filter((n) => n <= workerMax),
    [workerMax]
  );
  const workerLagWarn = workerCount > Math.max(1, Math.floor(workerMax / 2));

  const coinInfo = COINS.find((c) => c.id === coin)!;
  const pools = useMemo(() => {
    const all = poolsForCoin(coin);
    const filtered = all.filter((p) => p.kind === poolKind);
    // Fallback if coin has no pools of this kind (e.g. some alts).
    return filtered.length > 0 ? filtered : all;
  }, [coin, poolKind]);
  const selectedPool: PoolInfo | undefined =
    pools.find((p) => p.id === poolId) ?? pools[0];

  const showToast = useCallback((msg: string, opts?: { tone?: "default" | "rare"; ms?: number }) => {
    setToast(msg);
    setToastTone(opts?.tone ?? "default");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), opts?.ms ?? 4500);
  }, []);

  const addrCheck = useMemo(() => {
    if (!address.trim()) return null;
    if (coin === "BCH" && selectedPool?.id === "bch-viabtc") {
      return address.trim().length >= 3
        ? { ok: true as const }
        : { ok: false as const };
    }
    if (coin === "LTC") return validateLtcAddress(address);
    if (coin === "DOGE") return validateDogeAddress(address);
    return validateBtcAddress(address);
  }, [address, coin, selectedPool?.id]);

  const mergeLtcCheck = useMemo(() => {
    if (coin !== "DOGE" || selectedPool?.mergeHint !== "ltc-for-doge")
      return null;
    if (!mergeLtc.trim()) return null;
    return validateLtcAddress(mergeLtc);
  }, [coin, selectedPool?.mergeHint, mergeLtc]);

  useEffect(() => {
    try {
      const a = localStorage.getItem(ADDR_KEY);
      if (a) setAddress(a);
      const m = localStorage.getItem(MODE_KEY);
      if (m === "demo" || m === "pool") setMode(m);
      const c = localStorage.getItem(COIN_KEY) as CoinId | null;
      if (c && COINS.some((x) => x.id === c)) {
        const info = COINS.find((x) => x.id === c);
        if (info && info.status === "supported") setCoin(c);
      }
      const p = localStorage.getItem(POOL_KEY);
      if (p) setPoolId(p);
      const w = localStorage.getItem(WORKERS_KEY);
      if (w) {
        const n = Number(w);
        if (Number.isFinite(n)) setWorkerCount(clampWorkerCount(n));
        else setWorkerCount(suggestedWorkers());
      } else {
        setWorkerCount(suggestedWorkers());
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (address.trim()) localStorage.setItem(ADDR_KEY, address.trim());
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(COIN_KEY, coin);
      if (selectedPool) localStorage.setItem(POOL_KEY, selectedPool.id);
      localStorage.setItem(WORKERS_KEY, String(workerCount));
    } catch {
      /* ignore */
    }
  }, [address, mode, coin, selectedPool, workerCount]);

  useEffect(() => {
    if (!pools.some((p) => p.id === poolId) && pools[0]) {
      setPoolId(pools[0].id);
    }
  }, [pools, poolId]);

  useEffect(() => {
    setWorkerCount((n) => clampWorkerCount(n));
  }, [workerMax]);

  useEffect(() => {
    if (!selectedPool || mining) return;
    if (
      selectedPool.password === "DOGE=" ||
      selectedPool.password === "doge="
    ) {
      setPassword("x");
    } else if (selectedPool.password && selectedPool.password !== password) {
      setPassword(selectedPool.password || "x");
    }
  }, [selectedPool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadNetwork = useCallback(async () => {
    setNetLoading(true);
    setNetError(null);
    try {
      const res = await fetch("/api/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NetworkSnapshot & { error?: string };
      if (data.error) throw new Error(data.error);
      setNetwork(data);
    } catch (e) {
      setNetError(e instanceof Error ? e.message : "error");
      setNetwork(null);
    } finally {
      setNetLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNetwork();
    const id = setInterval(() => {
      if (!demoRef.current?.isRunning() && !poolRef.current?.isRunning()) {
        void loadNetwork();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [loadNetwork]);

  useEffect(() => {
    const d = new MineController();
    demoRef.current = d;
    const u1 = d.subscribe(setDemoStats);
    const p = new PoolMineController();
    poolRef.current = p;
    const u2 = p.subscribe(setPoolStats);
    return () => {
      u1();
      u2();
      d.stop();
      p.stop();
      demoRef.current = null;
      poolRef.current = null;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Global rank: poll server board so everyone sees the same list
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const board = await fetchRankBoard("accepted", 20);
        if (!cancelled) setRankBoard(board);
      } catch {
        /* keep last snapshot */
      }
    };
    void load();
    const id = setInterval(() => {
      void load();
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Lifetime Accepted → report to global rank (wallet-keyed)
  useEffect(() => {
    if (mode !== "pool") return;
    const key = address.trim();
    const next = poolStats.accepted;
    // Session reset (controller start) — do not treat as negative
    if (next < prevAcceptedForRank.current) {
      prevAcceptedForRank.current = next;
      return;
    }
    if (!key) {
      prevAcceptedForRank.current = next;
      return;
    }
    const prev = prevAcceptedForRank.current;
    if (next > prev) {
      const delta = next - prev;
      prevAcceptedForRank.current = next;
      void (async () => {
        try {
          const entry = await reportRankProgress({
            wallet: key,
            acceptedDelta: delta,
          });
          if (entry) {
            setRankBoard((board) => upsertRankEntry(board, entry));
          }
        } catch {
          /* ignore transient report errors */
        }
      })();
      return;
    }
    prevAcceptedForRank.current = next;
  }, [poolStats.accepted, mode, address]);

  useEffect(() => {
    if (mode !== "pool" || !mining) return;
    const key = address.trim();
    if (!key) return;
    const hr = poolStats.hashrate;
    if (!Number.isFinite(hr) || hr <= 0) return;
    const now = Date.now();
    if (now - rankHashTick.current < 5000) return;
    rankHashTick.current = now;
    void (async () => {
      try {
        const entry = await reportRankProgress({
          wallet: key,
          peakHashrate: hr,
        });
        if (entry) {
          setRankBoard((board) => upsertRankEntry(board, entry));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [poolStats.hashrate, mode, mining, address]);

    // Share flash + authorized toast
  useEffect(() => {
    if (mode !== "pool") return;
    if (poolStats.accepted > prevAccepted.current) {
      setAcceptedFlash(true);
      const tId = setTimeout(() => setAcceptedFlash(false), 200);
      prevAccepted.current = poolStats.accepted;
      return () => clearTimeout(tId);
    }
    prevAccepted.current = poolStats.accepted;
  }, [poolStats.accepted, mode]);

  // Rare: Accepted share also met network nbits target
  useEffect(() => {
    if (mode !== "pool") return;
    const hint = poolStats.possibleBlockHint;
    if (!hint || hint.at <= prevPossibleBlockAt.current) return;
    prevPossibleBlockAt.current = hint.at;
    showToast(t("possibleBlockToast"), { tone: "rare", ms: 12000 });
  }, [poolStats.possibleBlockHint, mode, showToast, t]);

  useEffect(() => {
    if (mode !== "pool") return;
    if (poolStats.rejected > prevRejected.current) {
      setRejectedFlash(true);
      const tId = setTimeout(() => setRejectedFlash(false), 200);
      prevRejected.current = poolStats.rejected;
      return () => clearTimeout(tId);
    }
    prevRejected.current = poolStats.rejected;
  }, [poolStats.rejected, mode]);

  useEffect(() => {
    if (mode !== "pool") return;
    if (
      (prevStatus.current === "connecting" ||
        prevStatus.current === "tcp_connected") &&
      poolStats.status === "authorized"
    ) {
      showToast(t("poolAuthorizedToast"));
    }
    if (
      prevStatus.current !== "waiting_job" &&
      poolStats.status === "waiting_job"
    ) {
      showToast(t("waitingJobToast"));
    }
    prevStatus.current = poolStats.status;
  }, [poolStats.status, mode, showToast, t]);

  const onStart = async () => {
    if (mode === "demo") {
      if (!network || !demoRef.current) return;
      if (address.trim() && addrCheck && !addrCheck.ok) return;
      demoRef.current.setAddress(address);
      demoRef.current.start(network, workerCount);
      setMining(true);
      return;
    }
    if (!selectedPool || !poolRef.current) return;
    if (coinInfo.status !== "supported") return;
    if (!address.trim()) return;
    if (addrCheck && !addrCheck.ok) return;
    if (
      selectedPool.mergeHint === "ltc-for-doge" &&
      (!mergeLtc.trim() || (mergeLtcCheck && !mergeLtcCheck.ok))
    ) {
      return;
    }
    const creds = buildStratumCredentials({
      pool: selectedPool,
      address,
      password: password || "x",
      mergeLtc,
    });
    if (creds.user) setStratumUserShown(creds.user);
    if (creds.error || !creds.user) return;
    setMining(true);
    await poolRef.current.start(selectedPool, creds.user, creds.password, workerCount);
    if (!poolRef.current.isRunning()) setMining(false);
  };

  const onStop = () => {
    demoRef.current?.stop();
    poolRef.current?.stop();
    setMining(false);
  };

  const liveHashrate =
    mode === "demo" ? demoStats.hashrate : poolStats.hashrate;
  const liveHashes =
    mode === "demo" ? demoStats.totalHashes : poolStats.totalHashes;
  const liveBest =
    mode === "demo" ? demoStats.bestHashHex : poolStats.bestHashHex;
  const liveWorkers =
    mode === "demo"
      ? demoStats.workerCount || workerCount
      : // Pool mode: show real worker count (do not mask 0 with the hint)
        poolStats.workerCount;

  const eta = useMemo(() => {
    if (!network || liveHashrate <= 0 || mode !== "demo") return null;
    const secs = estimateTimeToBlock(liveHashrate, network.difficulty);
    return formatDuration(secs, locale);
  }, [network, liveHashrate, locale, mode]);

  const highDiff = mode === "pool" && poolStats.difficulty >= 1 && mining;

  const poolStatusHref = useMemo(() => {
    if (mode !== "pool" || !selectedPool) return null;
    return resolvePoolStatusUrl(selectedPool, address);
  }, [mode, selectedPool, address]);

  const poolStatusDeepLinked = Boolean(
    poolStatusHref &&
      selectedPool?.statusUrlTemplate &&
      address.trim()
  );

  const showPoolStatusLink =
    mode === "pool" &&
    Boolean(poolStatusHref) &&
    (mining ||
      poolStats.status === "authorized" ||
      poolStats.status === "waiting_job" ||
      poolStats.status === "mining" ||
      poolStats.status === "connecting");
  const scryptCoin = coin === "LTC" || coin === "DOGE";

  const statusUi = useMemo(() => {
    if (mode === "demo") {
      if (mining)
        return { label: t("statusMining"), lamp: "mining" as const };
      return { label: t("statusIdle"), lamp: "idle" as const };
    }
    return mapPoolStatus(poolStats.status, mining, t);
  }, [mode, mining, poolStats.status, t]);

  const startDisabledReason = useMemo((): string | null => {
    if (mining) return null;
    if (mode === "demo") {
      if (!network || netLoading) return t("startDisabledNoNetwork");
      if (address.trim() && addrCheck && !addrCheck.ok)
        return t("startDisabledAddress");
      return null;
    }
    if (coinInfo.status !== "supported") return t("startDisabledCoin");
    if (!selectedPool) return t("startDisabledPool");
    if (!address.trim() || (addrCheck && !addrCheck.ok))
      return t("startDisabledAddress");
    if (
      selectedPool.mergeHint === "ltc-for-doge" &&
      (!mergeLtc.trim() || (mergeLtcCheck && !mergeLtcCheck.ok))
    ) {
      return t("startDisabledMerge");
    }
    return null;
  }, [
    mining,
    mode,
    network,
    netLoading,
    address,
    addrCheck,
    coinInfo.status,
    selectedPool,
    mergeLtc,
    mergeLtcCheck,
    t,
  ]);

  const canStart = !mining && startDisabledReason === null;
  const isConnecting =
    mode === "pool" && mining && poolStats.status === "connecting";

  const openLayer = useCallback((next: Layer) => {
    setLayer(next);
    if (next === "rank") {
      if (typeof window !== "undefined") window.location.hash = "rank";
    } else if (next === "about") {
      if (typeof window !== "undefined") window.location.hash = "about";
    } else if (next === "pools") {
      /* stay on mine; overlay only */
    } else if (typeof window !== "undefined" && (window.location.hash === "#rank" || window.location.hash === "#about")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const closeLayer = useCallback(() => {
    setLayer("none");
    if (typeof window !== "undefined" && (window.location.hash === "#rank" || window.location.hash === "#about")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
      if (h === "rank") setLayer("rank");
      else if (h === "about") setLayer("about");
      else if (h === "settings") {
        setMobileSetupOpen(true);
        setSetupMiningCollapsed(false);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    if (!mining) setSetupMiningCollapsed(false);
  }, [mining]);

  const onCoinClick = (id: CoinId) => {
    const info = COINS.find((c) => c.id === id);
    if (!info) return;
    if (info.status !== "supported") {
      showToast(t("coinAlgoBlocked"));
      return;
    }
    setCoin(id);
  };

  const inputCls =
    "mono w-full border-2 border-border bg-surface-2 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none disabled:opacity-60";

  /* —— HUD panel —— */
  const hudPanel = (
    <section className="flex min-h-0 flex-col gap-2 lg:overflow-y-auto" aria-label={t("hud")}>
      <div className="pixel-label text-brand">{t("hud")}</div>
      <div className="grid gap-3 sm:grid-cols-[minmax(140px,200px)_1fr] lg:grid-cols-[minmax(160px,200px)_1fr] lg:items-start">
        <MinerCharacter
          mining={mining}
          label={t("characterLabel")}
          statusLabel={mining ? t("characterMining") : t("characterIdle")}
        />
        <div className="grid grid-cols-3 gap-2 content-start sm:gap-3">
        <StatCard label={t("hashrate")} accent={mining}>
          <div className="hud-num text-base font-bold tracking-tight text-brand sm:text-lg">
            {formatHashrate(liveHashrate)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-muted sm:text-xs">
            {statusUi.label}
            {" · "}
            {liveWorkers} {t("workers").toLowerCase()}
          </div>
        </StatCard>
        {mode === "demo" ? (
          <>
            <StatCard label={t("hashesTried")}>
              <div className="hud-num text-base font-semibold sm:text-lg">
                {formatNumber(liveHashes)}
              </div>
              <div className="mt-0.5 text-[10px] text-muted sm:text-xs">
                {t("extranonce")}: {demoStats.extranonce}
              </div>
            </StatCard>
            <StatCard label={t("timeToBlock")}>
              <div className="text-base font-semibold sm:text-lg">
                {eta ?? "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-muted sm:text-xs">
                {t("cores")}: {workerCount}
              </div>
            </StatCard>
          </>
        ) : (
          <>
            <StatCard
              label={t("sharesAccepted")}
              flash={acceptedFlash ? "ok" : rejectedFlash ? "danger" : null}
            >
              <div className="hud-num text-base font-semibold text-success sm:text-lg">
                {poolStats.accepted}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted sm:text-xs">
                {t("sharesRejected")}:{" "}
                <span className={rejectedFlash ? "text-danger" : ""}>
                  {poolStats.rejected}
                </span>{" "}
                · {t("sharesSubmitted")}: {poolStats.submitted}
                {poolStats.staleDropped > 0 && (
                  <>
                    {" "}
                    · {t("sharesStaleDropped")}: {poolStats.staleDropped}
                  </>
                )}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-warning sm:text-xs">
                {t("etaFirstShare")}:{" "}
                {etaFirstShareLabel(
                  liveHashrate,
                  poolStats.difficulty || 1,
                  locale
                )}
              </div>
            </StatCard>
            <StatCard label={t("shareDiff")}>
              <div className="hud-num text-base font-semibold sm:text-lg">
                {poolStats.difficulty}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted sm:text-xs">
                {t("hashesTried")}: {formatNumber(liveHashes)}
              </div>
            </StatCard>
          </>
        )}
        </div>
      </div>

      {mode === "pool" && (
        <div className="pixel-panel grid shrink-0 gap-2 p-2 text-sm sm:grid-cols-3 sm:p-3">
          <div>
            <div className="text-xs text-muted">{t("poolStatus")}</div>
            <div className="flex items-center gap-2 text-zinc-200">
              <span
                className={`status-lamp status-lamp--${statusUi.lamp}`}
                aria-hidden
              />
              {statusUi.label}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">{t("jobsReceived")}</div>
            <div className="mono">{poolStats.jobs}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted">{t("lastShare")}</div>
            <div className="mono truncate text-xs text-brand">
              {poolStats.lastShareHash ?? "—"}
            </div>
          </div>
          {poolStats.lastError && (
            <div className="sm:col-span-3 truncate text-xs text-danger">
              {poolStats.lastError}
            </div>
          )}
          {mining &&
            (poolStats.status === "waiting_job" ||
              (poolStats.status === "authorized" && poolStats.jobs === 0)) && (
              <div className="sm:col-span-3 truncate text-xs text-amber-400">
                {t("waitingJobHint")}
              </div>
            )}
          {showPoolStatusLink && poolStatusHref && (
            <div className="sm:col-span-3 flex flex-col gap-1">
              <a
                href={poolStatusHref}
                target="_blank"
                rel="noopener noreferrer"
                className="pixel-btn inline-flex w-fit items-center gap-2 border-2 border-brand bg-brand/15 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand hover:text-zinc-950"
              >
                {t("viewPoolStatus")}
                <span aria-hidden>↗</span>
              </a>
            </div>
          )}
          {mining && poolStats.workerCount === 0 && poolStats.status === "mining" && (
              <div className="sm:col-span-3 text-xs text-danger">
                {t("workers")} = 0（瀏覽器雜湊執行緒未啟動 — 請硬重新整理）
              </div>
            )}
        </div>
      )}

      {/* OS-4: Best hash collapsed by default */}
      <div className="pixel-panel shrink-0 p-2 sm:p-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setBestExpanded((v) => !v)}
          aria-expanded={bestExpanded}
        >
          <span className="pixel-label text-brand">{t("bestHash")}</span>
          <span className="mono min-w-0 flex-1 truncate text-xs text-brand">
            {liveBest}
          </span>
          <span className="shrink-0 text-xs text-muted">
            {bestExpanded ? t("collapseLess") : t("expandMore")} ▸
          </span>
        </button>
        {bestExpanded && (
          <div className="mt-2 border-t border-border/60 pt-2">
            <p className="mono break-all text-sm leading-relaxed text-brand">
              {liveBest}
            </p>
            {mode === "demo" && demoStats.found && (
              <p className="mt-2 text-xs text-success">{t("metTarget")}</p>
            )}
            {mode === "pool" && poolStats.possibleBlockHint && (
              <div className="mt-3 border-2 border-success bg-success/10 px-3 py-2 text-sm text-success">
                <p className="font-medium">{t("possibleBlockToast")}</p>
                <p className="mt-1 text-xs opacity-90">{t("possibleBlockHint")}</p>
                <p className="mono mt-1 break-all text-[10px] opacity-70">
                  {poolStats.possibleBlockHint.hashHex}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {highDiff && (
        <div className="shrink-0 border-2 border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("highDiffWarn")}
        </div>
      )}
      {mode === "pool" && scryptCoin && (
        <div className="shrink-0 border-2 border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("scryptSlowWarn")}
        </div>
      )}

      {/* OS-4: demo network card collapsed */}
      {mode === "demo" && (
        <div className="pixel-panel shrink-0 p-2 sm:p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setNetworkExpanded((v) => !v)}
            aria-expanded={networkExpanded}
          >
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("network")}
            </h2>
            <span className="text-xs text-muted">
              {netLoading
                ? t("loadingNetwork")
                : network
                  ? `${formatNumber(network.height)} · ${networkExpanded ? t("collapseLess") : t("expandMore")}`
                  : t("expandMore")}{" "}
              ▸
            </span>
          </button>
          {networkExpanded && (
            <div className="mt-2 border-t border-border/60 pt-2">
              {netError && (
                <p className="mb-3 text-sm text-danger">
                  {t("networkError")}: {netError}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted">{t("height")}</div>
                  <div className="mono text-lg font-medium">
                    {network ? formatNumber(network.height) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t("difficulty")}</div>
                  <div className="mono text-lg font-medium">
                    {network ? network.difficulty.toExponential(4) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t("target")}</div>
                  <div className="mono text-sm">
                    {network ? `0x${network.bitsHex}` : "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted">{t("tipHash")}</div>
                  <div className="mono truncate text-sm text-zinc-300">
                    {network?.tipHash ?? "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Desktop / shared shortcuts under HUD */}
      <div className="mt-auto flex flex-wrap gap-2 pt-1 text-xs">
        <button
          type="button"
          className="text-brand underline-offset-2 hover:underline"
          onClick={() => openLayer("rank")}
        >
          {t("shortcutRank")}
        </button>
        <span className="text-muted">·</span>
        <button
          type="button"
          className="text-brand underline-offset-2 hover:underline"
          onClick={() => openLayer("about")}
        >
          {t("shortcutAbout")}
        </button>
        {mode === "pool" && (
          <>
            <span className="text-muted">·</span>
            <button
              type="button"
              className="text-brand underline-offset-2 hover:underline"
              onClick={() => openLayer("pools")}
            >
              {t("shortcutPools")}
            </button>
          </>
        )}
      </div>
    </section>
  );

  /* —— Mode segmented (Q1: shell; locked while mining) —— */
  const modeSegmented = (
    <div
      className="inline-flex border-2 border-border bg-surface-2 p-0.5 text-sm"
      role="group"
      aria-label={t("modeSegmentAria")}
    >
      {(["pool", "demo"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          disabled={mining}
          onClick={() => setMode(m)}
          className={`px-3 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === m
              ? "bg-brand-soft text-zinc-950"
              : "text-muted hover:text-zinc-200"
          }`}
          style={{ borderRadius: 0 }}
          aria-pressed={mode === m}
        >
          {m === "pool" ? t("modePool") : t("modeDemo")}
        </button>
      ))}
    </div>
  );

  /* —— Start / Stop controls —— */
  const startStopControls = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {!mining ? (
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={!canStart}
            className="pixel-btn w-full bg-brand px-5 py-3 text-sm font-bold text-zinc-950 hover:brightness-110 disabled:bg-brand/40 sm:w-auto"
          >
            {t("start")}
          </button>
        ) : isConnecting ? (
          <button
            type="button"
            disabled
            className="pixel-btn w-full bg-warning/80 px-5 py-3 text-sm font-bold text-zinc-950 sm:w-auto"
          >
            {t("connectingBtn")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="pixel-btn w-full bg-danger px-5 py-3 text-sm font-bold text-white hover:brightness-110 sm:w-auto"
          >
            {t("stop")}
          </button>
        )}
        {mode === "demo" && (
          <button
            type="button"
            onClick={() => void loadNetwork()}
            disabled={mining || netLoading}
            className="pixel-btn border-2 border-border bg-transparent px-4 py-2.5 text-sm text-muted hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
          >
            {t("refreshNetwork")}
          </button>
        )}
      </div>
      {!mining && startDisabledReason && (
        <p className="text-xs text-warning">{startDisabledReason}</p>
      )}
    </div>
  );

  const poolKindLabel =
    selectedPool?.kind === "solo"
      ? t("kindSolo")
      : selectedPool
        ? t("kindPool")
        : "—";

  const setupSummaryLine = [
    mode === "pool" ? coin : t("modeDemo"),
    mode === "pool" && selectedPool
      ? `${selectedPool.name} · ${poolKindLabel}`
      : null,
    address.trim()
      ? `${address.trim().slice(0, 8)}…`
      : null,
    `${workerCount}`,
  ]
    .filter(Boolean)
    .join(" · ");

  /* —— Pool picker list (moved into layer — OS-2) —— */
  const poolPickerBody = mode === "pool" && coinInfo.status === "supported" && (
    <div className="space-y-3">
      <div className="inline-flex border-2 border-border bg-surface-2 p-0.5 text-sm">
        {(
          [
            ["solo", "poolKindSolo"],
            ["pool", "poolKindShared"],
          ] as const
        ).map(([k, labelKey]) => (
          <button
            key={k}
            type="button"
            disabled={mining}
            onClick={() => {
              setPoolKind(k);
              const all = poolsForCoin(coin);
              const list = all.filter((p) => p.kind === k);
              const preferred =
                k === "solo"
                  ? list.find((p) => p.id === "btc-nerdminers-org") ?? list[0]
                  : list.find((p) => p.id === "btc-public-pplns") ?? list[0];
              if (preferred) setPoolId(preferred.id);
            }}
            className={`px-3 py-1.5 font-medium transition disabled:opacity-50 ${
              poolKind === k
                ? "bg-brand-soft text-zinc-950"
                : "text-muted hover:text-zinc-200"
            }`}
            style={{ borderRadius: 0 }}
            aria-pressed={poolKind === k}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {poolKind === "solo" ? t("poolKindSoloHint") : t("poolKindSharedHint")}
      </p>
      <div className="grid gap-2">
        {pools.map((p) => {
          const sel = selectedPool?.id === p.id;
          const statusHref = resolvePoolStatusUrl(p, address);
          return (
            <div
              key={p.id}
              className={`border-2 transition ${
                sel
                  ? "border-brand shadow-[inset_0_0_0_1px_#f5a623]"
                  : "border-border hover:border-zinc-500"
              }`}
              style={{ borderRadius: 0 }}
            >
              <button
                type="button"
                disabled={mining}
                onClick={() => {
                  setPoolId(p.id);
                  closeLayer();
                }}
                className="w-full p-3 text-left text-sm disabled:opacity-50"
                style={{ borderRadius: 0 }}
              >
                <div className="font-medium text-zinc-100">
                  {p.name}{" "}
                  <span className="ml-1 border border-border px-1 text-[10px] uppercase text-btc">
                    {p.kind === "solo" ? t("kindSolo") : t("kindPool")}
                  </span>
                </div>
                <div className="mono mt-1 text-xs text-muted">
                  {p.host}:{p.port}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {locale === "en" ? p.feeNote_en : p.feeNote_zh}
                </div>
              </button>
              {statusHref ? (
                <div className="border-t border-border/60 px-3 pb-2.5 pt-1">
                  <a
                    href={statusHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {t("poolDashboard")} ↗
                  </a>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* —— SETUP body fields (shared; compressed — OS-2) —— */
  const setupFields = (
    <div className="space-y-3">
      {mining && (
        <div
          className="border-2 border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning"
          role="status"
        >
          {t("settingsLocked")}
        </div>
      )}

      {mode === "pool" && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              {t("coin")}
            </label>
            <div className="mb-1 flex flex-wrap gap-2">
              {COINS.map((c) => {
                const locked = c.status !== "supported";
                const selected = coin === c.id && !locked;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={mining}
                    onClick={() => onCoinClick(c.id)}
                    className={`border-2 px-2.5 py-1 text-sm font-medium transition disabled:opacity-50 ${
                      locked
                        ? "border-border/60 bg-surface-2 text-zinc-500"
                        : selected
                          ? "border-brand bg-brand text-zinc-950 shadow-[2px_2px_0_#000]"
                          : "border-border text-muted hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                    style={{ borderRadius: 0 }}
                    aria-pressed={selected}
                    title={
                      locked
                        ? t("coinAlgoBlocked")
                        : locale === "en"
                          ? c.note_en
                          : c.note_zh
                    }
                  >
                    {locked && (
                      <span className="mr-1 inline-flex align-middle">
                        <LockIcon />
                      </span>
                    )}
                    {c.id}
                  </button>
                );
              })}
            </div>
          </div>

          {coinInfo.status === "supported" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                {t("poolCurrent")}
              </label>
              <button
                type="button"
                disabled={mining}
                onClick={() => openLayer("pools")}
                className="flex w-full items-center justify-between gap-2 border-2 border-border bg-surface-2 px-3 py-2.5 text-left text-sm transition hover:border-brand disabled:opacity-50"
                style={{ borderRadius: 0 }}
              >
                <span className="min-w-0">
                  <span className="font-medium text-zinc-100">
                    {selectedPool?.name ?? t("selectPool")}
                  </span>
                  <span className="ml-2 border border-border px-1 text-[10px] uppercase text-btc">
                    {poolKindLabel}
                  </span>
                  {selectedPool && (
                    <span className="mono mt-0.5 block truncate text-xs text-muted">
                      {selectedPool.host}:{selectedPool.port}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-brand">
                  {t("changePool")} ▾
                </span>
              </button>
              {selectedPool && (
                <p className="mt-1.5 truncate text-xs text-muted">
                  {t("poolFee")}:{" "}
                  {locale === "en"
                    ? selectedPool.userFormat_en
                    : selectedPool.userFormat_zh}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-warning">{t("coinBlocked")}</p>
          )}
        </>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">
          {t("addressLabel")}
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setAddrTouched(true);
          }}
          placeholder={t("addressPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          disabled={mining}
          className={inputCls}
          style={{ borderRadius: 0 }}
        />
        <WalletConnectBar
          coin={coin}
          mining={mining}
          address={address}
          onAddress={(addr) => {
            setAddress(addr);
            setAddrTouched(true);
          }}
        />
        {addrTouched && address.trim() && addrCheck && (
          <p
            className={`mt-1 text-xs ${
              addrCheck.ok ? "text-success" : "text-danger"
            }`}
          >
            {addrCheck.ok ? t("addressOk") : t("addressInvalid")}
          </p>
        )}
      </div>

      {mode === "pool" && selectedPool?.mergeHint === "ltc-for-doge" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            {t("mergeLtcLabel")}
          </label>
          <input
            type="text"
            value={mergeLtc}
            onChange={(e) => setMergeLtc(e.target.value)}
            placeholder={t("mergeLtcPlaceholder")}
            spellCheck={false}
            disabled={mining}
            className={inputCls}
            style={{ borderRadius: 0 }}
          />
          {mergeLtc.trim() && mergeLtcCheck && (
            <p
              className={`mt-1 text-xs ${
                mergeLtcCheck.ok ? "text-success" : "text-danger"
              }`}
            >
              {mergeLtcCheck.ok ? t("addressOk") : t("addressInvalid")}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">
          {t("perfMode")}
        </label>
        <div className="mb-2 flex flex-wrap gap-2">
          {workerPresets.map((n) => (
            <button
              key={n}
              type="button"
              disabled={mining}
              onClick={() => setWorkerCount(n)}
              className={`border-2 px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                workerCount === n
                  ? "border-brand bg-brand text-zinc-950 shadow-[2px_2px_0_#000]"
                  : "border-border text-muted hover:border-zinc-500 hover:text-zinc-200"
              }`}
              style={{ borderRadius: 0 }}
              aria-pressed={workerCount === n}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={workerMax}
            step={1}
            value={Math.min(workerCount, workerMax)}
            disabled={mining}
            onChange={(e) =>
              setWorkerCount(clampWorkerCount(Number(e.target.value)))
            }
            className="w-full accent-[#f5a623] disabled:opacity-50"
            aria-label={t("workersLabel")}
          />
          <span className="mono shrink-0 text-sm font-semibold text-brand">
            {workerCount}
          </span>
        </div>
        {workerLagWarn && (
          <p className="mt-1.5 text-xs text-warning">{t("workersLagWarn")}</p>
        )}
      </div>

      {mode === "pool" && (
        <div>
          <button
            type="button"
            className="mb-1.5 text-sm font-medium text-zinc-300 underline-offset-2 hover:underline"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
          >
            {t("advanced")} {advancedOpen ? "▾" : "▸"}
          </button>
          {advancedOpen && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                {t("passwordLabel")}
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={mining}
                className={`${inputCls} max-w-xs`}
                style={{ borderRadius: 0 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* —— SETUP panel —— */
  const setupPanel = (
    <section
      id="settings"
      className="dest-section flex min-h-0 flex-col gap-2"
      aria-label={t("setup")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="pixel-label text-brand">{t("setup")}</div>
        {mining && (
          <button
            type="button"
            className="hidden text-xs text-brand underline-offset-2 hover:underline lg:inline"
            onClick={() => setSetupMiningCollapsed((v) => !v)}
          >
            {setupMiningCollapsed ? t("expandSetup") : t("collapseSetup")}
          </button>
        )}
      </div>

      {/* OS-6: mining collapsed summary (desktop) */}
      {mining && setupMiningCollapsed ? (
        <div className="pixel-panel flex flex-col gap-3 p-3">
          <p className="truncate text-xs text-muted">{setupSummaryLine}</p>
          <div className="hidden lg:block">{startStopControls}</div>
        </div>
      ) : (
        <>
          {/* OS-5: mobile accordion default closed */}
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 border-2 border-border bg-surface-2 px-3 py-2.5 text-left text-sm lg:hidden"
            style={{ borderRadius: 0 }}
            onClick={() => setMobileSetupOpen((v) => !v)}
            aria-expanded={mobileSetupOpen}
          >
            <span className="min-w-0">
              <span className="font-medium text-zinc-200">
                {mobileSetupOpen ? "▾" : "▸"} {t("settingsToggle")}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {setupSummaryLine || t("setup")}
              </span>
            </span>
          </button>

          <div
            className={`pixel-panel min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4 ${
              mobileSetupOpen ? "block" : "hidden"
            } lg:block`}
          >
            {setupFields}
            <div className="hidden lg:block">{startStopControls}</div>
          </div>
        </>
      )}
    </section>
  );

  const layerTitle =
    layer === "rank"
      ? t("rankTitle")
      : layer === "about"
        ? t("aboutTitle")
        : layer === "pools"
          ? t("poolDetails")
          : "";

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:h-dvh lg:max-h-dvh lg:overflow-hidden lg:pb-0">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col min-h-0 px-4 pt-4 sm:px-6 lg:overflow-hidden">
        {/* Top shell — brand · mode segmented (Q1) · status lamp · language */}
        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-border bg-surface shadow-[2px_2px_0_#000] sm:h-11 sm:w-11">
              <Image
                src="/onyx-mark-64.png"
                alt="Onyx Labs"
                width={28}
                height={28}
                className="opacity-95"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="pixel-title text-sm text-brand sm:text-base">
                  MINER
                </h1>
                <span className="text-xs text-muted">{t("brandSub")}</span>
              </div>
              <p className="hidden text-xs text-muted sm:block sm:text-sm">
                {t("tagline")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {modeSegmented}
            <div
              className="inline-flex items-center gap-2 border-2 border-border bg-surface-2 px-2.5 py-1.5 text-xs"
              style={{ borderRadius: 2 }}
              role="status"
              aria-live="polite"
            >
              <span
                className={`status-lamp status-lamp--${statusUi.lamp}`}
                aria-hidden
              />
              <span className="font-medium text-zinc-200">{statusUi.label}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </header>

        {/* dest-mine: setup + HUD — OS-1 desktop no page scroll */}
        <div
          id="mine"
          className="dest-section grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(360px,420px)_1fr] lg:items-stretch lg:overflow-hidden"
        >
          <div className="order-2 flex min-h-0 flex-col lg:order-1 lg:overflow-hidden">
            {setupPanel}
          </div>
          <div className="order-1 flex min-h-0 flex-col lg:order-2 lg:overflow-hidden">
            {hudPanel}
          </div>
        </div>

        {/* Mobile shortcuts (OS-3) — text links, not full tables */}
        <div className="mt-3 flex shrink-0 flex-wrap gap-3 text-sm lg:hidden">
          <button
            type="button"
            className="text-brand underline-offset-2 hover:underline"
            onClick={() => openLayer("rank")}
          >
            {t("shortcutRank")}
          </button>
          <button
            type="button"
            className="text-brand underline-offset-2 hover:underline"
            onClick={() => openLayer("about")}
          >
            {t("shortcutAbout")}
          </button>
        </div>

        <footer className="mt-3 hidden shrink-0 flex-wrap items-center justify-between gap-2 border-t-2 border-border pt-3 text-xs text-muted lg:flex">
          <span>{t("footer")}</span>
          <a
            href="https://onyxlab.dev"
            className="text-brand hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {t("homeLink")}
          </a>
        </footer>
      </div>

      {/* Sticky Start on mobile — OS-5; expanding settings must not cover Stop */}
      <div className="sticky-start-bar fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-canvas/95 p-3 backdrop-blur lg:hidden">
        {startStopControls}
      </div>

      {/* OS-2 / OS-3 layers: pools / rank / about */}
      {layer !== "none" && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={layerTitle}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLayer();
          }}
        >
          <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col border-2 border-border bg-canvas shadow-[4px_4px_0_#000] sm:max-h-[80dvh]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-border px-4 py-3">
              <h2 className="pixel-label text-brand">{layerTitle}</h2>
              <button
                type="button"
                className="pixel-btn border-2 border-border bg-surface-2 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
                onClick={closeLayer}
              >
                {t("closeLayer")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {layer === "pools" && poolPickerBody}
              {layer === "rank" && (
                <RankBoardPanel
                  board={rankBoard}
                  currentWallet={address}
                  demoMode={mode === "demo"}
                />
              )}
              {layer === "about" && (
                <section
                  id="about"
                  className="dest-section space-y-4"
                  aria-label={t("aboutTitle")}
                >
                  <details
                    className="border-2 border-warning/40 bg-warning/5 open:bg-warning/10"
                    open
                  >
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm text-warning marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="font-semibold">
                        {t("disclaimerTitle")}
                      </span>
                      <span className="mx-2 text-warning/60">·</span>
                      <span className="text-zinc-300">
                        {t("disclaimerSummary")}
                      </span>
                    </summary>
                    <div className="border-t border-warning/30 px-3 pb-3 pt-2">
                      <p className="text-sm leading-relaxed text-zinc-300">
                        {t("disclaimer")}
                      </p>
                      <p className="mt-2 text-xs text-muted">{t("privacy")}</p>
                      <p className="mt-1 text-xs text-muted">{t("proxyNote")}</p>
                    </div>
                  </details>
                  <details className="pixel-panel p-4" open>
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
                      {t("howItWorks")}
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                      {t("howBody")}
                    </p>
                  </details>
                  <p className="text-xs text-muted">{t("footer")}</p>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={
            "toast-bar fixed bottom-20 left-1/2 z-50 max-w-sm -translate-x-1/2 px-4 py-2.5 text-sm text-zinc-100 lg:bottom-8" +
            (toastTone === "rare" ? " toast-bar--rare" : "")
          }
          role="status"
        >
          {toast}
          <button
            type="button"
            className="ml-3 text-xs text-muted hover:text-zinc-200"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
