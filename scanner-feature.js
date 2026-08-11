import {
  APP_CONFIG,
  DEFAULT_CONDITION_CODE,
  createDuckipediaUrl as buildDuckipediaUrl,
  getAvailableSeries,
  getConditionLabel,
  normalizeConditionCode
} from "./config.js";
import { MagazineBarcodeScanner, parseSupplementToBandNumber } from "./scanner.js";
import {
  SCANNER_MODES,
  classifyScannerResult,
  createScannerQueueKey,
  mergeScannerQueueItem,
  normalizeScannerMode,
  summarizeScannerQueue
} from "./scanner-pro.js";
import { createEntityId, normalizeCopy, normalizeSeriesLookup } from "./archive-model.js";
import { getEntryCopies, getEntryId, toLegacyComic } from "./archive-entry.js";
import { createStableId } from "./app-utils.js";
import { ensureScannerLibrary } from "./asset-loader.js";
import { recordDiagnosticError } from "./diagnostics.js";
import { saveAppSettings, upsertArchiveEntries } from "./storage.js";

let state;
let elements;
let showToast;
let restoreBodyModalState;
let getMetadataForBand;
let recordDataChange;
let refreshCollection;
let refreshArchiveCoreStatus;
let showFormMessage;
let openAddPage;
let updateDuplicateConditionVisibility;
let setFormCoverPreview;
let setFormBusy;
let resolveConfiguredSeriesId;
let findComicBySeriesAndVolume;
let barcodeScanner;
let eventsBound = false;

export function createScannerFeature(context = {}) {
  ({
    state,
    elements,
    showToast,
    restoreBodyModalState,
    getMetadataForBand,
    recordDataChange,
    refreshCollection,
    refreshArchiveCoreStatus,
    showFormMessage,
    openAddPage,
    updateDuplicateConditionVisibility,
    setFormCoverPreview,
    setFormBusy,
    resolveConfiguredSeriesId,
    findComicBySeriesAndVolume
  } = context);
  bindScannerEvents();
  return {
    open: openScannerModal,
    close: closeScannerModal,
    stop: stopScannerCamera,
    updateModeUi: updateScannerModeUI,
    renderQueue: renderScannerQueue,
    syncQueueItem: syncScannerQueueLegacyFields,
    isOpen: () => Boolean(elements?.scannerModal && !elements.scannerModal.classList.contains("hidden"))
  };
}

function bindScannerEvents() {
  if (eventsBound) return;
  eventsBound = true;
  elements.closeScanner.addEventListener("click", closeScannerModal);
  elements.scannerModeFast.addEventListener("click", () => setScannerMode(SCANNER_MODES.FAST));
  elements.scannerModeReview.addEventListener("click", () => setScannerMode(SCANNER_MODES.REVIEW));
  elements.scannerStart.addEventListener("click", startScannerCamera);
  elements.scannerStop.addEventListener("click", stopScannerCamera);
  elements.scannerPhoto.addEventListener("change", handleScannerPhoto);
  elements.scannerManualApply.addEventListener("click", handleScannerManualCode);
  elements.scannerIsDuplicate.addEventListener("change", updateScannerDuplicateConditionVisibility);
  elements.scannerSeries.addEventListener("change", () => {
    if (state.scannerResult && state.scannerResult.series !== elements.scannerSeries.value) {
      clearScannerResult();
      setScannerStatus("Reihe geändert. Bitte scanne den Band erneut.");
    }
  });
  elements.scannerSave.addEventListener("click", handleScannerSave);
  elements.scannerApplyForm.addEventListener("click", handleScannerApplyToForm);
  elements.scannerRescan.addEventListener("click", resetScannerForNext);
  elements.scannerApplyDefaults.addEventListener("click", applyScannerDefaultsToQueue);
  elements.scannerSaveQueue.addEventListener("click", saveScannerQueue);
  elements.scannerClearQueue.addEventListener("click", clearScannerQueue);
  elements.scannerQueueList.addEventListener("input", handleScannerQueueInput);
  elements.scannerQueueList.addEventListener("change", handleScannerQueueInput);
  elements.scannerQueueList.addEventListener("click", handleScannerQueueClick);
  elements.scannerModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-scanner]")) closeScannerModal();
  });
}

function createConfiguredDuckipediaUrl(series, volumeNumber, title = "") {
  return buildDuckipediaUrl(series, volumeNumber, title, state.settings);
}

function getBarcodeScanner() {
  if (!barcodeScanner) {
    barcodeScanner = new MagazineBarcodeScanner(elements.scannerCameraTarget);
  }
  return barcodeScanner;
}

async function openScannerModal() {
  if (state.editingId) {
    showToast("Beende zuerst die Bearbeitung des geöffneten Eintrags.", "error");
    return;
  }

  const availableSeries = getAvailableSeries(state.settings, state.collectionEntries);
  if (availableSeries.includes(elements.series.value)) {
    elements.scannerSeries.value = elements.series.value;
  }

  elements.scannerCondition.value = elements.condition.value || DEFAULT_CONDITION_CODE;
  elements.scannerDuplicateCondition.value = elements.duplicateCondition.value || elements.scannerCondition.value;
  elements.scannerIsRead.checked = elements.isRead.checked;
  elements.scannerIsDuplicate.checked = elements.isDuplicate.checked;
  elements.scannerIsSealed.checked = elements.isSealed.checked;
  state.scannerMode = normalizeScannerMode(state.settings.scannerMode || state.scannerMode);
  state.scannerSessionScans = summarizeScannerQueue(state.scannerQueue).scans;
  updateScannerDuplicateConditionVisibility();
  updateScannerModeUI();
  clearScannerResult();
  renderScannerQueue();
  elements.scannerModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setScannerStatus("Scanner-Modul wird geladen …");

  try {
    await startScannerCamera();
  } catch (error) {
    console.warn("Scanner konnte beim Öffnen nicht automatisch starten:", error);
    recordDiagnosticError(error, "Scanner-Modul laden", "warning");
    setScannerStatus(error.message, "error");
  }
}

function closeScannerModal() {
  stopScannerCamera();
  abortScannerLookup();
  clearScannerResult();
  hideScannerDetectedFlash();
  elements.scannerPhoto.value = "";
  elements.scannerManualCode.value = "";
  elements.scannerModal.classList.add("hidden");
  restoreBodyModalState();
}

async function setScannerMode(mode) {
  const nextMode = normalizeScannerMode(mode);
  if (state.scannerMode === nextMode) return;
  state.scannerMode = nextMode;
  state.settings = await saveAppSettings({ ...state.settings, scannerMode: nextMode }).catch((error) => {
    recordDiagnosticError(error, "Scanner-Modus speichern", "warning");
    return { ...state.settings, scannerMode: nextMode };
  });
  clearScannerResult();
  updateScannerModeUI();
  if (!elements.scannerModal.classList.contains("hidden")) {
    stopScannerCamera();
    await startScannerCamera();
  }
}

