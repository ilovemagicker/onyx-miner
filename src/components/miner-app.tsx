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
  type NetworkSnapshot,
} from "@/lib/bitcoin";
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

const ADDR_KEY = "onyx_miner_address";
const MODE_KEY = "onyx_miner_mode";
const COIN_KEY = "onyx_miner_coin";
const POOL_KEY = "onyx_miner_pool";

type Mode = "demo" | "pool";

function StatCard({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-4 ${
        accent ? "mining-glow border-btc/40" : ""
      }`}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="text-zinc-100">{children}</div>
    </div>
  );
}

export function MinerApp() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>("pool");
  const [coin, setCoin] = useState<CoinId>("BTC");
  const [poolId, setPoolId] = useState<string>("btc-public-solo");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("x");
  const [addrTouched, setAddrTouched] = useState(false);
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [mining, setMining] = useState(false);
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
  const selectedPool: PoolInfo | undefined = pools.find((p) => p.id === poolId) ?? pools[0];

  const addrCheck = useMemo(() => {
    if (!address.trim()) return null;
    if (coin === "BCH" && selectedPool?.id === "bch-viabtc") {
      // ViaBTC login — loose
      return address.trim().length >= 3
        ? { ok: true as const }
        : { ok: false as const };
    }
    return validateBtcAddress(address);
  }, [address, coin, selectedPool?.id]);

  useEffect(() => {
    try {
      const a = localStorage.getItem(ADDR_KEY);
      if (a) setAddress(a);
      const m = localStorage.getItem(MODE_KEY);
      if (m === "demo" || m === "pool") setMode(m);
      const c = localStorage.getItem(COIN_KEY) as CoinId | null;
      if (c && COINS.some((x) => x.id === c)) setCoin(c);
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
    };
  }, []);

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
    setMining(true);
    await poolRef.current.start(selectedPool, address, password || "x");
    // If connect failed, controller sets status error and running=false
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
      : poolStats.workerCount || workerHint;

  const eta = useMemo(() => {
    if (!network || liveHashrate <= 0 || mode !== "demo") return null;
    const secs = estimateTimeToBlock(liveHashrate, network.difficulty);
    return formatDuration(secs, locale);
  }, [network, liveHashrate, locale, mode]);

  const highDiff =
    mode === "pool" && poolStats.difficulty >= 100 && mining;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface">
              <Image
                src="/onyx-mark-64.png"
                alt="Onyx Labs"
                width={28}
                height={28}
                className="opacity-95"
              />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
                  {t("appName")}
                </h1>
                <span className="text-sm text-muted">{t("brandSub")}</span>
              </div>
              <p className="text-sm text-muted">{t("tagline")}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </header>

        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <div className="mb-1 text-sm font-semibold text-warning">
            {t("disclaimerTitle")}
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {t("disclaimer")}
          </p>
          <p className="mt-2 text-xs text-muted">{t("privacy")}</p>
          <p className="mt-1 text-xs text-muted">{t("proxyNote")}</p>
        </div>

        {/* Mode toggle */}
        <div className="mb-4 inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm">
          {(["pool", "demo"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={mining}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 font-medium transition disabled:opacity-50 ${
                mode === m
                  ? "bg-brand-soft text-white"
                  : "text-muted hover:text-zinc-200"
              }`}
            >
              {m === "pool" ? t("modePool") : t("modeDemo")}
            </button>
          ))}
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <StatCard label={t("hashrate")} accent={mining}>
            <div className="mono text-3xl font-bold tracking-tight text-btc sm:text-4xl">
              {formatHashrate(liveHashrate)}
            </div>
            <div className="mt-1 text-xs text-muted">
              {mining ? t("mining") : t("idle")}
              {" · "}
              {liveWorkers} {t("workers").toLowerCase()}
            </div>
          </StatCard>
          <StatCard label={t("hashesTried")}>
            <div className="mono text-2xl font-semibold sm:text-3xl">
              {formatNumber(liveHashes)}
            </div>
            {mode === "demo" ? (
              <div className="mt-1 text-xs text-muted">
                {t("extranonce")}: {demoStats.extranonce}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted">
                {t("shareDiff")}: {poolStats.difficulty}
              </div>
            )}
          </StatCard>
          {mode === "demo" ? (
            <StatCard label={t("timeToBlock")}>
              <div className="text-xl font-semibold sm:text-2xl">
                {eta ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("cores")}: {workerHint}
              </div>
            </StatCard>
          ) : (
            <StatCard label={t("sharesAccepted")}>
              <div className="mono text-2xl font-semibold text-success sm:text-3xl">
                {poolStats.accepted}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("sharesRejected")}: {poolStats.rejected} ·{" "}
                {t("sharesSubmitted")}: {poolStats.submitted}
              </div>
            </StatCard>
          )}
        </div>

        {highDiff && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            {t("highDiffWarn")}
          </div>
        )}

        <div className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
          {mode === "pool" && (
            <>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                {t("coin")}
              </label>
              <div className="mb-4 flex flex-wrap gap-2">
                {COINS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={mining}
                    onClick={() => setCoin(c.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                      coin === c.id
                        ? "border-brand bg-brand/20 text-zinc-100"
                        : "border-border text-muted hover:border-zinc-500"
                    }`}
                  >
                    {c.id}
                    <span className="ml-1 text-[10px] uppercase opacity-70">
                      {c.status === "supported"
                        ? t("statusSupported")
                        : c.status === "coming"
                          ? t("statusComing")
                          : t("statusUnsupported")}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mb-4 text-xs text-muted">
                {locale === "en" ? coinInfo.note_en : coinInfo.note_zh} ·{" "}
                {coinInfo.algo}
              </p>

              {coinInfo.status === "supported" ? (
                <>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    {t("pool")}
                  </label>
                  <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    {pools.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={mining}
                        onClick={() => setPoolId(p.id)}
                        className={`rounded-lg border p-3 text-left text-sm transition disabled:opacity-50 ${
                          selectedPool?.id === p.id
                            ? "border-brand bg-brand/10"
                            : "border-border hover:border-zinc-500"
                        }`}
                      >
                        <div className="font-medium text-zinc-100">
                          {p.name}{" "}
                          <span className="text-xs text-btc">
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
                    ))}
                  </div>
                  {selectedPool && (
                    <p className="mb-3 text-xs text-muted">
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
                </>
              ) : (
                <p className="mb-4 text-sm text-warning">{t("coinBlocked")}</p>
              )}
            </>
          )}

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
            className="mono w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none disabled:opacity-60"
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

          {mode === "pool" && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                {t("passwordLabel")}
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={mining}
                className="mono w-full max-w-xs rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-100 focus:border-brand focus:outline-none disabled:opacity-60"
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {!mining ? (
              <button
                type="button"
                onClick={() => void onStart()}
                disabled={
                  mode === "demo"
                    ? !network ||
                      netLoading ||
                      (!!address.trim() && !!addrCheck && !addrCheck.ok)
                    : coinInfo.status !== "supported" ||
                      !selectedPool ||
                      !address.trim() ||
                      (!!addrCheck && !addrCheck.ok)
                }
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                {t("start")}
              </button>
            ) : (
              <button
                type="button"
                onClick={onStop}
                className="rounded-lg border border-danger/50 bg-danger/10 px-5 py-2.5 text-sm font-semibold text-danger hover:bg-danger/20"
              >
                {t("stop")}
              </button>
            )}
            {mode === "demo" && (
              <button
                type="button"
                onClick={() => void loadNetwork()}
                disabled={mining || netLoading}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                {t("refreshNetwork")}
              </button>
            )}
          </div>

          {mode === "pool" && (
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">{t("poolStatus")}</div>
                <div className="mono text-zinc-200">{poolStats.status}</div>
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
            </div>
          )}
        </div>

        {mode === "demo" && (
          <div className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
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

        <div className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("bestHash")}
          </div>
          <p className="mono break-all text-sm leading-relaxed text-brand">
            {liveBest}
          </p>
          {mode === "demo" && demoStats.found && (
            <p className="mt-2 text-xs text-success">{t("metTarget")}</p>
          )}
        </div>

        <details className="mb-10 rounded-xl border border-border bg-surface/80 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
            {t("howItWorks")}
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {t("howBody")}
          </p>
        </details>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted">
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
    </div>
  );
}
