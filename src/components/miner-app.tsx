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

const ADDR_KEY = "onyx_miner_address";

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
  const [address, setAddress] = useState("");
  const [addrTouched, setAddrTouched] = useState(false);
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [stats, setStats] = useState<MineStats>({
    hashrate: 0,
    totalHashes: 0,
    bestHashHex: "f".repeat(64),
    bestNonce: 0,
    extranonce: 0,
    workerCount: 0,
    found: false,
  });
  const controllerRef = useRef<MineController | null>(null);
  const workerHint = useMemo(() => suggestedWorkers(), []);

  const addrCheck = useMemo(() => {
    if (!address.trim()) return null;
    return validateBtcAddress(address);
  }, [address]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ADDR_KEY);
      if (saved) setAddress(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (address.trim()) localStorage.setItem(ADDR_KEY, address.trim());
      else localStorage.removeItem(ADDR_KEY);
    } catch {
      /* ignore */
    }
  }, [address]);

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
      if (!controllerRef.current?.isRunning()) void loadNetwork();
    }, 60_000);
    return () => clearInterval(id);
  }, [loadNetwork]);

  useEffect(() => {
    const c = new MineController();
    controllerRef.current = c;
    const unsub = c.subscribe(setStats);
    return () => {
      unsub();
      c.stop();
      controllerRef.current = null;
    };
  }, []);

  const onStart = () => {
    if (!network || !controllerRef.current) return;
    if (address.trim() && addrCheck && !addrCheck.ok) return;
    controllerRef.current.setAddress(address);
    controllerRef.current.start(network, workerHint);
    setMining(true);
  };

  const onStop = () => {
    controllerRef.current?.stop();
    setMining(false);
  };

  const eta = useMemo(() => {
    if (!network || stats.hashrate <= 0) return null;
    const secs = estimateTimeToBlock(stats.hashrate, network.difficulty);
    return formatDuration(secs, locale);
  }, [network, stats.hashrate, locale]);

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
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <StatCard label={t("hashrate")} accent={mining}>
            <div className="mono text-3xl font-bold tracking-tight text-btc sm:text-4xl">
              {formatHashrate(stats.hashrate)}
            </div>
            <div className="mt-1 text-xs text-muted">
              {mining ? t("mining") : t("idle")}
              {" · "}
              {stats.workerCount || workerHint} {t("workers").toLowerCase()}
            </div>
          </StatCard>
          <StatCard label={t("hashesTried")}>
            <div className="mono text-2xl font-semibold sm:text-3xl">
              {formatNumber(stats.totalHashes)}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("extranonce")}: {stats.extranonce}
            </div>
          </StatCard>
          <StatCard label={t("timeToBlock")}>
            <div className="text-xl font-semibold text-zinc-100 sm:text-2xl">
              {eta ?? "—"}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("cores")}: {workerHint}
            </div>
          </StatCard>
        </div>

        <div className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
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

          <div className="mt-4 flex flex-wrap gap-3">
            {!mining ? (
              <button
                type="button"
                onClick={onStart}
                disabled={
                  !network ||
                  netLoading ||
                  (!!address.trim() && !!addrCheck && !addrCheck.ok)
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
            <button
              type="button"
              onClick={() => void loadNetwork()}
              disabled={mining || netLoading}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
            >
              {t("refreshNetwork")}
            </button>
          </div>
        </div>

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

        <div className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("bestHash")}
          </div>
          <p className="mono break-all text-sm leading-relaxed text-brand">
            {stats.bestHashHex}
          </p>
          <p className="mt-2 text-xs text-muted">
            nonce {stats.bestNonce >>> 0}
            {stats.found && stats.foundHashHex ? ` · ${t("metTarget")}` : ""}
          </p>
        </div>

        <details className="mb-10 rounded-xl border border-border bg-surface/80 p-4 open:pb-5">
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
