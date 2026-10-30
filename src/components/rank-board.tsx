"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/locale-provider";
import { formatHashrate } from "@/lib/bitcoin";
import {
  shortenWallet,
  sortedRank,
  walletRankKey,
  type RankBoard as RankBoardData,
  type RankSort,
} from "@/lib/rank";

export function RankBoardPanel({
  board,
  currentWallet,
  demoMode = false,
}: {
  board: RankBoardData;
  currentWallet: string;
  /** When true, show S-rank-demo-view hint (totals still from real-pool Accepted). */
  demoMode?: boolean;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<RankSort>("accepted");
  const rows = useMemo(() => sortedRank(board, sort, 15), [board, sort]);
  const highlight = walletRankKey(currentWallet);

  return (
    <section
      id="rank"
      className="dest-section flex flex-col gap-3"
      aria-label={t("rankTitle")}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="pixel-label text-brand">{t("rankTitle")}</div>
          <p className="mt-1 text-xs text-muted">{t("rankHint")}</p>
          {demoMode && (
            <p className="mt-1 text-xs text-warning">{t("rankDemoHint")}</p>
          )}
        </div>
        <div
          className="inline-flex border-2 border-border bg-surface-2 p-0.5 text-xs"
          role="group"
          aria-label={t("rankSort")}
        >
          {(
            [
              ["accepted", "rankSortAccepted"],
              ["hashrate", "rankSortHashrate"],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSort(id)}
              className={`px-2.5 py-1 font-medium transition ${
                sort === id
                  ? "bg-brand-soft text-zinc-950"
                  : "text-muted hover:text-zinc-200"
              }`}
              style={{ borderRadius: 0 }}
              aria-pressed={sort === id}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="pixel-panel overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">{t("rankEmpty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-border text-xs text-muted">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">{t("rankWallet")}</th>
                <th className="px-3 py-2 font-medium text-right">
                  {t("rankAccepted")}
                </th>
                <th className="hidden px-3 py-2 font-medium text-right sm:table-cell">
                  {t("rankPeakHashrate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isYou = highlight && row.wallet === highlight;
                return (
                  <tr
                    key={row.wallet}
                    className={`border-b border-border/60 last:border-0 ${
                      isYou ? "bg-brand/10" : ""
                    }`}
                  >
                    <td className="mono px-3 py-2 text-muted">{i + 1}</td>
                    <td className="mono px-3 py-2">
                      <span
                        className={isYou ? "font-semibold text-brand" : "text-zinc-200"}
                        title={row.wallet}
                      >
                        {shortenWallet(row.wallet)}
                      </span>
                      {isYou && (
                        <span className="ml-2 text-[10px] font-sans uppercase text-brand">
                          {t("rankYou")}
                        </span>
                      )}
                    </td>
                    <td className="mono px-3 py-2 text-right text-success">
                      {row.accepted}
                    </td>
                    <td className="mono hidden px-3 py-2 text-right text-zinc-300 sm:table-cell">
                      {row.peakHashrate > 0
                        ? formatHashrate(row.peakHashrate)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="border-t-2 border-border px-3 py-2 text-[11px] leading-relaxed text-muted">
          {t("rankDisclaimer")}
        </p>
      </div>
    </section>
  );
}
