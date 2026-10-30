/* Online Solo Miner — minimal installable SW (offline shell only; never caches mining/API). */
const SHELL = "onyx-miner-shell-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API / workers / WS upgrades — mining must stay live.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("worker")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.pathname === "/" || url.pathname.endsWith(".webmanifest") || url.pathname.startsWith("/icon-"))) {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw new Error("offline");
      })
  );
});
