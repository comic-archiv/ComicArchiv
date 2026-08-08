const APP_VERSION = "4.3.1";
const CACHE_PREFIX = "entenarchiv-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v4-3-0`;

const CORE_SHELL = Object.freeze([
  "./",
  "./index.html",
  "./style.css",
  "./recovery.js",
  "./release-radar.js",
  "./asset-loader.js",
  "./diagnostics.js",
  "./config.js",
  "./archive-model.js",
  "./storage.js",
  "./missing.js",
  "./export.js",
  "./scanner.js",
  "./shelf.js",
  "./shelf-ui.js",
  "./duckipedia.js",
  "./media.js",
  "./calendar.js",
  "./condition-assistant.js",
  "./scanner-pro.js",
  "./app.js",
  "./manifest.webmanifest",
  "./version.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-1024.png",
  "./icons/apple-touch-icon.png"
]);

const OPTIONAL_SHELL = Object.freeze([
  "./data/kalender-index.json",
  "./data/ltb-2026.ics"
]);

// Diese großen Module werden erst angefordert, wenn Scanner oder PDF-Export
// tatsächlich geöffnet werden. Vorhandene Cache-Kopien aus einer älteren
// Version werden ohne erneuten Download übernommen.
const ON_DEMAND_ASSETS = Object.freeze([
  "./vendor/quagga.min.js",
  "./vendor/jspdf.umd.min.js"
]);

let optionalPrecacheFailures = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Kritische Dateien müssen vollständig vorliegen. Scheitert eine davon,
      // bleibt der bisherige Service Worker aktiv und die letzte stabile Version erhalten.
      await Promise.all(CORE_SHELL.map((url) => fetchAndCache(cache, url)));

      await reusePreviouslyCachedAssets(cache, ON_DEMAND_ASSETS);

      const optionalResults = await Promise.allSettled(
        OPTIONAL_SHELL.map((url) => fetchAndCache(cache, url))
      );
      optionalPrecacheFailures = optionalResults
        .map((result, index) => ({ result, url: OPTIONAL_SHELL[index] }))
        .filter(({ result }) => result.status === "rejected")
        .map(({ url, result }) => ({ url, message: String(result.reason?.message || result.reason || "Ladefehler") }));

      if (optionalPrecacheFailures.length) {
        console.warn("Optionale Offline-Dateien konnten nicht vollständig vorgeladen werden:", optionalPrecacheFailures);
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "GET_STATUS") {
    event.ports?.[0]?.postMessage({
      appVersion: APP_VERSION,
      cacheName: CACHE_NAME,
      coreAssetCount: CORE_SHELL.length,
      optionalAssetCount: OPTIONAL_SHELL.length,
      onDemandAssetCount: ON_DEMAND_ASSETS.length,
      optionalPrecacheFailures,
      state: self.registration.active?.state || "active"
    });
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(networkFirst(request));
});

async function reusePreviouslyCachedAssets(targetCache, urls) {
  await Promise.all(urls.map(async (url) => {
    const cached = await caches.match(url);
    if (cached) await targetCache.put(url, cached.clone());
  }));
}

async function fetchAndCache(cache, url) {
  const request = new Request(url, { cache: "reload" });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  await cache.put(request, response);
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request, { cache: "no-store" });

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone()).catch((error) => {
        console.warn("Datei konnte nicht im Offline-Cache aktualisiert werden:", error);
      });
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    if (request.mode === "navigate") {
      const fallbackUrl = new URL("./index.html", self.registration.scope).href;
      const fallbackResponse = await caches.match(fallbackUrl);
      if (fallbackResponse) return fallbackResponse;
    }

    throw error;
  }
}
