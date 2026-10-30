import type { MetadataRoute } from "next";

/** PWA web app manifest — PKG-2: installable shell around miner.onyxlab.dev */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Online Solo Miner · Onyx Labs",
    short_name: "MINER",
    description:
      "Browser Stratum mining classroom — real pool or local demo. By Onyx Labs.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0b10",
    theme_color: "#f5a623",
    lang: "zh-Hant",
    categories: ["education", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/onyx-mark-128.png",
        sizes: "128x128",
        type: "image/png",
      },
    ],
  };
}