function updateScannerModeUI() {
  const isFast = state.scannerMode === SCANNER_MODES.FAST;
  elements.scannerModeFast.classList.toggle("is-active", isFast);
  elements.scannerModeReview.classList.toggle("is-active", !isFast);
  elements.scannerModeFast.setAttribute("aria-pressed", String(isFast));
  elements.scannerModeReview.setAttribute("aria-pressed", String(!isFast));
  elements.scannerModeDescription.textContent = isFast
    ? "Erkannte Bände landen sofort in der Warteschlange. Duckipedia-Daten werden parallel ergänzt."
    : "Nach jedem Scan kannst du Titel, Jahr und vorhandene Exemplare prüfen, bevor der Band vorgemerkt wird.";
  elements.scannerModal.dataset.scannerMode = state.scannerMode;
  elements.scannerSave.textContent = isFast ? "Änderungen übernehmen" : "Vormerken & weiter";
  elements.scannerRescan.textContent = isFast ? "Treffer ausblenden" : "Neu scannen";
  renderScannerSessionStats();
}

async function startScannerCamera() {
  if (!elements.scannerSeries.value) {
    setScannerStatus("Bitte wähle zuerst eine Reihe aus.", "error");
    elements.scannerSeries.focus();
    return;
  }

  try {
    setScannerStatus("Scanner-Modul wird geladen …");
    await ensureScannerLibrary();
  } catch (error) {
    recordDiagnosticError(error, "Scanner-Modul laden", "warning");
    setScannerStatus(error.message, "error");
    return;
  }

  const scanner = getBarcodeScanner();
  if (!scanner.isSupported()) {
    setScannerStatus(
      "Live-Scan ist hier nicht verfügbar. Nutze den Foto-Fallback oder prüfe, ob die App über HTTPS geöffnet wurde.",
      "error"
    );
    return;
  }

  stopScannerCamera();
  if (state.scannerMode === SCANNER_MODES.REVIEW) clearScannerResult();
  elements.scannerStart.disabled = true;
  elements.scannerCameraPlaceholder.classList.add("hidden");
  elements.scannerStart.classList.add("hidden");
  elements.scannerStop.classList.remove("hidden");
  setScannerStatus(state.scannerMode === SCANNER_MODES.FAST
    ? "Kamera aktiv: Halte die gesamte weiße Barcodefläche in den Rahmen und nimm den Band nach der Bestätigung wieder heraus."
    : "Kamera aktiv: Richte die gesamte weiße Barcodefläche waagerecht im Rahmen aus.");

  try {
    await scanner.start({
      continuous: state.scannerMode === SCANNER_MODES.FAST,
      onDetected: (payload) => handleScannerDetected(payload, { source: "camera" }),
      onInterim: ({ type }) => {
        if (type === "main-code-only") {
          setScannerStatus("Großer Barcode erkannt. Bewege das Heft etwas weiter weg, damit auch der kleine Zusatzcode rechts sichtbar ist.");
        }
      },
      onError: (error) => {
        console.warn("Scannerfehler:", error);
        setScannerStatus("Das Bild konnte noch nicht gelesen werden. Halte Barcode und Zusatzcode ruhig und möglichst gerade.");
      }
    });
  } catch (error) {
    console.error("Kamera konnte nicht gestartet werden:", error);
    stopScannerCamera();
    setScannerStatus(error.message, "error");
  } finally {
    elements.scannerStart.disabled = false;
  }
}

function stopScannerCamera() {
  barcodeScanner?.stop();
  elements.scannerStart.classList.remove("hidden");
  elements.scannerStop.classList.add("hidden");
  elements.scannerCameraPlaceholder.classList.remove("hidden");
}

async function handleScannerPhoto() {
  const [file] = elements.scannerPhoto.files || [];
  elements.scannerPhoto.value = "";

  if (!file) return;
  if (!elements.scannerSeries.value) {
    setScannerStatus("Bitte wähle vor der Fotoauswertung eine Reihe aus.", "error");
    return;
  }

  stopScannerCamera();
  clearScannerResult();
  setScannerStatus("Foto wird lokal auf dem iPhone ausgewertet …");
  elements.scannerStart.disabled = true;

  try {
    await ensureScannerLibrary();
    const payload = await getBarcodeScanner().decodeImageFile(file);
    await handleScannerDetected(payload, { source: "photo" });
  } catch (error) {
    console.error("Barcodefoto konnte nicht ausgewertet werden:", error);
    recordDiagnosticError(error, "Barcodefoto auswerten", "warning");
    setScannerStatus(error.message, "error");
  } finally {
    elements.scannerStart.disabled = false;
  }
}

async function handleScannerManualCode() {
  const extension = elements.scannerManualCode.value.trim();
  const bandNumber = parseSupplementToBandNumber(extension);

  if (bandNumber === null) {
    setScannerStatus("Der Zusatzcode muss genau zwei oder fünf Ziffern enthalten und darf nicht nur aus Nullen bestehen.", "error");
    elements.scannerManualCode.focus();
    return;
  }

  if (!elements.scannerSeries.value) {
    setScannerStatus("Bitte wähle zuerst eine Reihe aus.", "error");
    elements.scannerSeries.focus();
    return;
  }

  stopScannerCamera();
  elements.scannerManualCode.value = "";
  await handleScannerDetected({ extension, bandNumber, mainBarcode: "", format: null }, { source: "manual" });
}

async function handleScannerDetected(payload, { source = "camera" } = {}) {
  state.scannerSessionScans += 1;
  renderScannerSessionStats();

  if (state.scannerMode === SCANNER_MODES.FAST) {
    await queueScannerDetectedPayload(payload, { source });
    if (source !== "camera" && !elements.scannerModal.classList.contains("hidden")) {
      window.setTimeout(() => startScannerCamera(), 220);
    }
    return;
  }

  const series = elements.scannerSeries.value;
  const token = `${series}::${payload.bandNumber}::${Date.now()}::${Math.random()}`;
  const pageUrl = createConfiguredDuckipediaUrl(series, payload.bandNumber);

  stopScannerCamera();
  abortScannerLookup();
  state.scannerResult = {
    ...payload,
    recognitionSource: source,
    series,
    pageUrl,
    metadataStatus: navigator.onLine ? "loading" : "offline",
    token
  };

  elements.scannerBandNumber.textContent = String(payload.bandNumber);
  elements.scannerExtension.textContent = source === "manual" ? `Manuell ${payload.extension}` : `Code ${payload.extension}`;
  elements.scannerResultName.value = "";
  elements.scannerResultYear.value = "";
  elements.scannerDuckipediaLink.href = pageUrl;
  elements.scannerResult.classList.remove("hidden");
  setScannerStatus(`Band ${payload.bandNumber} wurde erkannt. Prüfe die Angaben und merke den Band vor.`, "success");
  showScannerDetectedFlash(payload.bandNumber, source === "manual" ? "Manuell erkannt" : "Erkannt", "Bitte Angaben prüfen");

  const existingIssue = findExistingScannerIssue(series, payload.bandNumber);
  const existingCopyCount = existingIssue ? getEntryCopies(existingIssue).length : 0;
  elements.scannerExistingWarning.classList.toggle("hidden", existingCopyCount === 0);
  elements.scannerExistingWarning.textContent = existingCopyCount === 0
    ? ""
    : existingCopyCount === 1
      ? "Dieser Band ist bereits mit einem Exemplar vorhanden."
      : `Dieser Band ist bereits mit ${existingCopyCount} Exemplaren vorhanden.`;

  await lookupScannerMetadata(token);
}

