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
import { MineController, suggestedWorkers } from "@/lib/mine-controller";
import type { MineStats } from "@/lib/mine-controller";
import {
  COINS,
  poolsForCoin,
  type CoinId,
  type PoolInfo,
} from "@/lib/pools";
import {
  PoolMineController,
  type PoolMineStats,
} from "@/lib/pool-mine-controller";
import { WalletConnectBar } from "@/components/wallet-connect";
import type { MessageKey } from "@/lib/i18n";

const ADDR_KEY = "onyx_miner_address";
const MODE_KEY = "onyx_miner_mode";
const COIN_KEY = "onyx_miner_coin";
const POOL_KEY = "onyx_miner_pool";

type Mode = "demo" | "pool";

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
  const [poolId, setPoolId] = useState<string>("btc-public-solo");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("x");
  const [mergeLtc, setMergeLtc] = useState("");
  const [addrTouched, setAddrTouched] = useState(false);
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
    jobs: 0,
    status: "idle",
    workerCount: 0,
  });

  const demoRef = useRef<MineController | null>(null);
  const poolRef = useRef<PoolMineController | null>(null);
  const workerHint = useMemo(() => suggestedWorkers(), []);

  const coinInfo = COINS.find((c) => c.id === coin)!;
  const pools = useMemo(() => poolsForCoin(coin), [coin]);
  const selectedPool: PoolInfo | undefined =
    pools.find((p) => p.id === poolId) ?? pools[0];

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
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
    } catch {
      /* ignore */
    }
  }, [address, mode, coin, selectedPool]);

  useEffect(() => {
    if (!pools.some((p) => p.id === poolId) && pools[0]) {
      setPoolId(pools[0].id);
    }
  }, [pools, poolId]);

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
      demoRef.current.start(network, workerHint);
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
    await poolRef.current.start(selectedPool, creds.user, creds.password);
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
      ? demoStats.workerCount || workerHint
      : // Pool mode: show real worker count (do not mask 0 with the hint)
        poolStats.workerCount;

  const eta = useMemo(() => {
    if (!network || liveHashrate <= 0 || mode !== "demo") return null;
    const secs = estimateTimeToBlock(liveHashrate, network.difficulty);
    return formatDuration(secs, locale);
  }, [network, liveHashrate, locale, mode]);

  const highDiff = mode === "pool" && poolStats.difficulty >= 1 && mining;
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
    <section className="flex flex-col gap-3" aria-label={t("hud")}>
      <div className="pixel-label text-brand">{t("hud")}</div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <StatCard label={t("hashrate")} accent={mining}>
          <div className="hud-num font-bold tracking-tight text-brand">
            {formatHashrate(liveHashrate)}
          </div>
          <div className="mt-1 text-xs text-muted">
            {statusUi.label}
            {" · "}
            {liveWorkers} {t("workers").toLowerCase()}
          </div>
        </StatCard>
        {mode === "demo" ? (
          <>
            <StatCard label={t("hashesTried")}>
              <div className="hud-num font-semibold">
                {formatNumber(liveHashes)}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("extranonce")}: {demoStats.extranonce}
              </div>
            </StatCard>
            <StatCard label={t("timeToBlock")}>
              <div className="text-xl font-semibold sm:text-2xl">
                {eta ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("cores")}: {workerHint}
              </div>
            </StatCard>
          </>
        ) : (
          <>
            <StatCard
              label={t("sharesAccepted")}
              flash={acceptedFlash ? "ok" : rejectedFlash ? "danger" : null}
            >
              <div className="hud-num font-semibold text-success">
                {poolStats.accepted}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("sharesRejected")}:{" "}
                <span className={rejectedFlash ? "text-danger" : ""}>
                  {poolStats.rejected}
                </span>{" "}
                · {t("sharesSubmitted")}: {poolStats.submitted}
              </div>
              <div className="mt-1 text-xs text-warning">
                {t("etaFirstShare")}:{" "}
                {etaFirstShareLabel(
                  liveHashrate,
                  poolStats.difficulty || 1,
                  locale
                )}
              </div>
            </StatCard>
            <StatCard label={t("shareDiff")}>
              <div className="hud-num font-semibold">
                {poolStats.difficulty}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("hashesTried")}: {formatNumber(liveHashes)}
              </div>
            </StatCard>
          </>
        )}
      </div>

      {mode === "pool" && (
        <div className="pixel-panel grid gap-2 p-3 text-sm sm:grid-cols-3">
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
            <div className="sm:col-span-3 text-xs text-danger">
              {poolStats.lastError}
            </div>
          )}
          {mining &&
            (poolStats.status === "waiting_job" ||
              (poolStats.status === "authorized" && poolStats.jobs === 0)) && (
              <div className="sm:col-span-3 text-xs text-amber-400">
                {t("waitingJobHint")}
              </div>
            )}
          {mining && (
              <div className="sm:col-span-3 text-xs text-muted">
                {t("poolSearchNote")}
              </div>
            )}
          {mining && poolStats.workerCount === 0 && poolStats.status === "mining" && (
              <div className="sm:col-span-3 text-xs text-danger">
                {t("workers")} = 0（瀏覽器雜湊執行緒未啟動 — 請硬重新整理）
              </div>
            )}
        </div>
      )}

      <div className="pixel-panel p-3 sm:p-4">
        <div className="pixel-label mb-2">{t("bestHash")}</div>
        <p className="mono break-all text-sm leading-relaxed text-brand">
          {liveBest}
        </p>
        {mode === "demo" && demoStats.found && (
          <p className="mt-2 text-xs text-success">{t("metTarget")}</p>
        )}
      </div>

      {highDiff && (
        <div className="border-2 border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("highDiffWarn")}
          <div className="mt-1 text-xs opacity-80">
            {t("buildStamp")}: 3328f12+ui1
            {stratumUserShown ? ` · ${t("stratumUser")}: ${stratumUserShown}` : ""}
          </div>
        </div>
      )}
      {mode === "pool" && scryptCoin && (
        <div className="border-2 border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("scryptSlowWarn")}
        </div>
      )}

      {mode === "demo" && (
        <div className="pixel-panel p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("network")}
            </h2>
            {netLoading && (
              <span className="text-xs text-muted">{t("loadingNetwork")}</span>
            )}
          </div>
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
    </section>
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

  /* —— SETUP panel —— */
  const setupPanel = (
    <section className="flex flex-col gap-3" aria-label={t("setup")}>
      <div className="pixel-label text-brand">{t("setup")}</div>
      <div className="pixel-panel space-y-4 p-3 sm:p-4">
        {mode === "pool" && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                {t("coin")}
              </label>
              <div className="mb-2 flex flex-wrap gap-2">
                {COINS.map((c) => {
                  const locked = c.status !== "supported";
                  const selected = coin === c.id && !locked;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={mining}
                      onClick={() => onCoinClick(c.id)}
                      className={`border-2 px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
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
                        <span className="mr-1.5 inline-flex align-middle">
                          <LockIcon />
                        </span>
                      )}
                      {c.id}
                    </button>
                  );
                })}
              </div>
              {coinInfo.status === "supported" && (
                <p className="text-xs text-muted">
                  {locale === "en" ? coinInfo.note_en : coinInfo.note_zh} ·{" "}
                  {coinInfo.algo}
                </p>
              )}
            </div>

            {coinInfo.status === "supported" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    {t("pool")}
                  </label>
                  <div className="mb-2 grid gap-2 sm:grid-cols-1">
                    {pools.map((p) => {
                      const sel = selectedPool?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={mining}
                          onClick={() => setPoolId(p.id)}
                          className={`border-2 p-3 text-left text-sm transition disabled:opacity-50 ${
                            sel
                              ? "border-brand shadow-[inset_0_0_0_1px_#f5a623]"
                              : "border-border hover:border-zinc-500"
                          }`}
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
                      );
                    })}
                  </div>
                  {selectedPool && (
                    <p className="text-xs text-muted">
                      {t("poolFee")}:{" "}
                      {locale === "en"
                        ? selectedPool.userFormat_en
                        : selectedPool.userFormat_zh}
                      {selectedPool.homepage ? (
                        <>
                          {" · "}
                          <a
                            href={selectedPool.homepage}
                            className="text-brand hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            info
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
              </>
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
          <p className="mt-1.5 text-xs text-muted">{t("addressHint")}</p>
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
            <p className="mt-1.5 text-xs text-muted">{t("mergeLtcHint")}</p>
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

        {mode === "pool" && (
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

        {/* Desktop CTA inside setup */}
        <div className="hidden lg:block">{startStopControls}</div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-canvas pb-24 lg:pb-16">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6">
        {/* Top shell */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border-2 border-border bg-surface shadow-[2px_2px_0_#000]">
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
                  {t("appName").toUpperCase()}
                </h1>
                <span className="text-xs text-muted">{t("brandSub")}</span>
              </div>
              <p className="text-xs text-muted sm:text-sm">{t("tagline")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

        {/* Mode + collapsible disclaimer */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="inline-flex border-2 border-border bg-surface-2 p-0.5 text-sm">
            {(["pool", "demo"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={mining}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 font-medium transition disabled:opacity-50 ${
                  mode === m
                    ? "bg-brand-soft text-zinc-950"
                    : "text-muted hover:text-zinc-200"
                }`}
                style={{ borderRadius: 0 }}
              >
                {m === "pool" ? t("modePool") : t("modeDemo")}
              </button>
            ))}
          </div>
          {mode === "demo" && (
            <span className="self-center text-xs text-muted">
              {t("modeDemoHint")}
            </span>
          )}
        </div>

        <details className="mb-5 border-2 border-warning/40 bg-warning/5 open:bg-warning/10">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm text-warning marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="font-semibold">{t("disclaimerTitle")}</span>
            <span className="mx-2 text-warning/60">·</span>
            <span className="text-zinc-300">{t("disclaimerSummary")}</span>
            <span className="ml-2 text-xs text-muted underline">
              {t("disclaimerDetails")}
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

        {/* Dual column desktop / stacked mobile (HUD first on mobile) */}
        <div className="grid gap-5 lg:grid-cols-[minmax(380px,460px)_1fr] lg:items-start">
          <div className="order-2 lg:order-1">{setupPanel}</div>
          <div className="order-1 lg:order-2">{hudPanel}</div>
        </div>

        <details className="mb-8 mt-6 pixel-panel p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
            {t("howItWorks")}
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {t("howBody")}
          </p>
        </details>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-border pt-6 text-xs text-muted">
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

      {/* Sticky Start on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-canvas/95 p-3 backdrop-blur lg:hidden">
        {startStopControls}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="toast-bar fixed bottom-20 left-1/2 z-40 max-w-sm -translate-x-1/2 px-4 py-2.5 text-sm text-zinc-100 lg:bottom-8"
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
