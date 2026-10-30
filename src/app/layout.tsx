import type { Metadata, Viewport } from "next";
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
    "Browser BTC/BCH Stratum mining via Onyx proxy + local demo. Learning classroom by Onyx Labs — not a profit / privileged mining tool. / 瀏覽器真實礦池挖礦與本地演示（學習向）。",
  applicationName: "Online Solo Miner",
  metadataBase: new URL("https://miner.onyxlab.dev"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MINER",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/onyx-mark-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "Online Solo Miner · Onyx Labs",
    description:
      "8-bit mining classroom — real Stratum pool or local demo. Browser learning tool by Onyx Labs.",
    url: "https://miner.onyxlab.dev",
    siteName: "Onyx Labs",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b10" },
    { media: "(prefers-color-scheme: light)", color: "#f5a623" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