async function queueScannerDetectedPayload(payload, { source = "camera" } = {}) {
  const series = elements.scannerSeries.value;
  if (!series) {
    setScannerStatus("Bitte wähle zuerst eine Reihe aus.", "error");
    return;
  }

  const existingIssue = findExistingScannerIssue(series, payload.bandNumber);
  const now = new Date().toISOString();
  const queueId = createStableId();
  const pageUrl = createConfiguredDuckipediaUrl(series, payload.bandNumber);
  const copyCount = elements.scannerIsDuplicate.checked ? 2 : 1;
  const copyDrafts = Array.from({ length: copyCount }, (_, index) => ({
    condition: index === 1
      ? (elements.scannerDuplicateCondition.value || elements.scannerCondition.value || DEFAULT_CONDITION_CODE)
      : (elements.scannerCondition.value || DEFAULT_CONDITION_CODE),
    isRead: index === 0 ? elements.scannerIsRead.checked : false,
    isSealed: index === 0 ? elements.scannerIsSealed.checked : false,
    notes: ""
  }));

  const incoming = {
    queueId,
    queueKey: createScannerQueueKey(series, payload.bandNumber),
    series,
    volumeNumber: String(payload.bandNumber),
    numericBandNumber: payload.bandNumber,
    title: "",
    publicationYear: null,
    condition: copyDrafts[0].condition,
    isRead: copyDrafts[0].isRead,
    isSealed: copyDrafts[0].isSealed,
    isDuplicate: copyDrafts.length > 1,
    duplicateCondition: copyDrafts[1]?.condition || null,
    notes: "",
    copyDrafts,
    extension: payload.extension,
    mainBarcode: payload.mainBarcode || "",
    recognitionSource: source,
    pageUrl,
    existingComicId: existingIssue?.id || null,
    action: existingIssue ? "additional-copy" : "add",
    metadataStatus: navigator.onLine ? "queued" : "offline",
    metadataError: "",
    scanCount: 1,
    lastDetectedAt: now,
    createdAt: now,
    updatedAt: now
  };

  const merged = mergeScannerQueueItem(state.scannerQueue, incoming);
  if (!merged.item) {
    setScannerStatus("Der erkannte Band konnte nicht vorgemerkt werden.", "error");
    return;
  }
  state.scannerQueue = merged.queue;
  renderScannerQueue();

  const label = merged.merged
    ? `${merged.addedCopies} weiteres Exemplar${merged.addedCopies === 1 ? "" : "e"}`
    : existingIssue
      ? "Als weiteres Exemplar"
      : "Neue Ausgabe";
  showScannerDetectedFlash(payload.bandNumber, "Vorgemerkt", label);
  setScannerStatus(`${series}, Band ${payload.bandNumber} wurde vorgemerkt. Nächsten Band in den Rahmen halten.`, "success");
  try { navigator.vibrate?.(35); } catch { /* optionale Rückmeldung */ }

  if (!merged.merged || !["found", "loading"].includes(merged.item.metadataStatus)) {
    void lookupScannerQueueMetadata(merged.item.queueId);
  }
}

async function lookupScannerQueueMetadata(queueId) {
  if (!navigator.onLine || state.scannerQueueLookups.has(queueId)) return;
  const item = state.scannerQueue.find((entry) => entry.queueId === queueId);
  if (!item) return;
  const controller = new AbortController();
  state.scannerQueueLookups.set(queueId, controller);
  item.metadataStatus = "loading";
  item.metadataError = "";
  renderScannerQueue();

  try {
    const result = await getMetadataForBand(item.series, item.numericBandNumber, { signal: controller.signal });
    if (controller.signal.aborted) return;
    const current = state.scannerQueue.find((entry) => entry.queueId === queueId);
    if (!current) return;
    current.pageUrl = result.pageUrl || current.pageUrl;
    current.coverUrl = result.coverUrl || current.coverUrl || "";
    current.coverFileName = result.coverFileName || current.coverFileName || "";
    current.coverSource = result.coverSource || current.coverSource || "";
    current.lookupVersion = Number(result.lookupVersion || current.lookupVersion || 0);
    current.metadataFetchedAt = result.fetchedAt || new Date().toISOString();
    current.metadataStatus = result.found ? "found" : "not-found";
    current.metadataError = result.found ? "" : (result.reason || "Keine passenden Duckipedia-Daten gefunden.");
    if (!current.title && result.title) current.title = result.title;
    if (!current.publicationYear && result.publicationYear) current.publicationYear = result.publicationYear;
  } catch (error) {
    if (error?.name !== "AbortError") {
      const current = state.scannerQueue.find((entry) => entry.queueId === queueId);
      if (current) {
        current.metadataStatus = navigator.onLine ? "error" : "offline";
        current.metadataError = error.message || "Duckipedia-Daten konnten nicht geladen werden.";
      }
      recordDiagnosticError(error, "Scanner-Metadaten laden", "warning");
    }
  } finally {
    state.scannerQueueLookups.delete(queueId);
    renderScannerQueue();
  }
}

async function lookupScannerMetadata(token) {
  if (!state.scannerResult || state.scannerResult.token !== token) return;
  if (!navigator.onLine) {
    elements.scannerLookupStatus.textContent = "Offline: Titel und Erscheinungsjahr können gerade nicht automatisch ergänzt werden.";
    return;
  }

  const controller = new AbortController();
  state.scannerLookupController = controller;
  elements.scannerLookupStatus.textContent = "Duckipedia wird nach Titel und Erscheinungsjahr durchsucht …";

  try {
    const result = await getMetadataForBand(state.scannerResult.series, state.scannerResult.bandNumber, { signal: controller.signal });
    if (!state.scannerResult || state.scannerResult.token !== token || controller.signal.aborted) return;
    state.scannerResult.pageUrl = result.pageUrl;
    state.scannerResult.coverUrl = result.coverUrl || "";
    state.scannerResult.coverFileName = result.coverFileName || "";
    state.scannerResult.coverSource = result.coverSource || "";
    state.scannerResult.lookupVersion = Number(result.lookupVersion || 0);
    state.scannerResult.metadataFetchedAt = result.fetchedAt || new Date().toISOString();
    state.scannerResult.metadataStatus = result.found ? "found" : "not-found";
    elements.scannerDuckipediaLink.href = result.pageUrl;
    if (result.title) elements.scannerResultName.value = result.title;
    if (result.publicationYear) elements.scannerResultYear.value = String(result.publicationYear);
    if (result.found && (result.title || result.publicationYear)) {
      const foundParts = [result.title ? "Titel" : "", result.publicationYear ? "Jahr" : ""].filter(Boolean);
      elements.scannerLookupStatus.textContent = `${foundParts.join(" und ")} wurden aus Duckipedia ergänzt.`;
    } else if (result.found) {
      elements.scannerLookupStatus.textContent = "Die Bandseite wurde gefunden, enthält aber keine automatisch auswertbaren Titel- oder Jahresangaben.";
    } else {
      elements.scannerLookupStatus.textContent = result.reason || "Titel und Jahr konnten nicht automatisch ergänzt werden.";
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      elements.scannerLookupStatus.textContent = `Duckipedia-Daten konnten nicht geladen werden: ${error.message}`;
      state.scannerResult.metadataStatus = "error";
    }
  }
}

