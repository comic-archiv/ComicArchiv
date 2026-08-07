const IS_TEST_MODE = resolveTestMode();
const DIAGNOSTIC_STORAGE_KEY = IS_TEST_MODE ? "entenarchiv-diagnostics-v1-test" : "entenarchiv-diagnostics-v1";
const MAX_DIAGNOSTIC_ENTRIES = 30;
const DATABASE_NAME = IS_TEST_MODE ? "comicarchiv-db-test" : "comicarchiv-db";
const EXPECTED_STORES = Object.freeze(["comics", "settings", "coverMedia", "metadataCache"]);

export function recordDiagnosticError(error, context = "Unbekannter Bereich", level = "error") {
  const entry = createDiagnosticEntry(error, context, level);
  const entries = getDiagnosticLog();
  entries.unshift(entry);
  writeDiagnosticLog(entries.slice(0, MAX_DIAGNOSTIC_ENTRIES));
  return entry;
}

export function recordDiagnosticMessage(message, context = "App", level = "info") {
  return recordDiagnosticError(new Error(String(message || "Unbekannte Meldung")), context, level);
}

export function getDiagnosticLog() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(DIAGNOSTIC_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidDiagnosticEntry).slice(0, MAX_DIAGNOSTIC_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function clearDiagnosticLog() {
  try {
    globalThis.localStorage?.removeItem(DIAGNOSTIC_STORAGE_KEY);
  } catch {
    // Diagnose darf niemals selbst den App-Start blockieren.
  }
}

export async function collectDiagnosticReport({ appVersion = "", dataFormatVersion = null, optionalAssets = {} } = {}) {
  const [database, storage, serviceWorker] = await Promise.all([
    collectDatabaseSummary(),
    collectStorageSummary(),
    collectServiceWorkerSummary()
  ]);

  const checks = buildHealthChecks({ database, storage, serviceWorker });
  return {
    reportType: "entenarchiv-diagnostics",
    generatedAt: new Date().toISOString(),
    appVersion,
    dataFormatVersion,
    environment: collectEnvironmentSummary(),
    database,
    storage,
    serviceWorker,
    optionalAssets,
    checks,
    recentErrors: getDiagnosticLog()
  };
}

export function downloadDiagnosticReport(report, filename = "Entenarchiv-Diagnose.json") {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

export function formatDiagnosticBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unbekannt";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function createDiagnosticEntry(error, context, level) {
  const normalized = normalizeError(error);
  return {
    timestamp: new Date().toISOString(),
    level: ["info", "warning", "error", "fatal"].includes(level) ? level : "error",
    context: String(context || "Unbekannter Bereich").slice(0, 160),
    name: normalized.name.slice(0, 100),
    message: normalized.message.slice(0, 1000),
    stack: normalized.stack.slice(0, 5000),
    path: typeof location === "object" ? `${location.pathname}${location.search}`.slice(0, 500) : ""
  };
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack || ""
    };
  }

  if (error && typeof error === "object") {
    return {
      name: String(error.name || "Error"),
      message: String(error.message || JSON.stringify(error)),
      stack: String(error.stack || "")
    };
  }

  return { name: "Error", message: String(error || "Unbekannter Fehler"), stack: "" };
}

function isValidDiagnosticEntry(entry) {
  return Boolean(entry && typeof entry === "object" && typeof entry.message === "string");
}

function writeDiagnosticLog(entries) {
  try {
    globalThis.localStorage?.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ein voller oder blockierter LocalStorage darf die App nicht beeinträchtigen.
  }
}

function collectEnvironmentSummary() {
  const standalone = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
  return {
    origin: typeof location === "object" ? location.origin : "",
    path: typeof location === "object" ? `${location.pathname}${location.search}` : "",
    online: typeof navigator === "object" ? navigator.onLine : null,
    secureContext: Boolean(globalThis.isSecureContext),
    standalone,
    testMode: IS_TEST_MODE,
    databaseName: DATABASE_NAME,
    language: typeof navigator === "object" ? navigator.language : "",
    userAgent: typeof navigator === "object" ? navigator.userAgent : "",
    viewport: typeof window === "object" ? {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    } : null
  };
}

async function collectDatabaseSummary() {
  if (!("indexedDB" in globalThis)) {
    return { available: false, ok: false, error: "IndexedDB wird nicht unterstützt.", version: null, stores: {} };
  }

  let database;
  try {
    database = await openDatabase();
    const stores = {};
    for (const storeName of EXPECTED_STORES) {
      if (!database.objectStoreNames.contains(storeName)) {
        stores[storeName] = { available: false, count: null };
        continue;
      }
      stores[storeName] = {
        available: true,
        count: await countStore(database, storeName)
      };
    }

    const settingsRecord = database.objectStoreNames.contains("settings")
      ? await readSettingsRecord(database)
      : null;

    return {
      available: true,
      ok: EXPECTED_STORES.every((storeName) => stores[storeName]?.available),
      error: "",
      version: database.version,
      stores,
      settingsHealth: inspectSettingsHealth(settingsRecord?.value)
    };
  } catch (error) {
    return {
      available: true,
      ok: false,
      error: normalizeError(error).message,
      version: null,
      stores: {}
    };
  } finally {
    database?.close();
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = indexedDB.open(DATABASE_NAME);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion !== 0) return;
      request.transaction?.abort();
      fail(new Error("Es wurde noch keine lokale Entenarchiv-Datenbank angelegt."));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => fail(request.error || new Error("Datenbank konnte nicht geöffnet werden."));
    request.onblocked = () => fail(new Error("Datenbankzugriff ist durch ein anderes Fenster blockiert."));
  });
}

