/**
 * Read-only BTC address from common browser extension wallets.
 * No signing / no private keys — only requestAccounts / getAddresses.
 */

export type BtcWalletId = "unisat" | "okx" | "leather" | "xverse";

export type DetectedWallet = {
  id: BtcWalletId;
  name: string;
  available: boolean;
};

type UnisatProvider = {
  requestAccounts: () => Promise<string[]>;
  getAccounts?: () => Promise<string[]>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type OkxBitcoin = {
  requestAccounts?: () => Promise<string[]>;
  connect?: () => Promise<{ address?: string; addresses?: string[] } | string[]>;
  selectedAddress?: string;
  getAccounts?: () => Promise<string[]>;
};

type LeatherProvider = {
  request: (
    method: string,
    params?: unknown
  ) => Promise<{
    result?: {
      addresses?: Array<{
        address?: string;
        type?: string;
        symbol?: string;
      }>;
    };
  }>;
};

type XverseLike = {
  request?: (method: string, params?: unknown) => Promise<unknown>;
  connect?: (opts?: unknown) => Promise<unknown>;
};

declare global {
  interface Window {
    unisat?: UnisatProvider;
    okxwallet?: { bitcoin?: OkxBitcoin };
    LeatherProvider?: LeatherProvider;
    BitcoinProvider?: XverseLike;
    XverseProviders?: { BitcoinProvider?: XverseLike };
  }
}

export function detectBtcWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  return [
    { id: "unisat", name: "UniSat", available: Boolean(window.unisat?.requestAccounts) },
    {
      id: "okx",
      name: "OKX",
      available: Boolean(
        window.okxwallet?.bitcoin?.requestAccounts ||
          window.okxwallet?.bitcoin?.connect
      ),
    },
    {
      id: "leather",
      name: "Leather",
      available: Boolean(window.LeatherProvider?.request),
    },
    {
      id: "xverse",
      name: "Xverse",
      available: Boolean(
        window.XverseProviders?.BitcoinProvider || window.BitcoinProvider
      ),
    },
  ];
}

/** Prefer native segwit bc1q, then taproot bc1p, then legacy. */
export function preferPaymentAddress(addresses: string[]): string | null {
  const clean = addresses.map((a) => a.trim()).filter(Boolean);
  if (!clean.length) return null;
  const bc1q = clean.find((a) => a.toLowerCase().startsWith("bc1q"));
  if (bc1q) return bc1q;
  const bc1p = clean.find((a) => a.toLowerCase().startsWith("bc1p"));
  if (bc1p) return bc1p;
  const legacy = clean.find((a) => /^[13]/.test(a));
  if (legacy) return legacy;
  return clean[0];
}

function asAddressList(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "address" in item) {
          return String((item as { address: string }).address);
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.address === "string") return [o.address];
    if (Array.isArray(o.addresses)) return asAddressList(o.addresses);
    if (o.result) return asAddressList(o.result);
  }
  return [];
}

async function connectUnisat(): Promise<string[]> {
  const p = window.unisat;
  if (!p?.requestAccounts) throw new Error("unisat_missing");
  return asAddressList(await p.requestAccounts());
}

async function connectOkx(): Promise<string[]> {
  const b = window.okxwallet?.bitcoin;
  if (!b) throw new Error("okx_missing");
  if (b.requestAccounts) return asAddressList(await b.requestAccounts());
  if (b.connect) {
    const res = await b.connect();
    const list = asAddressList(res);
    if (list.length) return list;
  }
  if (b.selectedAddress) return [b.selectedAddress];
  if (b.getAccounts) return asAddressList(await b.getAccounts());
  throw new Error("okx_no_address");
}

async function connectLeather(): Promise<string[]> {
  const p = window.LeatherProvider;
  if (!p?.request) throw new Error("leather_missing");
  const res = await p.request("getAddresses");
  const addrs = res?.result?.addresses ?? [];
  const btc = addrs.filter(
    (a) => !a.symbol || a.symbol.toUpperCase() === "BTC"
  );
  // Prefer native segwit (p2wpkh) for mining payouts
  const ordered = [
    ...btc.filter((a) => a.type === "p2wpkh"),
    ...btc.filter((a) => a.type === "p2tr"),
    ...btc.filter((a) => a.type !== "p2wpkh" && a.type !== "p2tr"),
  ];
  return asAddressList(ordered.map((a) => a.address).filter(Boolean));
}

async function connectXverse(): Promise<string[]> {
  const provider =
    window.XverseProviders?.BitcoinProvider || window.BitcoinProvider;
  if (!provider) throw new Error("xverse_missing");

  // Prefer WBIP-style request methods when present
  if (typeof provider.request === "function") {
    try {
      const connectRes = await provider.request("wallet_connect", {
        addresses: ["payment"],
        message: "Onyx Miner needs your BTC payment address for pool payouts.",
      });
      const fromConnect = asAddressList(connectRes);
      if (fromConnect.length) return fromConnect;
    } catch {
      /* try legacy */
    }
    try {
      const accounts = await provider.request("getAccounts", {
        purposes: ["payment"],
        message: "Onyx Miner — read BTC payment address only (no signing).",
      });
      const list = asAddressList(accounts);
      if (list.length) return list;
    } catch {
      /* try getAddresses */
    }
    try {
      const addrs = await provider.request("getAddresses", {
        purposes: ["payment"],
        message: "Onyx Miner — read BTC payment address only (no signing).",
      });
      const list = asAddressList(addrs);
      if (list.length) return list;
    } catch {
      /* fall through */
    }
  }

  if (typeof provider.connect === "function") {
    const res = await provider.connect({
      purposes: ["payment"],
      message: "Onyx Miner — read BTC payment address only (no signing).",
    });
    const list = asAddressList(res);
    if (list.length) return list;
  }

  throw new Error("xverse_no_address");
}

export async function connectBtcWallet(
  id: BtcWalletId
): Promise<{ address: string; addresses: string[]; walletId: BtcWalletId }> {
  let addresses: string[];
  switch (id) {
    case "unisat":
      addresses = await connectUnisat();
      break;
    case "okx":
      addresses = await connectOkx();
      break;
    case "leather":
      addresses = await connectLeather();
      break;
    case "xverse":
      addresses = await connectXverse();
      break;
    default:
      throw new Error("unknown_wallet");
  }
  const address = preferPaymentAddress(addresses);
  if (!address) throw new Error("empty_address");
  return { address, addresses, walletId: id };
}

export function walletInstallUrl(id: BtcWalletId): string {
  switch (id) {
    case "unisat":
      return "https://unisat.io/download";
    case "okx":
      return "https://www.okx.com/web3";
    case "leather":
      return "https://leather.io/install-extension";
    case "xverse":
      return "https://www.xverse.app/download";
  }
}