function abortScannerLookup() {
  state.scannerLookupController?.abort();
  state.scannerLookupController = null;
}

function findExistingScannerIssue(series, bandNumber) {
  return state.collectionEntries.find((comic) => (
    normalizeSeriesLookup(getEntrySeriesName(comic)) === normalizeSeriesLookup(series)
    && getEntryNumericBandNumber(comic) === Number(bandNumber)
  )) || null;
}

function showScannerDetectedFlash(bandNumber, kicker, note = "") {
  window.clearTimeout(state.scannerFlashTimer);
  elements.scannerDetectedBand.textContent = String(bandNumber);
  elements.scannerDetectedKicker.textContent = kicker;
  elements.scannerDetectedNote.textContent = note;
  elements.scannerDetectedFlash.classList.remove("hidden");
  state.scannerFlashTimer = window.setTimeout(hideScannerDetectedFlash, 1050);
}

function hideScannerDetectedFlash() {
  window.clearTimeout(state.scannerFlashTimer);
  state.scannerFlashTimer = null;
  elements.scannerDetectedFlash.classList.add("hidden");
}

async function handleScannerSave() {
  if (!state.scannerResult) {
    setScannerStatus("Scanne zuerst einen Band.", "error");
    return;
  }

  try {
    const item = buildComicFromScanner();
    const existingComic = findExistingScannerIssue(item.series, item.numericBandNumber);
    const now = new Date().toISOString();
    const incoming = {
      ...item,
      queueId: createStableId(),
      queueKey: createScannerQueueKey(item.series, item.numericBandNumber),
      extension: state.scannerResult.extension,
      mainBarcode: state.scannerResult.mainBarcode || "",
      recognitionSource: state.scannerResult.recognitionSource || "camera",
      pageUrl: item.duckipediaPageUrl,
      coverUrl: item.duckipediaCoverUrl,
      coverFileName: item.duckipediaCoverFileName,
      coverSource: item.duckipediaCoverSource,
      lookupVersion: item.duckipediaCoverLookupVersion,
      existingComicId: existingComic?.id || null,
      action: existingComic ? "additional-copy" : "add",
      scanCount: 1,
      lastDetectedAt: now
    };

    const merged = mergeScannerQueueItem(state.scannerQueue, incoming);
    if (!merged.item) throw new Error("Der erkannte Band konnte nicht vorgemerkt werden.");
    state.scannerQueue = merged.queue;
    renderScannerQueue();
    clearScannerResult();

    const copyText = merged.addedCopies === 1 ? "ein Exemplar" : `${merged.addedCopies} Exemplare`;
    setScannerStatus(
      `${item.series}, Band ${item.volumeNumber}: ${copyText} vorgemerkt. Bereit für den nächsten Scan.`,
      "success"
    );
    await startScannerCamera();
  } catch (error) {
    console.error("Gescannter Band konnte nicht vorgemerkt werden:", error);
    setScannerStatus(`Übernahme fehlgeschlagen: ${error.message}`, "error");
  }
}

function renderScannerSessionStats() {
  const summary = summarizeScannerQueue(state.scannerQueue, { sessionScans: state.scannerSessionScans });
  elements.scannerStatScanned.textContent = String(summary.scans);
  elements.scannerStatNew.textContent = String(summary.new);
  elements.scannerStatExisting.textContent = String(summary.existing);
  elements.scannerStatReview.textContent = String(summary.review);
}

function renderScannerQueue() {
  elements.scannerQueueList.replaceChildren();
  const queue = state.scannerQueue;
  const summary = summarizeScannerQueue(queue, { sessionScans: state.scannerSessionScans });
  elements.scannerQueueCount.textContent = queue.length === 0
    ? "0 Ausgaben"
    : `${queue.length} ${queue.length === 1 ? "Ausgabe" : "Ausgaben"} · ${summary.copies} ${summary.copies === 1 ? "Exemplar" : "Exemplare"}`;
  elements.scannerSaveQueue.disabled = queue.length === 0;
  elements.scannerApplyDefaults.disabled = queue.length === 0;
  elements.scannerClearQueue.disabled = queue.length === 0;
  renderScannerSessionStats();

  if (queue.length === 0) {
    const empty = document.createElement("div");
    empty.className = "scanner-queue-empty";
    const title = document.createElement("strong");
    title.textContent = "Bereit für die erste Ausgabe";
    const copy = document.createElement("p");
    copy.textContent = "Halte den Barcode in den Rahmen. Im Schnellmodus bleibt die Kamera für den nächsten Band aktiv.";
    empty.append(title, copy);
    elements.scannerQueueList.append(empty);
    return;
  }

  queue.forEach((item, index) => {
    const status = classifyScannerResult(item);
    const drafts = getScannerQueueCopyDrafts(item);
    const card = document.createElement("article");
    card.className = `scanner-queue-card is-${status.tone}`;
    card.dataset.queueId = item.queueId;
    card.dataset.queueStatus = status.id;

    const heading = document.createElement("div");
    heading.className = "scanner-queue-card-heading";

    const identity = document.createElement("div");
    identity.className = "scanner-queue-identity";
    const number = document.createElement("span");
    number.className = "scanner-queue-number";
    number.textContent = String(item.volumeNumber);
    const titleWrap = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.className = "stat-label";
    kicker.textContent = `${item.series} · Position ${index + 1}`;
    const title = document.createElement("h4");
    title.textContent = item.title || `Band ${item.volumeNumber}`;
    const meta = document.createElement("small");
    meta.textContent = item.publicationYear
      ? `Erschienen ${item.publicationYear}`
      : getScannerMetadataMessage(item);
    titleWrap.append(kicker, title, meta);
    identity.append(number, titleWrap);

    const headingActions = document.createElement("div");
    headingActions.className = "scanner-queue-heading-actions";
    const statusBadge = document.createElement("span");
    statusBadge.className = `scanner-queue-status is-${status.tone}`;
    statusBadge.textContent = status.label;
    const copyBadge = document.createElement("span");
    copyBadge.className = "scanner-copy-count";
    copyBadge.textContent = drafts.length === 1 ? "1 Exemplar" : `${drafts.length} Exemplare`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button small-icon-button scanner-queue-remove";
    remove.dataset.queueAction = "remove";
    remove.setAttribute("aria-label", `${item.series}, Band ${item.volumeNumber} aus der Warteschlange entfernen`);
    remove.textContent = "×";
    headingActions.append(statusBadge, copyBadge, remove);
    heading.append(identity, headingActions);

    const details = document.createElement("details");
    details.className = "scanner-queue-editor";
    details.open = status.needsReview;
    const summaryElement = document.createElement("summary");
    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = status.needsReview ? "Angaben prüfen" : "Angaben & Exemplare";
    const summaryHint = document.createElement("small");
    summaryHint.textContent = drafts.length === 1
      ? getConditionLabel(drafts[0].condition)
      : `${drafts.length} Zustände bearbeiten`;
    summaryElement.append(summaryLabel, summaryHint);

    const editor = document.createElement("div");
    editor.className = "scanner-queue-editor-body";
    const grid = document.createElement("div");
    grid.className = "field-grid compact-field-grid scanner-queue-fields";
    grid.append(
      createQueueInput("Titel", "title", item.title, "text", 200, "field-full"),
      createQueueInput("Erscheinungsjahr", "publicationYear", item.publicationYear ?? "", "number", 4)
    );

    if (item.existingComicId) {
      const actionField = document.createElement("label");
      actionField.className = "field";
      const actionLabel = document.createElement("span");
      actionLabel.textContent = "Bereits vorhanden";
      const actionSelect = document.createElement("select");
      actionSelect.dataset.queueField = "action";
      actionSelect.append(
        createOption("additional-copy", "Als weiteres Exemplar speichern"),
        createOption("skip", "Überspringen")
      );
      actionSelect.value = item.action === "skip" ? "skip" : "additional-copy";
      const existing = state.collectionEntries.find((comic) => comic.id === item.existingComicId);
      const hint = document.createElement("small");
      hint.className = "field-help";
      const count = existing ? getEntryCopies(existing).length : 0;
      hint.textContent = `${count} ${count === 1 ? "Exemplar ist" : "Exemplare sind"} bereits im Archiv.`;
      actionField.append(actionLabel, actionSelect, hint);
      grid.append(actionField);
    }
    editor.append(grid);

    const copiesHeading = document.createElement("div");
    copiesHeading.className = "scanner-copy-editor-heading";
    const copiesTitle = document.createElement("div");
    const copiesStrong = document.createElement("strong");
    copiesStrong.textContent = "Physische Exemplare";
    const copiesSmall = document.createElement("small");
    copiesSmall.textContent = "Jeder erneute Scan derselben Ausgabe ergänzt ein Exemplar, nicht einen zweiten Bandeintrag.";
    copiesTitle.append(copiesStrong, copiesSmall);
    const addCopy = document.createElement("button");
    addCopy.type = "button";
    addCopy.className = "inline-action";
    addCopy.dataset.queueAction = "add-copy";
    addCopy.textContent = "+ Exemplar";
    copiesHeading.append(copiesTitle, addCopy);
    editor.append(copiesHeading);

    const copyList = document.createElement("div");
    copyList.className = "scanner-copy-editor-list";
    drafts.forEach((draft, copyIndex) => {
      copyList.append(createScannerQueueCopyEditor(item, draft, copyIndex, drafts.length));
    });
    editor.append(copyList);

    const footer = document.createElement("div");
    footer.className = "scanner-queue-card-footer";
    const link = document.createElement("a");
    link.className = "text-link scanner-queue-link";
    link.href = item.pageUrl || createConfiguredDuckipediaUrl(item.series, item.volumeNumber, item.title);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Duckipedia öffnen";
    footer.append(link);

    if (["error", "not-found", "offline"].includes(item.metadataStatus)) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "text-button";
      retry.dataset.queueAction = "retry-metadata";
      retry.textContent = navigator.onLine ? "Daten erneut laden" : "Offline";
      retry.disabled = !navigator.onLine;
      footer.append(retry);
    }

    editor.append(footer);
    details.append(summaryElement, editor);
    card.append(heading, details);
    elements.scannerQueueList.append(card);
  });
}

