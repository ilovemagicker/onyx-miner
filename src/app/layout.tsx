import type { Metadata } from "next";
import { AppProviders } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miner · Browser Stratum Miner — Onyx Labs",
  description:
    "Browser BTC/BCH Stratum mining via Onyx proxy + local demo. By Onyx Labs. / 瀏覽器真實礦池挖礦與本地演示。",
  metadataBase: new URL("https://miner.onyxlab.dev"),
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/onyx-mark-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/onyx-mark-128.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
