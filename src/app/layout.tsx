import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
  display: "swap",
});

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Online Solo Miner · Browser Stratum — Onyx Labs",
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
    <html lang="zh-Hant" className={`${pressStart.variable} ${vt323.variable}`}>
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