function getScannerMetadataMessage(item) {
  if (item.metadataStatus === "loading" || item.metadataStatus === "queued") return "Duckipedia-Daten werden ergänzt …";
  if (item.metadataStatus === "offline") return "Offline erkannt · Daten später ergänzen";
  if (item.metadataStatus === "not-found") return "Keine Duckipedia-Daten gefunden";
  if (item.metadataStatus === "error") return item.metadataError || "Daten konnten nicht geladen werden";
  if (item.metadataStatus === "found") return "Duckipedia-Daten geladen";
  return "Bandnummer erkannt";
}

function createQueueInput(labelText, fieldName, value, type, maxLength, extraClass = "") {
  const label = document.createElement("label");
  label.className = `field ${extraClass}`.trim();
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.dataset.queueField = fieldName;
  input.value = String(value ?? "");
  if (type === "number") {
    input.inputMode = "numeric";
    input.min = "1800";
    input.max = String(APP_CONFIG.publicationYearMaximum);
  } else if (maxLength) {
    input.maxLength = maxLength;
  }
  label.append(span, input);
  return label;
}

function createScannerQueueCopyEditor(item, draft, copyIndex, copyCount) {
  const card = document.createElement("article");
  card.className = "scanner-copy-editor-item";
  card.dataset.queueCopyIndex = String(copyIndex);

  const heading = document.createElement("div");
  heading.className = "scanner-copy-editor-item-heading";
  const title = document.createElement("strong");
  title.textContent = `Exemplar ${copyIndex + 1}`;
  heading.append(title);
  if (copyCount > 1) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button danger-text compact-button";
    remove.dataset.queueAction = "remove-copy";
    remove.dataset.queueCopyIndex = String(copyIndex);
    remove.textContent = "Entfernen";
    heading.append(remove);
  }

  const fields = document.createElement("div");
  fields.className = "scanner-copy-editor-fields";

  const conditionField = document.createElement("div");
  conditionField.className = "field";
  const conditionId = `scanner-${item.queueId}-copy-${copyIndex}-condition`;
  const labelRow = document.createElement("div");
  labelRow.className = "field-label-row";
  const conditionLabel = document.createElement("label");
  conditionLabel.htmlFor = conditionId;
  conditionLabel.textContent = "Zustand";
  const assistant = document.createElement("button");
  assistant.type = "button";
  assistant.className = "inline-action condition-assistant-trigger";
  assistant.dataset.openConditionAssistant = "";
  assistant.dataset.assistantQueueId = item.queueId;
  assistant.dataset.assistantQueueCopyIndex = String(copyIndex);
  assistant.textContent = "Assistent";
  labelRow.append(conditionLabel, assistant);
  const conditionSelect = document.createElement("select");
  conditionSelect.id = conditionId;
  conditionSelect.dataset.queueCopyField = "condition";
  conditionSelect.dataset.queueCopyIndex = String(copyIndex);
  APP_CONFIG.conditions.forEach((condition) => {
    conditionSelect.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
  });
  conditionSelect.value = normalizeConditionCode(draft.condition, DEFAULT_CONDITION_CODE);
  conditionField.append(labelRow, conditionSelect);

  const flags = document.createElement("div");
  flags.className = "scanner-copy-flags";
  flags.append(
    createQueueCopyCheckbox("Gelesen", "isRead", draft.isRead, copyIndex),
    createQueueCopyCheckbox("Foliert", "isSealed", draft.isSealed, copyIndex)
  );

  const notesField = document.createElement("label");
  notesField.className = "field field-full scanner-copy-notes";
  const notesLabel = document.createElement("span");
  notesLabel.textContent = "Notiz";
  const notes = document.createElement("textarea");
  notes.rows = 2;
  notes.maxLength = 1200;
  notes.placeholder = "Optional, z. B. Stempel, Knick oder Tauschbestand";
  notes.dataset.queueCopyField = "notes";
  notes.dataset.queueCopyIndex = String(copyIndex);
  notes.value = String(draft.notes || "");
  notesField.append(notesLabel, notes);

  fields.append(conditionField, flags, notesField);
  card.append(heading, fields);
  return card;
}

