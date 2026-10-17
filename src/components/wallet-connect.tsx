"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/locale-provider";
import {
  connectBtcWallet,
  detectBtcWallets,
  walletInstallUrl,
  type BtcWalletId,
  type DetectedWallet,
} from "@/lib/btc-wallet";

type Props = {
  coin: string;
  mining: boolean;
  address: string;
  onAddress: (addr: string) => void;
  onManualEditHint?: () => void;
};

export function WalletConnectBar({
  coin,
  mining,
  address,
  onAddress,
}: Props) {
  const { t } = useI18n();
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<BtcWalletId | null>(null);
  const [filledFromWallet, setFilledFromWallet] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setWallets(detectBtcWallets());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const available = useMemo(
    () => wallets.filter((w) => w.available),
    [wallets]
  );

  const onConnect = async (id: BtcWalletId) => {
    setBusy(true);
    setError(null);
    setOpen(false);
    try {
      const res = await connectBtcWallet(id);
      onAddress(res.address);
      setConnectedId(id);
      setFilledFromWallet(res.address);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|cancel|denied|user/i.test(msg)) {
        setError(t("walletRejected"));
      } else {
        setError(`${t("walletError")}: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = () => {
    const shouldClear =
      filledFromWallet &&
      address.trim() === filledFromWallet.trim() &&
      window.confirm(t("disconnectConfirm"));
    if (shouldClear) {
      onAddress("");
      setFilledFromWallet(null);
    }
    setConnectedId(null);
    setError(null);
  };

  // BCH: show note only
  if (coin === "BCH") {
    return (
      <p className="mt-2 text-xs text-muted">{t("walletBchNote")}</p>
    );
  }

  if (coin !== "BTC") return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {connectedId ? (
          <>
            <span className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
              {t("connectedAs")}:{" "}
              {wallets.find((w) => w.id === connectedId)?.name ?? connectedId}
            </span>
            <button
              type="button"
              disabled={mining || busy}
              onClick={onDisconnect}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
            >
              {t("disconnectWallet")}
            </button>
          </>
        ) : (
          <div className="relative">
            <button
              type="button"
              disabled={mining || busy}
              onClick={() => {
                refresh();
                if (available.length === 1) {
                  void onConnect(available[0].id);
                } else {
                  setOpen((o) => !o);
                }
              }}
              className="rounded-lg border border-brand/50 bg-brand/15 px-3 py-2 text-sm font-medium text-brand hover:bg-brand/25 disabled:opacity-50"
            >
              {busy ? t("walletConnecting") : t("connectWallet")}
            </button>
            {open && (
              <div className="absolute left-0 z-20 mt-1 min-w-[220px] rounded-lg border border-border bg-surface-2 p-1 shadow-xl">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
                  {t("walletPick")}
                </div>
                {available.length === 0 ? (
                  <div className="space-y-1 px-2 py-2 text-xs text-muted">
                    <p>{t("walletNone")}</p>
                    {wallets.map((w) => (
                      <a
                        key={w.id}
                        href={walletInstallUrl(w.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-brand hover:underline"
                      >
                        {t("walletInstall")} {w.name}
                      </a>
                    ))}
                  </div>
                ) : (
                  available.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className="block w-full rounded-md px-2 py-2 text-left text-sm text-zinc-100 hover:bg-brand/20"
                      onClick={() => void onConnect(w.id)}
                    >
                      {w.name}
                    </button>
                  ))
                )}
                {available.length > 0 && (
                  <div className="border-t border-border px-2 py-1.5 text-[10px] text-muted">
                    {wallets
                      .filter((w) => !w.available)
                      .map((w) => (
                        <a
                          key={w.id}
                          href={walletInstallUrl(w.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="mr-2 text-brand hover:underline"
                        >
                          {t("walletInstall")} {w.name}
                        </a>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted">{t("walletHint")}</p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
