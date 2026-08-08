const loadPromises = new Map();
const assetStatus = new Map();

const ASSETS = Object.freeze({
  scanner: Object.freeze({
    key: "scanner",
    src: "./vendor/quagga.min.js",
    label: "Scanner-Modul",
    isReady: () => Boolean(globalThis.Quagga?.init && globalThis.Quagga?.decodeSingle)
  }),
  pdf: Object.freeze({
    key: "pdf",
    src: "./vendor/jspdf.umd.min.js",
    label: "PDF-Modul",
    isReady: () => typeof globalThis.jspdf?.jsPDF === "function"
  })
});

export function ensureScannerLibrary() {
  return ensureAsset(ASSETS.scanner);
}

export function ensurePdfLibrary() {
  return ensureAsset(ASSETS.pdf);
}

export function getOptionalAssetStatus() {
  return Object.fromEntries(
    Object.values(ASSETS).map((asset) => [asset.key, {
      label: asset.label,
      loaded: Boolean(asset.isReady()),
      status: assetStatus.get(asset.key)?.status || (asset.isReady() ? "loaded" : "idle"),
      loadedAt: assetStatus.get(asset.key)?.loadedAt || null,
      error: assetStatus.get(asset.key)?.error || ""
    }])
  );
}

async function ensureAsset(asset) {
  if (asset.isReady()) {
    assetStatus.set(asset.key, {
      status: "loaded",
      loadedAt: assetStatus.get(asset.key)?.loadedAt || new Date().toISOString(),
      error: ""
    });
    return;
  }

  if (loadPromises.has(asset.key)) {
    return loadPromises.get(asset.key);
  }

  const promise = loadScript(asset)
    .finally(() => loadPromises.delete(asset.key));

  loadPromises.set(asset.key, promise);
  return promise;
}

function loadScript(asset) {
  assetStatus.set(asset.key, { status: "loading", loadedAt: null, error: "" });

  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.dataset.entenarchivAsset === asset.key);
    const script = existing || document.createElement("script");
    let settled = false;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);

      if (error) {
        const message = error instanceof Error ? error.message : String(error || "Unbekannter Ladefehler");
        assetStatus.set(asset.key, { status: "failed", loadedAt: null, error: message });
        if (script.dataset.entenarchivAsset === asset.key) script.remove();
        reject(new Error(`${asset.label} konnte nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.`));
        return;
      }

      if (!asset.isReady()) {
        const message = `${asset.label} wurde geladen, ist aber nicht einsatzbereit.`;
        assetStatus.set(asset.key, { status: "failed", loadedAt: null, error: message });
        if (script.dataset.entenarchivAsset === asset.key) script.remove();
        reject(new Error(message));
        return;
      }

      assetStatus.set(asset.key, {
        status: "loaded",
        loadedAt: new Date().toISOString(),
        error: ""
      });
      resolve();
    };

    const handleLoad = () => finish();
    const handleError = () => finish(new Error(`Netzwerkfehler beim Laden von ${asset.src}`));
    const timeoutId = window.setTimeout(
      () => finish(new Error(`Zeitüberschreitung beim Laden von ${asset.src}`)),
      20000
    );

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.src = asset.src;
      script.async = true;
      script.dataset.entenarchivAsset = asset.key;
      document.head.append(script);
    } else if (asset.isReady()) {
      finish();
    }
  });
}