function createQueueCopyCheckbox(labelText, fieldName, checked, copyIndex) {
  const label = document.createElement("label");
  label.className = "check-row compact-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.queueCopyField = fieldName;
  input.dataset.queueCopyIndex = String(copyIndex);
  input.checked = Boolean(checked);
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(input, span);
  return label;
}

function getScannerQueueCopyDrafts(item) {
  if (!Array.isArray(item.copyDrafts) || item.copyDrafts.length === 0) {
    item.copyDrafts = [{
      condition: normalizeConditionCode(item.condition, DEFAULT_CONDITION_CODE),
      isRead: item.isRead === true,
      isSealed: item.isSealed === true,
      notes: String(item.notes || "")
    }];
    if (item.isDuplicate) {
      item.copyDrafts.push({
        condition: normalizeConditionCode(item.duplicateCondition || item.condition, DEFAULT_CONDITION_CODE),
        isRead: false,
        isSealed: false,
        notes: ""
      });
    }
  }
  item.copyDrafts = item.copyDrafts.map((draft) => ({
    condition: normalizeConditionCode(draft?.condition, DEFAULT_CONDITION_CODE),
    isRead: draft?.isRead === true,
    isSealed: draft?.isSealed === true,
    notes: String(draft?.notes || "")
  }));
  syncScannerQueueLegacyFields(item);
  return item.copyDrafts;
}

function syncScannerQueueLegacyFields(item) {
  const drafts = Array.isArray(item.copyDrafts) && item.copyDrafts.length
    ? item.copyDrafts
    : [{ condition: DEFAULT_CONDITION_CODE, isRead: false, isSealed: false, notes: "" }];
  const primary = drafts[0];
  item.condition = normalizeConditionCode(primary.condition, DEFAULT_CONDITION_CODE);
  item.isRead = primary.isRead === true;
  item.isSealed = primary.isSealed === true;
  item.notes = String(primary.notes || "");
  item.isDuplicate = drafts.length > 1;
  item.duplicateCondition = drafts[1]?.condition || null;
}

function handleScannerQueueInput(event) {
  const control = event.target.closest("[data-queue-field], [data-queue-copy-field]");
  const card = event.target.closest("[data-queue-id]");
  if (!control || !card) return;
  const item = state.scannerQueue.find((entry) => entry.queueId === card.dataset.queueId);
  if (!item) return;

  if (control.dataset.queueCopyField) {
    const copyIndex = Number(control.dataset.queueCopyIndex);
    const drafts = getScannerQueueCopyDrafts(item);
    const draft = drafts[copyIndex];
    if (!draft) return;
    const field = control.dataset.queueCopyField;
    draft[field] = control instanceof HTMLInputElement && control.type === "checkbox"
      ? control.checked
      : control.value;
    syncScannerQueueLegacyFields(item);
    renderScannerSessionStats();
    return;
  }

  const field = control.dataset.queueField;
  if (field === "publicationYear") {
    item.publicationYear = control.value ? Number(control.value) : null;
  } else {
    item[field] = control.value;
  }

  if (field === "action") renderScannerQueue();
  else renderScannerSessionStats();
}

function handleScannerQueueClick(event) {
  const button = event.target.closest("button[data-queue-action]");
  const card = event.target.closest("[data-queue-id]");
  if (!button || !card) return;
  const queueId = card.dataset.queueId;
  const item = state.scannerQueue.find((entry) => entry.queueId === queueId);
  if (!item) return;

  const action = button.dataset.queueAction;
  if (action === "remove") {
    state.scannerQueueLookups.get(queueId)?.abort();
    state.scannerQueueLookups.delete(queueId);
    state.scannerQueue = state.scannerQueue.filter((entry) => entry.queueId !== queueId);
    renderScannerQueue();
    return;
  }

  if (action === "retry-metadata") {
    void lookupScannerQueueMetadata(queueId);
    return;
  }

  const drafts = getScannerQueueCopyDrafts(item);
  if (action === "add-copy") {
    drafts.push({
      condition: elements.scannerDuplicateCondition.value || elements.scannerCondition.value || DEFAULT_CONDITION_CODE,
      isRead: false,
      isSealed: false,
      notes: ""
    });
    syncScannerQueueLegacyFields(item);
    renderScannerQueue();
    return;
  }

  if (action === "remove-copy") {
    const copyIndex = Number(button.dataset.queueCopyIndex);
    if (drafts.length <= 1 || !Number.isInteger(copyIndex)) return;
    drafts.splice(copyIndex, 1);
    syncScannerQueueLegacyFields(item);
    renderScannerQueue();
  }
}

function applyScannerDefaultsToQueue() {
  if (state.scannerQueue.length === 0) return;
  const primaryCondition = elements.scannerCondition.value || DEFAULT_CONDITION_CODE;
  const secondaryCondition = elements.scannerDuplicateCondition.value || primaryCondition;
  state.scannerQueue.forEach((item) => {
    const drafts = getScannerQueueCopyDrafts(item);
    drafts.forEach((draft, index) => {
      draft.condition = index === 0 ? primaryCondition : secondaryCondition;
      draft.isRead = index === 0 ? elements.scannerIsRead.checked : false;
      draft.isSealed = index === 0 ? elements.scannerIsSealed.checked : false;
    });
    if (elements.scannerIsDuplicate.checked && drafts.length === 1) {
      drafts.push({ condition: secondaryCondition, isRead: false, isSealed: false, notes: "" });
    }
    syncScannerQueueLegacyFields(item);
  });
  renderScannerQueue();
  elements.scannerQueueMessage.textContent = "Die aktuellen Scanner-Einstellungen wurden auf alle vorgemerkten Exemplare angewendet.";
  elements.scannerQueueMessage.dataset.type = "success";
}

function clearScannerQueue() {
  if (state.scannerQueue.length === 0) return;
  if (!window.confirm("Die gesamte Scanner-Warteschlange verwerfen? Noch nicht gespeicherte Exemplare gehen dabei verloren.")) return;
  state.scannerQueueLookups.forEach((controller) => controller.abort());
  state.scannerQueueLookups.clear();
  state.scannerQueue = [];
  state.scannerSessionScans = 0;
  renderScannerQueue();
  elements.scannerQueueMessage.textContent = "Warteschlange geleert.";
  elements.scannerQueueMessage.dataset.type = "info";
}

