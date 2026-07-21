const CACHE_NAME = "comicarchiv-shell-v3-3-1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./storage.js",
  "./missing.js",
  "./export.js",
  "./scanner.js",
  "./duckipedia.js",
  "./media.js",
  "./app.js",
  "./vendor/quagga.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const results = await Promise.allSettled(
        APP_SHELL.map(async (url) => {
          const request = new Request(url, { cache: "reload" });
          const response = await fetch(request);

          if (!response.ok) {
            throw new Error(`${url}: HTTP ${response.status}`);
          }

          await cache.put(request, response);
        })
      );

      const failedAssets = results
        .map((result, index) => ({ result, url: APP_SHELL[index] }))
        .filter(({ result }) => result.status === "rejected");

      if (failedAssets.length) {
        console.warn(
          "Einige Offline-Dateien konnten nicht vorgeladen werden:",
          failedAssets.map(({ url, result }) => `${url}: ${result.reason}`)
        );
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
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(request));
});

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

    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === "navigate") {
      const fallbackUrl = new URL("./index.html", self.registration.scope).href;
      const fallbackResponse = await caches.match(fallbackUrl);

      if (fallbackResponse) {
        return fallbackResponse;
      }
    }

    throw error;
  }
}