function countStore(database, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).count();
    request.onsuccess = () => resolve(Number(request.result || 0));
    request.onerror = () => reject(request.error || new Error(`${storeName} konnte nicht gezählt werden.`));
  });
}

function readSettingsRecord(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("settings", "readonly");
    const request = transaction.objectStore("settings").get("app");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Einstellungen konnten nicht geprüft werden."));
  });
}

function inspectSettingsHealth(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const events = Array.isArray(source.calendarEvents) ? source.calendarEvents : [];
  const invalidCalendarEvents = events.filter((event) => !isValidIsoDate(event?.startDate)).length;
  const year = Number(source.calendarSelectedYear);
  const month = Number(source.calendarSelectedMonth);

  return {
    calendarEventCount: events.length,
    invalidCalendarEvents,
    calendarYearValid: Number.isSafeInteger(year) && year >= 1900 && year <= 2100,
    calendarMonthValid: Number.isSafeInteger(month) && month >= 0 && month <= 11,
    customSeriesCount: Array.isArray(source.customSeriesConfigs)
      ? source.customSeriesConfigs.length
      : Array.isArray(source.customSeries) ? source.customSeries.length : 0
  };
}

async function collectStorageSummary() {
  const storageManager = globalThis.navigator?.storage;
  if (!storageManager) {
    return { available: false, usage: null, quota: null, usageRatio: null, persisted: null, error: "" };
  }

  try {
    const [estimate, persisted] = await Promise.all([
      typeof storageManager.estimate === "function" ? storageManager.estimate() : Promise.resolve({}),
      typeof storageManager.persisted === "function" ? storageManager.persisted() : Promise.resolve(null)
    ]);
    const usage = Number(estimate.usage);
    const quota = Number(estimate.quota);
    return {
      available: true,
      usage: Number.isFinite(usage) ? usage : null,
      quota: Number.isFinite(quota) ? quota : null,
      usageRatio: Number.isFinite(usage) && Number.isFinite(quota) && quota > 0 ? usage / quota : null,
      persisted: typeof persisted === "boolean" ? persisted : null,
      error: ""
    };
  } catch (error) {
    return {
      available: true,
      usage: null,
      quota: null,
      usageRatio: null,
      persisted: null,
      error: normalizeError(error).message
    };
  }
}

async function collectServiceWorkerSummary() {
  if (!("serviceWorker" in navigator)) {
    return { available: false, controlled: false, registration: null, workerStatus: null, error: "" };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("./");
    const workerStatus = navigator.serviceWorker.controller
      ? await requestServiceWorkerStatus(navigator.serviceWorker.controller)
      : null;
    return {
      available: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      registration: registration ? {
        scope: registration.scope,
        active: registration.active?.state || null,
        waiting: registration.waiting?.state || null,
        installing: registration.installing?.state || null
      } : null,
      workerStatus,
      error: ""
    };
  } catch (error) {
    return {
      available: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      registration: null,
      workerStatus: null,
      error: normalizeError(error).message
    };
  }
}

function requestServiceWorkerStatus(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeoutId = window.setTimeout(() => resolve(null), 1800);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeoutId);
      resolve(event.data || null);
    };
    worker.postMessage({ type: "GET_STATUS" }, [channel.port2]);
  });
}

function buildHealthChecks({ database, storage, serviceWorker }) {
  const checks = [];
  checks.push(createCheck(
    "secure-context",
    "Sichere HTTPS-Umgebung",
    Boolean(globalThis.isSecureContext),
    globalThis.isSecureContext ? "HTTPS ist aktiv." : "Die App läuft nicht in einem sicheren Kontext."
  ));
  checks.push(createCheck(
    "indexeddb",
    "Lokale Datenbank",
    database.ok,
    database.ok ? "Alle erwarteten Speicherbereiche sind verfügbar." : database.error || "Ein Speicherbereich fehlt."
  ));
  checks.push(createCheck(
    "calendar",
    "Kalenderdaten",
    (database.settingsHealth?.invalidCalendarEvents || 0) === 0,
    (database.settingsHealth?.invalidCalendarEvents || 0) === 0
      ? "Keine ungültigen Kalendertermine erkannt."
      : `${database.settingsHealth.invalidCalendarEvents} ungültige Kalendertermine erkannt.`
  ));
  checks.push(createCheck(
    "service-worker",
    "Offline-Steuerung",
    !serviceWorker.available || serviceWorker.controlled,
    !serviceWorker.available
      ? "Service Worker wird von diesem Browser nicht unterstützt."
      : serviceWorker.controlled ? "Die Seite wird vom Service Worker gesteuert." : "Noch keine aktive Offline-Steuerung."
  ));

  const storageHealthy = storage.usageRatio === null || storage.usageRatio < 0.85;
  checks.push(createCheck(
    "storage",
    "Freier Speicher",
    storageHealthy,
    storage.usageRatio === null
      ? "Der Browser meldet kein verlässliches Speicherkontingent."
      : storageHealthy ? "Das gemeldete Kontingent ist ausreichend." : "Mehr als 85 % des gemeldeten Kontingents sind belegt."
  ));
  return checks;
}

function createCheck(id, label, ok, detail) {
  return { id, label, status: ok ? "ok" : "warning", detail };
}

function resolveTestMode() {
  try {
    return new URLSearchParams(globalThis.location?.search || "").get("testmode") === "1";
  } catch {
    return false;
  }
}

function isValidIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2100) return false;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