async function saveScannerQueue() {
  if (state.scannerQueue.length === 0) {
    elements.scannerQueueMessage.textContent = "Die Warteschlange ist leer.";
    elements.scannerQueueMessage.dataset.type = "error";
    return;
  }

  const records = [];
  let skipped = 0;
  let savedCopies = 0;
  let newIssues = 0;
  let updatedIssues = 0;

  try {
    state.scannerQueue.forEach((item) => {
      validateQueuedComic(item);
      if (item.action === "skip") {
        skipped += 1;
        return;
      }

      const drafts = getScannerQueueCopyDrafts(item);
      const now = new Date().toISOString();
      const existing = item.existingComicId
        ? state.collectionEntries.find((comic) => comic.id === item.existingComicId)
        : findComicBySeriesAndVolume(item.series, item.volumeNumber);

      if (existing) {
        const existingView = toLegacyComic(existing);
        const existingCopies = getEntryCopies(existing);
        const incomingCopies = drafts.map((draft, index) => normalizeCopy({
          id: createEntityId("copy"),
          issueId: getEntryId(existing),
          condition: draft.condition,
          isRead: draft.isRead,
          isSealed: draft.isSealed,
          notes: draft.notes,
          source: "scanner-pro",
          createdAt: now,
          updatedAt: now
        }, { issueId: getEntryId(existing), position: existingCopies.length + index + 1, now }));
        const copies = [...existingCopies, ...incomingCopies].map((copy, index) => ({
          ...copy,
          issueId: getEntryId(existing),
          displayOrder: index + 1
        }));
        const primary = copies[0];
        records.push({
          ...existingView,
          seriesId: existingView.seriesId || resolveConfiguredSeriesId(item.series),
          title: existingView.title || item.title || "",
          publicationYear: existingView.publicationYear || item.publicationYear || null,
          duckipediaPageUrl: existingView.duckipediaPageUrl || item.pageUrl || "",
          duckipediaCoverUrl: existingView.duckipediaCoverUrl || item.coverUrl || "",
          duckipediaCoverFileName: existingView.duckipediaCoverFileName || item.coverFileName || "",
          duckipediaCoverSource: existingView.duckipediaCoverSource || item.coverSource || "",
          duckipediaCoverLookupVersion: Number(existingView.duckipediaCoverLookupVersion || item.lookupVersion || 0),
          metadataStatus: existingView.metadataStatus || item.metadataStatus || "",
          metadataFetchedAt: existingView.metadataFetchedAt || item.metadataFetchedAt || null,
          copies,
          copyCount: copies.length,
          condition: primary.condition,
          duplicateCondition: copies[1]?.condition || null,
          isRead: primary.isRead,
          isSealed: primary.isSealed,
          isDuplicate: copies.length > 1,
          dataFormatVersion: APP_CONFIG.dataFormatVersion,
          updatedAt: now
        });
        savedCopies += incomingCopies.length;
        updatedIssues += 1;
        return;
      }

      const issueId = createStableId();
      const copies = drafts.map((draft, index) => normalizeCopy({
        id: createEntityId("copy"),
        issueId,
        condition: draft.condition,
        isRead: draft.isRead,
        isSealed: draft.isSealed,
        notes: draft.notes,
        source: "scanner-pro",
        createdAt: now,
        updatedAt: now
      }, { issueId, position: index + 1, now }));
      const primary = copies[0];
      records.push({
        id: issueId,
        seriesId: resolveConfiguredSeriesId(item.series),
        dataFormatVersion: APP_CONFIG.dataFormatVersion,
        series: item.series,
        volumeNumber: String(item.volumeNumber),
        numericBandNumber: Number(item.numericBandNumber),
        title: String(item.title || ""),
        publicationYear: item.publicationYear || null,
        copies,
        copyCount: copies.length,
        condition: primary.condition,
        duplicateCondition: copies[1]?.condition || null,
        isRead: primary.isRead,
        isDuplicate: copies.length > 1,
        isSealed: primary.isSealed,
        notes: primary.notes || "",
        duckipediaPageUrl: item.pageUrl || createConfiguredDuckipediaUrl(item.series, item.volumeNumber, item.title),
        duckipediaCoverUrl: item.coverUrl || "",
        duckipediaCoverFileName: item.coverFileName || "",
        duckipediaCoverSource: item.coverSource || "",
        duckipediaCoverLookupVersion: Number(item.lookupVersion || 0),
        metadataStatus: item.metadataStatus || "",
        metadataFetchedAt: item.metadataFetchedAt || null,
        createdAt: now,
        updatedAt: now
      });
      savedCopies += copies.length;
      newIssues += 1;
    });
  } catch (error) {
    elements.scannerQueueMessage.textContent = error.message;
    elements.scannerQueueMessage.dataset.type = "error";
    return;
  }

  if (records.length === 0) {
    elements.scannerQueueMessage.textContent = "Alle vorgemerkten Ausgaben sind auf Überspringen gestellt.";
    elements.scannerQueueMessage.dataset.type = "info";
    return;
  }

  setScannerControlsBusy(true);
  try {
    await upsertArchiveEntries(records);
    await recordDataChange(Math.max(1, records.length));
    state.scannerQueueLookups.forEach((controller) => controller.abort());
    state.scannerQueueLookups.clear();
    state.scannerQueue = [];
    state.scannerSessionScans = 0;
    renderScannerQueue();
    await refreshCollection();
    await refreshArchiveCoreStatus({ showReport: false });

    const parts = [];
    if (newIssues) parts.push(`${newIssues} neue ${newIssues === 1 ? "Ausgabe" : "Ausgaben"}`);
    if (updatedIssues) parts.push(`${updatedIssues} ${updatedIssues === 1 ? "Ausgabe ergänzt" : "Ausgaben ergänzt"}`);
    const prefix = parts.join(" und ") || `${records.length} Ausgaben`;
    elements.scannerQueueMessage.textContent = `${prefix} · ${savedCopies} ${savedCopies === 1 ? "Exemplar" : "Exemplare"} gespeichert${skipped ? ` · ${skipped} übersprungen` : ""}.`;
    elements.scannerQueueMessage.dataset.type = "success";
    showToast(`${savedCopies} ${savedCopies === 1 ? "Exemplar" : "Exemplare"} aus Scanner Pro gespeichert.`);
  } catch (error) {
    console.error("Scanner-Warteschlange konnte nicht gespeichert werden:", error);
    elements.scannerQueueMessage.textContent = `Sammelspeicherung fehlgeschlagen: ${error.message}`;
    elements.scannerQueueMessage.dataset.type = "error";
  } finally {
    setScannerControlsBusy(false);
  }
}

function validateQueuedComic(item) {
  if (item.action === "skip") return;
  const drafts = getScannerQueueCopyDrafts(item);
  if (!drafts.length) throw new Error(`${item.series}, Band ${item.volumeNumber}: Mindestens ein Exemplar ist erforderlich.`);
  drafts.forEach((draft, index) => {
    if (!APP_CONFIG.conditions.some((entry) => entry.code === draft.condition)) {
      throw new Error(`${item.series}, Band ${item.volumeNumber}, Exemplar ${index + 1}: Ungültiger Zustand.`);
    }
    if (String(draft.notes || "").length > 1200) {
      throw new Error(`${item.series}, Band ${item.volumeNumber}, Exemplar ${index + 1}: Die Notiz ist zu lang.`);
    }
  });
  if (String(item.title || "").length > 200) {
    throw new Error(`${item.series}, Band ${item.volumeNumber}: Der Titel ist zu lang.`);
  }
  if (
    item.publicationYear !== null && item.publicationYear !== undefined && item.publicationYear !== "" &&
    (!Number.isInteger(Number(item.publicationYear)) || Number(item.publicationYear) < 1800 || Number(item.publicationYear) > APP_CONFIG.publicationYearMaximum)
  ) {
    throw new Error(`${item.series}, Band ${item.volumeNumber}: Ungültiges Erscheinungsjahr.`);
  }
}

