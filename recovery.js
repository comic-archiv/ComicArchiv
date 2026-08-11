(function initializeEntenarchivRecovery() {
  "use strict";

  const APP_VERSION = "4.6.9";
  const DATA_FORMAT_VERSION = 9;
  const ARCHIVE_MODEL_VERSION = 1;
  const IS_TEST_MODE = new URLSearchParams(window.location.search).get("testmode") === "1";
  const DATABASE_NAME = IS_TEST_MODE ? "comicarchiv-db-test" : "comicarchiv-db";
  const SETTINGS_KEY = "app";
  const DIAGNOSTIC_STORAGE_KEY = IS_TEST_MODE ? "entenarchiv-diagnostics-v1-test" : "entenarchiv-diagnostics-v1";
  const STARTUP_MARKER_KEY = IS_TEST_MODE ? "entenarchiv-startup-marker-v1-test" : "entenarchiv-startup-marker-v1";
  const MAX_DIAGNOSTIC_ENTRIES = 30;
  const STARTUP_TIMEOUT_MS = 30000;

  let isReady = false;
  let panelWasOpenedManually = false;
  let startupTimer = null;
  let pendingPresentation = null;

  markStartupAttempt();
  installGlobalErrorHandlers();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleDomReady, { once: true });
  } else {
    handleDomReady();
  }

  window.EntenarchivRecovery = Object.freeze({
    markReady,
    reportFatal,
    open: openRecoveryPanel,
    record: recordDiagnosticEntry,
    getLog: readDiagnosticLog
  });

  function handleDomReady() {
    bindRecoveryActions();
    startupTimer = window.setTimeout(() => {
      if (isReady) return;
      const error = new Error("Der App-Start wurde nicht innerhalb von 30 Sekunden abgeschlossen.");
      recordDiagnosticEntry(error, "Startüberwachung", "fatal");
      presentRecovery({
        title: "Entenarchiv braucht Hilfe beim Start",
        summary: "Der Start dauert ungewöhnlich lange oder wurde durch einen technischen Fehler unterbrochen.",
        error
      });
    }, STARTUP_TIMEOUT_MS);

    if (pendingPresentation) {
      presentRecovery(pendingPresentation);
      pendingPresentation = null;
    }
  }

  function markReady() {
    isReady = true;
    window.clearTimeout(startupTimer);
    clearStartupMarker();

    if (!panelWasOpenedManually) {
      hideRecoveryPanel();
    }
  }

  function reportFatal(error, context = "App-Start") {
    const normalized = normalizeError(error);
    recordDiagnosticEntry(normalized, context, "fatal");
    presentRecovery({
      title: "Entenarchiv konnte nicht vollständig gestartet werden",
      summary: "Deine Sammlung bleibt in der lokalen Datenbank erhalten. Im sicheren Modus kannst du zuerst ein Notfall-Backup erstellen und anschließend eine Reparatur versuchen.",
      error: normalized
    });
  }

  function openRecoveryPanel(options = {}) {
    panelWasOpenedManually = true;
    presentRecovery({
      title: options.title || "Diagnose & sicherer Modus",
      summary: options.summary || "Hier kannst du Entenarchiv prüfen, Notfall-Backups erstellen und beschädigte Kalenderdaten reparieren.",
      error: options.error || null,
      manual: true
    });
  }

  function presentRecovery(presentation) {
    const panel = document.querySelector("#recovery-panel");
    if (!panel) {
      pendingPresentation = presentation;
      return;
    }

    panelWasOpenedManually ||= Boolean(presentation.manual);
    const title = panel.querySelector("#recovery-title");
    const summary = panel.querySelector("#recovery-summary");
    const detail = panel.querySelector("#recovery-detail");
    const closeButton = panel.querySelector("#recovery-close");

    if (title) title.textContent = presentation.title || "Sicherer Modus";
    if (summary) summary.textContent = presentation.summary || "";
    if (detail) {
      const normalized = presentation.error ? normalizeError(presentation.error) : null;
      detail.textContent = normalized ? `${normalized.name}: ${normalized.message}` : "";
      detail.hidden = !normalized;
    }
    if (closeButton) closeButton.hidden = !panelWasOpenedManually && !isReady;

    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("recovery-mode");
    window.setTimeout(() => panel.querySelector("#recovery-data-backup")?.focus(), 0);
  }

  function hideRecoveryPanel() {
    const panel = document.querySelector("#recovery-panel");
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("recovery-mode");
    panelWasOpenedManually = false;
    setRecoveryStatus("");
  }

  function bindRecoveryActions() {
    const panel = document.querySelector("#recovery-panel");
    if (!panel || panel.dataset.bound === "true") return;
    panel.dataset.bound = "true";

    panel.querySelector("#recovery-reload")?.addEventListener("click", () => window.location.reload());
    panel.querySelector("#recovery-close")?.addEventListener("click", hideRecoveryPanel);
    panel.querySelector("#recovery-data-backup")?.addEventListener("click", () => createEmergencyBackup(false));
    panel.querySelector("#recovery-media-backup")?.addEventListener("click", () => createEmergencyBackup(true));
    panel.querySelector("#recovery-repair-calendar")?.addEventListener("click", repairCalendarData);
    panel.querySelector("#recovery-refresh-cache")?.addEventListener("click", refreshApplicationCache);
    panel.querySelector("#recovery-export-diagnostics")?.addEventListener("click", exportRecoveryDiagnostics);
  }

  function installGlobalErrorHandlers() {
    window.addEventListener("error", (event) => {
      const error = event.error || new Error(event.message || "Unbekannter JavaScript-Fehler");
      if (!isReady) {
        reportFatal(error, "App-Modul");
      } else {
        recordDiagnosticEntry(error, "Globaler JavaScript-Fehler", "error");
      }
    });

    window.addEventListener("unhandledrejection", (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Unbehandelte Promise-Ablehnung"));
      if (!isReady) {
        reportFatal(error, "App-Start");
      } else {
        recordDiagnosticEntry(error, "Unbehandelte Promise-Ablehnung", "error");
      }
    });
  }

  async function createEmergencyBackup(includeMedia) {
    const actionLabel = includeMedia ? "Medien-Notfall-Backup" : "Notfall-Backup";
    setRecoveryBusy(true);
    setRecoveryStatus(`${actionLabel} wird vorbereitet …`, "info");

    try {
      const snapshot = await readDatabaseSnapshot(includeMedia);
      const backup = await buildCompatibleBackup(snapshot, includeMedia);
      const filename = createDatedFilename(
        IS_TEST_MODE
          ? (includeMedia ? "Entenarchiv-TEST-Notfall-Medien-Backup" : "Entenarchiv-TEST-Notfall-Backup")
          : (includeMedia ? "Entenarchiv-Notfall-Medien-Backup" : "Entenarchiv-Notfall-Backup"),
        "json"
      );
      const result = await shareOrDownloadJson(backup, filename);
      setRecoveryStatus(
        result === "cancelled"
          ? "Teilen wurde abgebrochen. Es wurde keine Datei gespeichert."
          : `${actionLabel} wurde erstellt. Prüfe anschließend, ob die Datei in der Dateien-App vorhanden ist.`,
        result === "cancelled" ? "warning" : "success"
      );
    } catch (error) {
      recordDiagnosticEntry(error, actionLabel, "error");
      setRecoveryStatus(`${actionLabel} fehlgeschlagen: ${normalizeError(error).message}`, "error");
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function buildCompatibleBackup(snapshot, includeMedia) {
    const settings = snapshot.settings || {};
    const backup = {
      app: "ComicArchiv",
      appVersion: APP_VERSION,
      backupType: includeMedia ? "media" : "data",
      dataFormatVersion: DATA_FORMAT_VERSION,
      archiveModelVersion: ARCHIVE_MODEL_VERSION,
      mediaFormatVersion: includeMedia ? 1 : null,
      exportedAt: new Date().toISOString(),
      sourceOrigin: location.origin,
      emergencyBackup: true,
      testMode: IS_TEST_MODE,
      comics: snapshot.comics,
      settings,
      metadataCache: snapshot.metadataCache,
      seriesConfiguration: {
        defaultSeries: [],
        customSeries: Array.isArray(settings.customSeries) ? settings.customSeries : [],
        customSeriesConfigs: Array.isArray(settings.customSeriesConfigs) ? settings.customSeriesConfigs : [],
        knownHighestBandBySeries: settings.knownHighestBandBySeries || {},
        missingBandDetails: settings.missingBandDetails || {}
      },
      recoveryDiagnostics: {
        databaseVersion: snapshot.databaseVersion,
        archiveStatus: snapshot.archiveMeta?.status || "unknown",
        archiveModelVersion: Number(snapshot.archiveMeta?.archiveModelVersion) || null,
        issueCount: snapshot.issues?.length || 0,
        copyCount: snapshot.copies?.length || 0,
        createdInSafeMode: true,
        recentErrors: readDiagnosticLog()
      }
    };

    if (
      snapshot.archiveMeta?.status === "complete" &&
      Array.isArray(snapshot.series) &&
      Array.isArray(snapshot.issues) &&
      Array.isArray(snapshot.copies)
    ) {
      backup.archiveCore = {
        modelVersion: Number(snapshot.archiveMeta.archiveModelVersion) || ARCHIVE_MODEL_VERSION,
        series: snapshot.series,
        issues: snapshot.issues,
        copies: snapshot.copies,
        report: snapshot.archiveMeta.report || null
      };
    }

    if (includeMedia) {
      backup.covers = [];
      for (const record of snapshot.covers) {
        if (!record?.comicId || !(record.blob instanceof Blob)) continue;
        backup.covers.push({
          comicId: String(record.comicId),
          mimeType: String(record.mimeType || record.blob.type || "image/jpeg"),
          size: Number(record.size || record.blob.size || 0),
          width: Number(record.width || 0),
          height: Number(record.height || 0),
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
          dataUrl: await blobToDataUrl(record.blob)
        });
      }
    }

    return backup;
  }

  async function readDatabaseSnapshot(includeMedia) {
    const database = await openDatabase();
    try {
      const comics = database.objectStoreNames.contains("comics")
        ? await readAllFromStore(database, "comics")
        : [];
      const settingsRecord = database.objectStoreNames.contains("settings")
        ? await readOneFromStore(database, "settings", SETTINGS_KEY)
        : null;
      const metadataCache = database.objectStoreNames.contains("metadataCache")
        ? await readAllFromStore(database, "metadataCache")
        : [];
      const covers = includeMedia && database.objectStoreNames.contains("coverMedia")
        ? await readAllFromStore(database, "coverMedia")
        : [];
      const series = database.objectStoreNames.contains("seriesCatalog")
        ? await readAllFromStore(database, "seriesCatalog")
        : [];
      const issues = database.objectStoreNames.contains("issues")
        ? await readAllFromStore(database, "issues")
        : [];
      const copies = database.objectStoreNames.contains("copies")
        ? await readAllFromStore(database, "copies")
        : [];
      const archiveMeta = database.objectStoreNames.contains("archiveMeta")
        ? await readOneFromStore(database, "archiveMeta", "archive-core")
        : null;

      return {
        databaseVersion: database.version,
        comics,
        series,
        issues,
        copies,
        archiveMeta,
        issueCount: issues.length,
        copyCount: copies.length,
        settings: settingsRecord?.value || {},
        metadataCache,
        covers
      };
    } finally {
      database.close();
    }
  }

  async function repairCalendarData() {
    const confirmed = window.confirm(
      "Entenarchiv entfernt ungültige Kalendertermine und normalisiert ausschließlich beschädigte technische Einstellungen. Comics, Reihen, Cover und gültige Termine bleiben erhalten. Fortfahren?"
    );
    if (!confirmed) return;

    setRecoveryBusy(true);
    setRecoveryStatus("Kalender und technische Einstellungen werden geprüft …", "info");

    let database;
    try {
      database = await openDatabase();
      if (!database.objectStoreNames.contains("settings")) {
        throw new Error("Der Einstellungs-Speicher ist nicht vorhanden.");
      }

      const existingRecord = await readOneFromStore(database, "settings", SETTINGS_KEY);
      const settings = existingRecord?.value && typeof existingRecord.value === "object"
        ? { ...existingRecord.value }
        : {};
      const originalEvents = Array.isArray(settings.calendarEvents) ? settings.calendarEvents : [];
      const validEvents = originalEvents.filter(isRecoverableCalendarEvent).map(normalizeRecoverableCalendarEvent);
      const currentDate = new Date();
      const selectedYear = Number(settings.calendarSelectedYear);
      const selectedMonth = Number(settings.calendarSelectedMonth);

      settings.theme = settings.theme === "light" ? "light" : "dark";
      settings.changesSinceBackup = normalizeNonNegativeInteger(settings.changesSinceBackup);
      settings.mediaChangesSinceBackup = normalizeNonNegativeInteger(settings.mediaChangesSinceBackup);
      settings.lastBackupComicCount = normalizeNonNegativeInteger(settings.lastBackupComicCount);
      settings.showCovers = settings.showCovers !== false;
      settings.duckipediaAutoEnrich = settings.duckipediaAutoEnrich !== false;
      settings.customSeries = Array.isArray(settings.customSeries) ? settings.customSeries : [];
      settings.customSeriesConfigs = Array.isArray(settings.customSeriesConfigs) ? settings.customSeriesConfigs : [];
      settings.knownHighestBandBySeries = isPlainObject(settings.knownHighestBandBySeries) ? settings.knownHighestBandBySeries : {};
      settings.missingBandDetails = isPlainObject(settings.missingBandDetails) ? settings.missingBandDetails : {};
      settings.fleaMarketSession = isPlainObject(settings.fleaMarketSession)
        ? settings.fleaMarketSession
        : { items: {}, updatedAt: null };
      settings.calendarEvents = validEvents;
      settings.calendarSelectedYear = Number.isSafeInteger(selectedYear) && selectedYear >= 1900 && selectedYear <= 2100
        ? selectedYear
        : currentDate.getFullYear();
      settings.calendarSelectedMonth = Number.isSafeInteger(selectedMonth) && selectedMonth >= 0 && selectedMonth <= 11
        ? selectedMonth
        : currentDate.getMonth();
      settings.calendarReminderTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings.calendarReminderTime || ""))
        ? settings.calendarReminderTime
        : "09:00";
      settings.calendarImportedSources = normalizeImportedSources(settings.calendarImportedSources);

      await writeOneToStore(database, "settings", { key: SETTINGS_KEY, value: settings });
      const removed = originalEvents.length - validEvents.length;
      setRecoveryStatus(
        removed > 0
          ? `${removed} ungültige Kalendertermine wurden entfernt; technische Einstellungen wurden geprüft. Starte Entenarchiv jetzt neu.`
          : "Kalender und technische Einstellungen wurden geprüft und normalisiert. Starte Entenarchiv jetzt neu.",
        "success"
      );
    } catch (error) {
      recordDiagnosticEntry(error, "Einstellungsreparatur", "error");
      setRecoveryStatus(`Reparatur fehlgeschlagen: ${normalizeError(error).message}`, "error");
    } finally {
      database?.close();
      setRecoveryBusy(false);
    }
  }

  async function refreshApplicationCache() {
    if (!navigator.onLine) {
      setRecoveryStatus("Für das Erneuern der App-Dateien wird eine Internetverbindung benötigt.", "warning");
      return;
    }

    const confirmed = window.confirm(
      "Dabei werden nur Service Worker und Offline-App-Dateien erneuert. Deine lokale Sammlung, Cover und Einstellungen bleiben erhalten. Fortfahren?"
    );
    if (!confirmed) return;

    setRecoveryBusy(true);
    setRecoveryStatus("App-Dateien werden erneuert …", "info");
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations
          .filter((registration) => registration.scope.startsWith(location.origin))
          .map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names
          .filter((name) => name.startsWith("entenarchiv-shell-") || name.startsWith("comicarchiv-shell-"))
          .map((name) => caches.delete(name)));
      }
      const url = new URL(location.href);
      url.searchParams.set("apprefresh", String(Date.now()));
      setRecoveryStatus("App-Dateien wurden zurückgesetzt. Entenarchiv wird neu geladen …", "success");
      window.setTimeout(() => location.replace(url.href), 450);
    } catch (error) {
      recordDiagnosticEntry(error, "App-Cache erneuern", "error");
      setRecoveryStatus(`App-Dateien konnten nicht erneuert werden: ${normalizeError(error).message}`, "error");
      setRecoveryBusy(false);
    }
  }

  async function exportRecoveryDiagnostics() {
    setRecoveryBusy(true);
    setRecoveryStatus("Diagnosebericht wird erstellt …", "info");

    try {
      let databaseSummary = null;
      try {
        const snapshot = await readDatabaseSnapshot(false);
        databaseSummary = {
          version: snapshot.databaseVersion,
          issues: snapshot.issueCount || snapshot.comics.length,
          physicalCopies: snapshot.copyCount || snapshot.comics.reduce((total, comic) => total + (Array.isArray(comic?.copies) && comic.copies.length ? comic.copies.length : (comic?.isDuplicate ? 2 : 1)), 0),
          legacyMirrorEntries: snapshot.comics.length,
          metadataCache: snapshot.metadataCache.length,
          calendarEvents: Array.isArray(snapshot.settings.calendarEvents) ? snapshot.settings.calendarEvents.length : 0,
          customSeries: Array.isArray(snapshot.settings.customSeriesConfigs)
            ? snapshot.settings.customSeriesConfigs.length
            : Array.isArray(snapshot.settings.customSeries) ? snapshot.settings.customSeries.length : 0
        };
      } catch (error) {
        databaseSummary = { error: normalizeError(error).message };
      }

      const report = {
        reportType: "entenarchiv-recovery-diagnostics",
        generatedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        dataFormatVersion: DATA_FORMAT_VERSION,
        archiveModelVersion: ARCHIVE_MODEL_VERSION,
        testMode: IS_TEST_MODE,
        databaseName: DATABASE_NAME,
        environment: {
          origin: location.origin,
          path: `${location.pathname}${location.search}`,
          online: navigator.onLine,
          secureContext: window.isSecureContext,
          standalone: window.matchMedia?.("(display-mode: standalone)").matches || false,
          language: navigator.language,
          userAgent: navigator.userAgent,
          viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1 }
        },
        database: databaseSummary,
        recentErrors: readDiagnosticLog()
      };

      const result = await shareOrDownloadJson(report, createDatedFilename(IS_TEST_MODE ? "Entenarchiv-TEST-Diagnose" : "Entenarchiv-Diagnose", "json"));
      setRecoveryStatus(
        result === "cancelled" ? "Teilen wurde abgebrochen." : "Diagnosebericht wurde erstellt.",
        result === "cancelled" ? "warning" : "success"
      );
    } catch (error) {
      recordDiagnosticEntry(error, "Diagnoseexport", "error");
      setRecoveryStatus(`Diagnoseexport fehlgeschlagen: ${normalizeError(error).message}`, "error");
    } finally {
      setRecoveryBusy(false);
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Dieser Browser unterstützt IndexedDB nicht."));
        return;
      }
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
      request.onerror = () => fail(request.error || new Error("Die lokale Datenbank konnte nicht geöffnet werden."));
      request.onblocked = () => fail(new Error("Der Datenbankzugriff ist durch ein anderes Entenarchiv-Fenster blockiert."));
    });
  }

  function readAllFromStore(database, storeName) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error(`${storeName} konnte nicht gelesen werden.`));
    });
  }

  function readOneFromStore(database, storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(`${storeName} konnte nicht gelesen werden.`));
    });
  }

  function writeOneToStore(database, storeName, value) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error(`${storeName} konnte nicht gespeichert werden.`));
      transaction.onabort = () => reject(transaction.error || new Error(`${storeName} wurde nicht gespeichert.`));
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Ein Coverbild konnte nicht gelesen werden."));
      reader.readAsDataURL(blob);
    });
  }

  async function shareOrDownloadJson(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const file = typeof File === "function" ? new File([blob], filename, { type: blob.type }) : null;

    if (file && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Entenarchiv", text: filename });
        return "shared";
      } catch (error) {
        if (error?.name === "AbortError") return "cancelled";
      }
    }

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
    return "downloaded";
  }

  function setRecoveryBusy(isBusy) {
    document.querySelectorAll("#recovery-panel button").forEach((button) => {
      if (button.id === "recovery-close") return;
      button.disabled = Boolean(isBusy);
    });
  }

  function setRecoveryStatus(message, type = "") {
    const status = document.querySelector("#recovery-status");
    if (!status) return;
    status.textContent = message || "";
    status.dataset.type = type;
  }

  function normalizeError(error) {
    if (error instanceof Error) return error;
    if (error && typeof error === "object" && typeof error.message === "string") {
      const normalized = new Error(error.message);
      normalized.name = String(error.name || "Error");
      normalized.stack = String(error.stack || "");
      return normalized;
    }
    return new Error(String(error || "Unbekannter Fehler"));
  }

  function recordDiagnosticEntry(error, context = "Unbekannter Bereich", level = "error") {
    const normalized = normalizeError(error);
    const entry = {
      timestamp: new Date().toISOString(),
      level: ["info", "warning", "error", "fatal"].includes(level) ? level : "error",
      context: String(context || "Unbekannter Bereich").slice(0, 160),
      name: String(normalized.name || "Error").slice(0, 100),
      message: String(normalized.message || normalized).slice(0, 1000),
      stack: String(normalized.stack || "").slice(0, 5000),
      path: `${location.pathname}${location.search}`.slice(0, 500)
    };

    const entries = readDiagnosticLog();
    entries.unshift(entry);
    try {
      localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_DIAGNOSTIC_ENTRIES)));
    } catch {
      // Diagnose darf niemals selbst den Start blockieren.
    }
    return entry;
  }

  function readDiagnosticLog() {
    try {
      const value = JSON.parse(localStorage.getItem(DIAGNOSTIC_STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.slice(0, MAX_DIAGNOSTIC_ENTRIES) : [];
    } catch {
      return [];
    }
  }

  function markStartupAttempt() {
    try {
      localStorage.setItem(STARTUP_MARKER_KEY, JSON.stringify({ version: APP_VERSION, startedAt: new Date().toISOString() }));
    } catch {
      // LocalStorage kann in restriktiven Modi blockiert sein.
    }
  }

  function clearStartupMarker() {
    try {
      localStorage.removeItem(STARTUP_MARKER_KEY);
    } catch {
      // Kein kritischer Fehler.
    }
  }

  function createDatedFilename(prefix, extension) {
    const date = new Date();
    return `${prefix}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.${extension}`;
  }

  function normalizeNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 1_000_000_000) : 0;
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function isRecoverableCalendarEvent(event) {
    return Boolean(event && typeof event === "object" && String(event.title || "").trim() && isValidCalendarDate(event.startDate));
  }

  function normalizeRecoverableCalendarEvent(event) {
    const normalized = { ...event };
    normalized.title = String(event.title).trim().slice(0, 200);
    normalized.startDate = String(event.startDate);
    normalized.endDate = isValidCalendarDate(event.endDate) ? String(event.endDate) : normalized.startDate;
    if (normalized.endDate < normalized.startDate) normalized.endDate = normalized.startDate;
    return normalized;
  }

  function isValidCalendarDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isSafeInteger(year) || year < 1900 || year > 2100) return false;
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function normalizeImportedSources(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    Object.entries(value).forEach(([yearKey, entry]) => {
      const year = Number(yearKey);
      if (!Number.isSafeInteger(year) || year < 1900 || year > 2100 || !entry || typeof entry !== "object") return;
      result[String(year)] = entry;
    });
    return result;
  }
})();