function buildComicFromScanner() {
  const scan = state.scannerResult;
  const series = elements.scannerSeries.value;
  const title = elements.scannerResultName.value.trim();
  const yearRaw = elements.scannerResultYear.value.trim();
  const publicationYear = yearRaw ? Number(yearRaw) : null;

  if (!scan || !series || scan.series !== series) {
    throw new Error("Die Reihe wurde nach dem Scan geändert. Bitte scanne den Band erneut.");
  }
  if (title.length > 200) throw new Error("Der Titel darf höchstens 200 Zeichen enthalten.");
  if (
    publicationYear !== null &&
    (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > APP_CONFIG.publicationYearMaximum)
  ) {
    throw new Error(`Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`);
  }

  const copyDrafts = createScannerCopyDraftsFromControls();
  copyDrafts.forEach((draft, index) => {
    if (!APP_CONFIG.conditions.some((entry) => entry.code === draft.condition)) {
      throw new Error(`Bitte wähle für Exemplar ${index + 1} einen gültigen Zustand aus.`);
    }
  });
  const now = new Date().toISOString();

  return {
    id: createStableId(),
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    series,
    volumeNumber: String(scan.bandNumber),
    numericBandNumber: scan.bandNumber,
    title,
    publicationYear,
    copyDrafts,
    condition: copyDrafts[0].condition,
    duplicateCondition: copyDrafts[1]?.condition || null,
    isRead: copyDrafts[0].isRead,
    isDuplicate: copyDrafts.length > 1,
    isSealed: copyDrafts[0].isSealed,
    notes: copyDrafts[0].notes,
    duckipediaPageUrl: scan.pageUrl || createConfiguredDuckipediaUrl(series, scan.bandNumber, title),
    duckipediaCoverUrl: scan.coverUrl || "",
    duckipediaCoverFileName: scan.coverFileName || "",
    duckipediaCoverSource: scan.coverSource || "",
    duckipediaCoverLookupVersion: Number(scan.lookupVersion || 0),
    metadataStatus: scan.metadataStatus || "",
    metadataFetchedAt: scan.metadataFetchedAt || null,
    createdAt: now,
    updatedAt: now
  };
}

function createScannerCopyDraftsFromControls() {
  const primaryCondition = elements.scannerCondition.value || DEFAULT_CONDITION_CODE;
  const drafts = [{
    condition: primaryCondition,
    isRead: elements.scannerIsRead.checked,
    isSealed: elements.scannerIsSealed.checked,
    notes: ""
  }];
  if (elements.scannerIsDuplicate.checked) {
    drafts.push({
      condition: elements.scannerDuplicateCondition.value || primaryCondition,
      isRead: false,
      isSealed: false,
      notes: ""
    });
  }
  return drafts;
}


function handleScannerApplyToForm() {
  if (!state.scannerResult) {
    setScannerStatus("Scanne zuerst einen Band.", "error");
    return;
  }

  const scan = state.scannerResult;
  elements.series.value = scan.series;
  elements.volumeNumber.value = String(scan.bandNumber);
  elements.title.value = elements.scannerResultName.value.trim();
  elements.publicationYear.value = elements.scannerResultYear.value.trim();
  state.formMetadata = {
    series: scan.series,
    bandNumber: scan.bandNumber,
    found: scan.metadataStatus === "found",
    pageUrl: scan.pageUrl || createConfiguredDuckipediaUrl(scan.series, scan.bandNumber),
    coverUrl: scan.coverUrl || "",
    coverFileName: scan.coverFileName || "",
    coverSource: scan.coverSource || "",
    lookupVersion: Number(scan.lookupVersion || 0),
    fetchedAt: scan.metadataFetchedAt || null
  };
  if (!state.formHasLocalCover && state.formMetadata.coverUrl) {
    setFormCoverPreview(state.formMetadata.coverUrl, "Duckipedia-Vorschau", false);
  }
  elements.condition.value = elements.scannerCondition.value;
  elements.duplicateCondition.value = elements.scannerDuplicateCondition.value;
  elements.isRead.checked = elements.scannerIsRead.checked;
  elements.isDuplicate.checked = elements.scannerIsDuplicate.checked;
  elements.isSealed.checked = elements.scannerIsSealed.checked;
  updateDuplicateConditionVisibility();
  closeScannerModal();
  openAddPage();
  showFormMessage("Bandnummer und erkannte Duckipedia-Daten wurden übernommen. Bitte prüfe die Angaben und speichere den Comic.", "success");
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => elements.condition.focus({ preventScroll: true }), 350);
}

async function resetScannerForNext() {
  clearScannerResult();
  setScannerStatus("Bereit für einen neuen Scan.");
  await startScannerCamera();
}

function clearScannerResult() {
  abortScannerLookup();
  state.scannerResult = null;
  elements.scannerResult.classList.add("hidden");
  elements.scannerBandNumber.textContent = "";
  elements.scannerExtension.textContent = "";
  elements.scannerResultName.value = "";
  elements.scannerResultYear.value = "";
  elements.scannerExistingWarning.textContent = "";
  elements.scannerExistingWarning.classList.add("hidden");
  elements.scannerLookupStatus.textContent = "";
}

function updateScannerDuplicateConditionVisibility() {
  const isDuplicate = elements.scannerIsDuplicate.checked;
  elements.scannerDuplicateConditionField.classList.toggle("hidden", !isDuplicate);
  elements.scannerDuplicateCondition.disabled = !isDuplicate;

  if (isDuplicate && !elements.scannerDuplicateCondition.value) {
    elements.scannerDuplicateCondition.value = elements.scannerCondition.value || DEFAULT_CONDITION_CODE;
  }
}

function setScannerControlsBusy(isBusy) {
  [
    elements.scannerModeFast,
    elements.scannerModeReview,
    elements.scannerSeries,
    elements.scannerCondition,
    elements.scannerDuplicateCondition,
    elements.scannerIsRead,
    elements.scannerIsDuplicate,
    elements.scannerIsSealed,
    elements.scannerStart,
    elements.scannerStop,
    elements.scannerPhoto,
    elements.scannerManualCode,
    elements.scannerManualApply,
    elements.scannerResultName,
    elements.scannerResultYear,
    elements.scannerSave,
    elements.scannerApplyForm,
    elements.scannerRescan,
    elements.scannerApplyDefaults,
    elements.scannerSaveQueue,
    elements.scannerClearQueue,
    elements.closeScanner
  ].forEach((control) => {
    control.disabled = isBusy;
  });
  elements.scannerQueueList.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = isBusy;
  });

  if (!isBusy) {
    updateScannerDuplicateConditionVisibility();
    renderScannerQueue();
  }
}

function setScannerStatus(message, type = "info") {
  elements.scannerStatus.textContent = message;
  elements.scannerStatus.dataset.type = type;
}

