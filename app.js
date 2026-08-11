import {
  APP_CONFIG,
  DEFAULT_CONDITION_CODE,
  STANDARD_SERIES_DEFINITIONS,
  STANDARD_DUCKIPEDIA_PATTERNS,
  createDuckipediaUrl as buildDuckipediaUrl,
  createMetadataCacheKey,
  createMissingDetailKey,
  getAvailableSeries,
  getConditionDetails,
  getConditionLabel,
  normalizeConditionCode,
  normalizeDuckipediaPattern
} from "./config.js";
import {
  clearAllCoverMedia,
  clearMetadataCache,
  deleteArchiveEntry,
  deleteCoverMedia,
  getArchiveRuntimeCollection,
  getAllCoverMedia,
  getAllCoverMediaKeys,
  getAllMetadataCache,
  getAppSettings,
  getArchiveCoreStatus,
  getDataStackStatus,
  getLatestMigrationSnapshot,
  restoreLatestMigrationSnapshot,
  getCoverMedia,
  getCoverMediaStats,
  getMetadataCache,
  pruneMetadataCache,
  replaceArchiveEntriesFromLegacy,
  replaceAllCoverMedia,
  replaceMetadataCache,
  removeSeriesDefinition,
  saveSeriesDefinition,
  saveAppSettings,
  saveArchiveEntry,
  saveCoverMedia,
  saveMetadataCache,
  upsertArchiveEntries,
  upsertCoverMedia,
  upsertMetadataCache
} from "./storage.js";
import { calculateMissingBands, countMissingBands } from "./missing.js";
import { DUCKIPEDIA_LOOKUP_VERSION, lookupDuckipediaMetadata } from "./duckipedia.js";
import {
  CONDITION_ASSISTANT_DEFECT_GROUPS,
  CONDITION_ASSISTANT_IMPRESSIONS,
  buildConditionAssessmentNote,
  createConditionAssessment,
  evaluateConditionAssessment
} from "./condition-assistant.js";
import {
  BackupValidationError,
  createCollectionCsv,
  createDatedFilename,
  createJsonBackup,
  createMediaBackup,
  createMissingCsv,
  createMissingPdfBlob,
  mergeCollections,
  readAndValidateBackupFile,
  shareOrDownloadBlob,
  shareOrDownloadText
} from "./export.js";
import { dataUrlToBlob, prepareCoverImage } from "./media.js";
import { ensurePdfLibrary, getOptionalAssetStatus } from "./asset-loader.js";
import { recordDiagnosticError } from "./diagnostics.js";
import { createLazyDomManager } from "./lazy-dom.js";
import { createDiagnosticsUI } from "./diagnostics-ui.js";
import { createAppElements } from "./app-elements.js";
import { createInitialAppState, SMART_LIST_DEFINITIONS_LOOKUP } from "./app-state.js";
import {
  countPhysicalCopies,
  createCustomSeriesId,
  createEntityId,
  createIssueIdentityKey,
  getComicCopies,
  mergeFormValuesIntoCopies,
  normalizeCopy,
  normalizeSeriesLookup
} from "./archive-model.js";
import {
  getEntryCondition,
  getEntryCopies,
  getEntryCreatedAt,
  getEntryDuckipediaCoverFileName,
  getEntryDuckipediaCoverLookupVersion,
  getEntryDuckipediaCoverSource,
  getEntryDuckipediaCoverUrl,
  getEntryDuckipediaPageUrl,
  getEntryId,
  getEntryMetadataFetchedAt,
  getEntryMetadataStatus,
  getEntryNotes,
  getEntryNumericBandNumber,
  getEntryPublicationYear,
  getEntrySeriesId,
  getEntrySeriesName,
  getEntryTitle,
  getEntryUpdatedAt,
  getEntryVolumeNumber,
  isEntryRead,
  isEntrySealed,
  toLegacyComic,
} from "./archive-entry.js";
import { createShelfUI } from "./shelf-ui.js";
import { createCollectionFeature } from "./collection-feature.js";
import { createConditionBadge } from "./condition-ui.js";
import { createMissingFeature } from "./missing-feature.js";
import { createCalendarFeature } from "./calendar-feature.js";
import {
  QUALITY_BUCKETS,
  buildStatisticsDNA,
  formatMissingRun
} from "./statistics-dna.js";
import {
  WISHLIST_PRIORITIES,
  buildCollectorMission,
  buildMilestones,
  compareWishlistEntries,
  getWishlistPriorityDefinition,
  normalizeMilestoneIds,
  normalizeWishlistPriority
} from "./collector-goals.js";
import {
  buildShareCardPayload,
  canvasToPngBlob,
  renderShareCard
} from "./share-cards.js";

import {
  createStableId,
  formatBytes,
  formatDateTime,
  formatEntryCount,
  normalizeHttpUrl,
  normalizeSearchText,
  parseStrictPositiveInteger,
  toKebabCase
} from "./app-utils.js";

const THEME_STORAGE_KEY = "comicarchiv-theme";
const IS_TEST_MODE = new URLSearchParams(window.location.search).get("testmode") === "1";
const state = createInitialAppState();

const elements = createAppElements();

const lazyDom = createLazyDomManager(elements, {
  afterMount: {
    conditionAssistant: renderConditionAssistantOptions,
    diagnostics: configureTestMode
  }
});

function handleLazyModalClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== "function") return;

  if (target.closest("#close-share-card, [data-close-share-card]")) return closeShareCardModal();
  if (target.closest("#share-card-share")) return handleShareCardShare();

  if (target.closest("#close-diagnostics, [data-close-diagnostics]")) return diagnosticsUI.close();
  if (target.closest("#run-diagnostics")) return diagnosticsUI.run();
  if (target.closest("#export-diagnostics")) return diagnosticsUI.exportReport();
  if (target.closest("#clear-diagnostics")) return diagnosticsUI.clear();
  if (target.closest("#open-test-mode")) return toggleTestMode();
  if (target.closest("#open-recovery")) {
    diagnosticsUI.close();
    window.EntenarchivRecovery?.open({
      title: "Diagnose & sicherer Modus",
      summary: "Erstelle hier unabhängige Notfall-Backups oder repariere beschädigte Kalenderdaten."
    });
    return;
  }

  if (target.closest("#close-import, [data-close-import]")) return closeImportModal();
  if (target.closest("#import-submit")) return handleImportSubmit();

  if (target.closest("#close-condition-assistant, [data-close-condition-assistant]")) return closeConditionAssistant();
  if (target.closest("#condition-assistant-back")) return changeConditionAssistantStep(-1);
  if (target.closest("#condition-assistant-next")) return changeConditionAssistantStep(1);
  if (target.closest("#condition-assistant-apply")) return applyConditionAssistantRecommendation();
}

function handleLazyModalChange(event) {
  const target = event.target;
  if (!target) return;
  if (target.id === "share-card-template") return renderShareCardPreview();
  if (target.id === "import-file") return handleImportFileSelection();
  if (elements.conditionAssistantModal?.contains(target)) return handleConditionAssistantChange(event);
}

const diagnosticsUI = createDiagnosticsUI({
  state,
  elements,
  lazyDom,
  appConfig: APP_CONFIG,
  getOptionalAssetStatus,
  createAppFilename,
  restoreBodyModalState
});

let toastTimer;
let importInProgress = false;
let shelfUI;
const collectionFeature = createCollectionFeature({
  state,
  elements,
  getShelfUI: () => shelfUI,
  createConfiguredDuckipediaUrl,
  startEditing,
  openDuplicateModal,
  enrichSingleComic,
  confirmAndDelete,
  showToast
});
const missingFeature = createMissingFeature({
  state,
  elements,
  createConfiguredDuckipediaUrl,
  getMetadataForBand,
  saveMeaningfulSettings,
  renderStats,
  renderFleaMarketHubStatus,
  renderFleaMarket,
  restoreBodyModalState,
  refreshCollection,
  refreshArchiveCoreStatus,
  showToast
});
const calendarFeature = createCalendarFeature({
  state,
  elements,
  getShelfUI: () => shelfUI,
  refreshArchiveCoreStatus,
  createAppFilename,
  populateConfiguration,
  openAddPage,
  lookupFormMetadata,
  createConfiguredDuckipediaUrl,
  saveMeaningfulSettings,
  openCollectionPage,
  renderMissingHub,
  renderMissingBands,
  openMissingDetailModal,
  hasMissingDetailContent,
  renderFleaMarketHubStatus,
  renderSeriesProgress,
  renderStats,
  resetForm,
  renderCustomSeriesList,
  restoreBodyModalState,
  showFormMessage,
  showToast
});
let scannerFeature = null;
let scannerFeaturePromise = null;

async function ensureScannerFeature() {
  if (scannerFeature) return scannerFeature;
  if (!scannerFeaturePromise) {
    scannerFeaturePromise = import("./scanner-feature.js").then(({ createScannerFeature }) => {
      scannerFeature = createScannerFeature({
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
      });
      return scannerFeature;
    }).catch((error) => {
      scannerFeaturePromise = null;
      recordDiagnosticError(error, "Scanner-Feature laden", "error");
      throw error;
    });
  }
  return scannerFeaturePromise;
}

async function openScannerFeature() {
  try {
    const feature = await ensureScannerFeature();
    await feature.open();
  } catch (error) {
    showToast(`Scanner konnte nicht geladen werden: ${error.message}`, "error");
  }
}

initializeApp().catch((error) => {
  console.error(error);
  if (window.EntenarchivRecovery?.reportFatal) {
    window.EntenarchivRecovery.reportFatal(error, "App-Start");
  } else {
    recordDiagnosticError(error, "App-Start", "fatal");
  }
  showToast(`Entenarchiv konnte nicht gestartet werden: ${error.message}`, "error");
});

async function initializeApp() {
  applyStoredTheme();
  configureTestMode();
  bindEvents();
  shelfUI = createShelfUI({
    getSnapshot: () => ({
      comics: state.collectionEntries,
      missingGroups: state.missingGroups,
      settings: state.settings,
      localCoverIds: state.localCoverIds
    }),
    getCoverMedia,
    getAllCoverMediaKeys,
    onOpenCollection: (options = {}) => openCollectionPage(options.scope || "all", options),
    onOpenMissingDetail: (series, bandNumber) => openMissingDetailModal(series, bandNumber),
    onEditComic: startEditing,
    onManageCopies: openDuplicateModal,
    onEnrichComic: (comic) => enrichSingleComic(comic, { force: true }),
    onResolveCover: resolveShelfCoverUrl,
    onBulkSave: saveShelfBulkComics,
    onOpenProgress: openProgressForSeries,
    onToast: showToast
  });
  elements.appVersion.textContent = `v${APP_CONFIG.appVersion}`;

  try {
    state.settings = await getAppSettings();
    // Persist the normalized settings once so invalid legacy calendar values are repaired permanently.
    state.settings = await saveAppSettings(state.settings);
    applyTheme(state.settings.theme);
    elements.showCovers.checked = state.settings.showCovers !== false;
    elements.autoEnrich.checked = state.settings.duckipediaAutoEnrich !== false;
    state.scannerMode = state.settings.scannerMode === "review" ? "review" : "fast";
    state.releaseRadarFilter = RELEASE_RADAR_FILTERS.includes(state.settings.releaseRadarFilter)
      ? state.settings.releaseRadarFilter
      : "open";
    elements.releaseRadarBadgeEnabled.checked = state.settings.releaseRadarBadgeEnabled !== false;
    persistThemeLocally(state.settings.theme);
  } catch (error) {
    console.warn("Einstellungen konnten nicht geladen werden:", error);
    recordDiagnosticError(error, "Einstellungen laden", "warning");
  }

  renderConditionGuide();
  populateConfiguration();
  updateDuplicateConditionVisibility();
  resetCoverEditorState();
  await refreshCollection();
  await initializeReleaseRadarIfNeeded();
  renderReleaseRadarIndicators();
  await refreshArchiveCoreStatus();
  await refreshDataStackStatus();
  renderBackupStatus();
  await Promise.allSettled([
    runOptionalStartupTask("Speicherstatus", refreshStorageStatus),
    runOptionalStartupTask("Duckipedia-Cache", async () => {
      const result = await pruneMetadataCache();
      if (result.removed > 0) console.info(`${result.removed} veraltete Duckipedia-Cache-Einträge entfernt.`);
    }),
    runOptionalStartupTask("Medienstatus", refreshMediaStatus)
  ]);
  renderCalendarOverview();
  registerServiceWorker();
  window.EntenarchivRecovery?.markReady({
    appVersion: APP_CONFIG.appVersion,
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  });
}

async function runOptionalStartupTask(name, task) {
  try {
    await task();
  } catch (error) {
    console.warn(`${name} konnte beim Start nicht geladen werden:`, error);
    recordDiagnosticError(error, name, "warning");
  }
}

async function refreshArchiveCoreStatus({ showReport = true } = {}) {
  if (!elements.archiveCoreSummary) return null;

  try {
    const status = await getArchiveCoreStatus();
    state.archiveCoreStatus = status;

    if (status.ready) {
      const issues = Number(status.counts?.issues || status.report?.issueCount || 0);
      const copies = Number(status.counts?.copies || status.report?.copyCount || 0);
      const series = Number(status.counts?.series || status.report?.seriesCount || 0);
      elements.archiveCoreSummary.textContent = `${issues} Ausgaben · ${copies} Exemplare · ${series} Reihen`;
      elements.archiveCoreSummary.dataset.type = "success";
    } else {
      elements.archiveCoreSummary.textContent = "Legacy-Fallback aktiv";
      elements.archiveCoreSummary.dataset.type = "warning";
      if (status.error) recordDiagnosticError(new Error(status.error), "Archivkern", "warning");
    }

    const hasMigrationReport = Boolean(
      status.ready &&
      status.completedAt &&
      status.report &&
      Number(status.report.legacyComicCount || 0) > 0
    );
    elements.openArchiveMigration?.classList.toggle("hidden", !hasMigrationReport);

    const shouldShowReport = Boolean(
      showReport &&
      hasMigrationReport &&
      state.settings.archiveMigrationAcknowledgedAt !== status.completedAt
    );

    if (shouldShowReport) openArchiveMigrationModal(status);
    return status;
  } catch (error) {
    console.warn("Archivkern-Status konnte nicht geladen werden:", error);
    elements.archiveCoreSummary.textContent = "Status nicht verfügbar";
    elements.archiveCoreSummary.dataset.type = "warning";
    recordDiagnosticError(error, "Archivkern-Status", "warning");
    return null;
  }
}

async function refreshDataStackStatus() {
  if (!elements.dataStackSummary) return null;
  try {
    const status = await getDataStackStatus();
    state.dataStackStatus = status;
    if (
      status.ready
      && status.hasRollbackSnapshot
      && status.parity?.valid !== false
      && status.settingsSplit?.parity?.valid !== false
      && status.settingsCutover?.ready
      && status.settingsCutover?.integrity?.valid !== false
      && status.legacyStorage?.ready
    ) {
      const runtimeLabel = state.archiveRuntimeSource === "archive-graph" ? " · Archivgraph aktiv" : "";
      elements.dataStackSummary.textContent = `Bereit · Schema ${status.databaseVersion}${runtimeLabel} · Einstellungen getrennt aktiv · Legacy-Speicher leer`;
      elements.dataStackSummary.dataset.type = "success";
    } else if (status.ready) {
      elements.dataStackSummary.textContent = `Bereit · Schema ${status.databaseVersion}`;
      elements.dataStackSummary.dataset.type = "warning";
    } else {
      elements.dataStackSummary.textContent = "Vorbereitung nicht abgeschlossen";
      elements.dataStackSummary.dataset.type = "warning";
      if (status.error) recordDiagnosticError(new Error(status.error), "Data Stack v2", "warning");
    }
    return status;
  } catch (error) {
    console.warn("Data-Stack-Status konnte nicht geladen werden:", error);
    elements.dataStackSummary.textContent = "Status nicht verfügbar";
    elements.dataStackSummary.dataset.type = "warning";
    recordDiagnosticError(error, "Data Stack v2", "warning");
    return null;
  }
}

function openArchiveMigrationModal(status = state.archiveCoreStatus) {
  if (!elements.archiveMigrationModal || !status?.report) return;
  const report = status.report;
  const metrics = [
    ["Vorherige Einträge", report.legacyComicCount ?? 0],
    ["Ausgaben", report.issueCount ?? status.counts?.issues ?? 0],
    ["Physische Exemplare", report.copyCount ?? status.counts?.copies ?? 0],
    ["Verwendete Reihen", report.usedSeriesCount ?? 0]
  ];

  elements.archiveMigrationSummary.replaceChildren();
  const grid = document.createElement("div");
  grid.className = "archive-migration-metrics";
  metrics.forEach(([labelText, value]) => {
    const card = document.createElement("div");
    card.className = "archive-migration-metric";
    const valueElement = document.createElement("strong");
    valueElement.textContent = String(value);
    const label = document.createElement("span");
    label.textContent = labelText;
    card.append(valueElement, label);
    grid.append(card);
  });

  const explanation = document.createElement("p");
  explanation.className = "muted-copy";
  explanation.textContent = "Deine sichtbare Sammlung bleibt unverändert. Intern sind Reihen, Ausgaben und beliebig viele physische Exemplare jetzt getrennt und stabil miteinander verknüpft.";
  elements.archiveMigrationSummary.append(grid, explanation);

  if (
    Number(report.collapsedLegacyDuplicates || 0) > 0
    || Number(report.migratedDuplicateCopies || 0) > 0
    || Number(report.remappedCovers || 0) > 0
  ) {
    const mergeNote = document.createElement("p");
    mergeNote.className = "archive-migration-note";
    const parts = [];
    if (report.collapsedLegacyDuplicates) parts.push(`${report.collapsedLegacyDuplicates} doppelte Ausgaben zusammengeführt`);
    if (report.migratedDuplicateCopies) parts.push(`${report.migratedDuplicateCopies} zusätzliche Exemplare übernommen`);
    if (report.remappedCovers) parts.push(`${report.remappedCovers} Cover neu zugeordnet`);
    mergeNote.textContent = parts.join(" · ");
    elements.archiveMigrationSummary.append(mergeNote);
  }

  if (Array.isArray(status.warnings) && status.warnings.length > 0) {
    const details = document.createElement("details");
    details.className = "archive-migration-warnings";
    const summary = document.createElement("summary");
    summary.textContent = `${status.warnings.length} Hinweis${status.warnings.length === 1 ? "" : "e"} ansehen`;
    const list = document.createElement("ul");
    status.warnings.slice(0, 20).forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      list.append(item);
    });
    details.append(summary, list);
    elements.archiveMigrationSummary.append(details);
  }

  elements.archiveMigrationRestore.classList.toggle("hidden", !status.hasRollbackSnapshot);
  elements.archiveMigrationMessage.textContent = status.hasRollbackSnapshot
    ? "Vor der Umstellung wurde zusätzlich ein lokaler Rückfallstand angelegt."
    : "Die Umstellung wurde erfolgreich geprüft.";
  elements.archiveMigrationMessage.dataset.type = "success";
  elements.archiveMigrationModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.archiveMigrationConfirm?.focus(), 0);
}

async function acknowledgeArchiveMigration() {
  if (!elements.archiveMigrationModal || elements.archiveMigrationModal.classList.contains("hidden")) return;
  const completedAt = state.archiveCoreStatus?.completedAt;
  try {
    if (completedAt && state.settings.archiveMigrationAcknowledgedAt !== completedAt) {
      state.settings = await saveAppSettings({
        ...state.settings,
        archiveMigrationAcknowledgedAt: completedAt
      });
    }
  } catch (error) {
    console.warn("Migrationshinweis konnte nicht bestätigt werden:", error);
    recordDiagnosticError(error, "Migrationshinweis bestätigen", "warning");
  }
  elements.archiveMigrationModal.classList.add("hidden");
  restoreBodyModalState();
}

async function exportArchiveMigrationReport() {
  const status = state.archiveCoreStatus || await getArchiveCoreStatus();
  const snapshot = await getLatestMigrationSnapshot().catch(() => null);
  const report = {
    app: APP_CONFIG.displayName,
    appVersion: APP_CONFIG.appVersion,
    archiveModelVersion: status.archiveModelVersion,
    status: status.status,
    completedAt: status.completedAt,
    counts: status.counts,
    migration: status.report,
    rollbackSnapshot: snapshot ? { id: snapshot.id, createdAt: snapshot.createdAt, comicCount: snapshot.comics?.length || 0 } : null
  };

  elements.archiveMigrationExport.disabled = true;
  try {
    const result = await shareOrDownloadText({
      content: JSON.stringify(report, null, 2),
      filename: createAppFilename("Entenarchiv-Migrationsbericht", "json"),
      mimeType: "application/json;charset=utf-8",
      title: "Entenarchiv Migrationsbericht",
      text: "Technischer Bericht zur Umstellung auf den neuen Archivkern."
    });
    elements.archiveMigrationMessage.textContent = result.method === "share"
      ? "Migrationsbericht wurde an das Teilen-Menü übergeben."
      : result.method === "cancelled"
        ? "Teilen wurde abgebrochen."
        : "Migrationsbericht wurde heruntergeladen.";
    elements.archiveMigrationMessage.dataset.type = result.method === "cancelled" ? "info" : "success";
  } catch (error) {
    elements.archiveMigrationMessage.textContent = `Bericht konnte nicht exportiert werden: ${error.message}`;
    elements.archiveMigrationMessage.dataset.type = "error";
  } finally {
    elements.archiveMigrationExport.disabled = false;
  }
}

async function restoreArchiveMigrationSnapshot() {
  const confirmed = window.confirm(
    "Den lokalen Datenstand direkt vor der Umstellung wiederherstellen? Alle danach vorgenommenen Änderungen an der Sammlung gehen dabei verloren. Erstelle vorher ein aktuelles JSON-Backup."
  );
  if (!confirmed) return;

  elements.archiveMigrationRestore.disabled = true;
  elements.archiveMigrationConfirm.disabled = true;
  elements.archiveMigrationMessage.textContent = "Vorheriger Datenstand wird wiederhergestellt …";
  elements.archiveMigrationMessage.dataset.type = "info";

  try {
    const result = await restoreLatestMigrationSnapshot();
    state.settings = await getAppSettings();
    await refreshCollection();
    const status = await refreshArchiveCoreStatus({ showReport: false });
    if (status?.completedAt) {
      state.settings = await saveAppSettings({
        ...state.settings,
        archiveMigrationAcknowledgedAt: status.completedAt
      });
    }
    elements.archiveMigrationMessage.textContent = `${result.comics} frühere Einträge wurden wiederhergestellt.`;
    elements.archiveMigrationMessage.dataset.type = "success";
    window.setTimeout(() => {
      elements.archiveMigrationModal.classList.add("hidden");
      restoreBodyModalState();
      showToast("Der Datenstand vor der Umstellung wurde wiederhergestellt.", "success");
    }, 900);
  } catch (error) {
    elements.archiveMigrationMessage.textContent = `Wiederherstellung fehlgeschlagen: ${error.message}`;
    elements.archiveMigrationMessage.dataset.type = "error";
  } finally {
    elements.archiveMigrationRestore.disabled = false;
    elements.archiveMigrationConfirm.disabled = false;
  }
}

function configureTestMode() {
  if (elements.testModeBanner) {
    elements.testModeBanner.classList.toggle("hidden", !IS_TEST_MODE);
    elements.testModeBanner.setAttribute("aria-hidden", String(!IS_TEST_MODE));
  }
  if (elements.openTestMode) {
    elements.openTestMode.textContent = IS_TEST_MODE ? "Echte Sammlung öffnen" : "Separaten Testmodus öffnen";
  }
  document.documentElement.dataset.storageMode = IS_TEST_MODE ? "test" : "production";
}

function createAppFilename(prefix, extension) {
  return createDatedFilename(IS_TEST_MODE ? `${prefix}-TEST` : prefix, extension);
}

function toggleTestMode() {
  const url = new URL(window.location.href);
  if (IS_TEST_MODE) {
    url.searchParams.delete("testmode");
  } else {
    url.searchParams.set("testmode", "1");
  }
  url.searchParams.delete("apprefresh");
  window.location.assign(url.href);
}

function populateConfiguration() {
  const availableSeries = getAvailableSeries(state.settings, state.collectionEntries);
  const selectedSeries = elements.series.value;
  const selectedFilterSeries = elements.filterSeries.value;
  const selectedCondition = elements.condition.value || DEFAULT_CONDITION_CODE;
  const selectedDuplicateCondition = elements.duplicateCondition.value || selectedCondition;
  const selectedFilterCondition = elements.filterCondition.value;
  const selectedMissingCondition = elements.missingDetailCondition.value;
  const selectedScannerSeries = elements.scannerSeries.value || selectedSeries;
  const selectedScannerCondition = elements.scannerCondition.value || selectedCondition;
  const selectedScannerDuplicateCondition = elements.scannerDuplicateCondition.value || selectedDuplicateCondition;
  const selectedProgressSeries = elements.progressSeries.value || selectedSeries;
  const selectedFleaMarketCondition = elements.fleaMarketDefaultCondition.value || DEFAULT_CONDITION_CODE;

  elements.series.replaceChildren();
  elements.series.append(createOption("", "Reihe auswählen"));
  availableSeries.forEach((seriesName) => elements.series.append(createOption(seriesName, seriesName)));
  elements.series.value = availableSeries.includes(selectedSeries) ? selectedSeries : "";

  syncCollectionSeriesFilter(availableSeries, selectedFilterSeries);

  elements.progressSeries.replaceChildren();
  elements.progressSeries.append(createOption("", "Reihe auswählen"));
  availableSeries.forEach((seriesName) => elements.progressSeries.append(createOption(seriesName, seriesName)));
  elements.progressSeries.value = availableSeries.includes(selectedProgressSeries) ? selectedProgressSeries : "";
  syncProgressTargetInput();

  [elements.condition, elements.duplicateCondition].forEach((select) => {
    select.replaceChildren();
    APP_CONFIG.conditions.forEach((condition) => {
      select.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
    });
  });
  elements.condition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedCondition)
    ? selectedCondition
    : DEFAULT_CONDITION_CODE;
  elements.duplicateCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedDuplicateCondition)
    ? selectedDuplicateCondition
    : elements.condition.value;

  elements.filterCondition.replaceChildren();
  elements.filterCondition.append(createOption("all", "Alle Zustände"));
  APP_CONFIG.conditions.forEach((condition) => {
    elements.filterCondition.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
  });
  elements.filterCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedFilterCondition)
    ? selectedFilterCondition
    : "all";

  elements.scannerSeries.replaceChildren();
  elements.scannerSeries.append(createOption("", "Reihe auswählen"));
  availableSeries.forEach((seriesName) => elements.scannerSeries.append(createOption(seriesName, seriesName)));
  elements.scannerSeries.value = availableSeries.includes(selectedScannerSeries) ? selectedScannerSeries : "";

  [elements.scannerCondition, elements.scannerDuplicateCondition].forEach((select) => {
    select.replaceChildren();
    APP_CONFIG.conditions.forEach((condition) => {
      select.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
    });
  });
  elements.scannerCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedScannerCondition)
    ? selectedScannerCondition
    : DEFAULT_CONDITION_CODE;
  elements.scannerDuplicateCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedScannerDuplicateCondition)
    ? selectedScannerDuplicateCondition
    : elements.scannerCondition.value;

  elements.missingDetailCondition.replaceChildren();
  elements.missingDetailCondition.append(createOption("", "Nicht festgelegt"));
  APP_CONFIG.conditions.forEach((condition) => {
    elements.missingDetailCondition.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
  });
  elements.missingDetailCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedMissingCondition)
    ? selectedMissingCondition
    : "";

  [elements.fleaMarketDefaultCondition].forEach((select) => {
    select.replaceChildren();
    APP_CONFIG.conditions.forEach((condition) => {
      select.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
    });
  });
  elements.fleaMarketDefaultCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedFleaMarketCondition)
    ? selectedFleaMarketCondition
    : DEFAULT_CONDITION_CODE;
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function bindEvents() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.navAdd.addEventListener("click", openAddPage);
  elements.closeAddPage.addEventListener("click", closeAddPage);
  elements.navStatistics.addEventListener("click", openStatisticsPage);
  elements.closeStatistics.addEventListener("click", closeStatisticsPage);
  elements.dashboardStats.addEventListener("click", handleDashboardStatClick);
  elements.collectorMission.addEventListener("click", handleCollectorMissionClick);
  elements.openShareCard.addEventListener("click", openShareCardModal);
  document.addEventListener("click", handleLazyModalClick);
  document.addEventListener("change", handleLazyModalChange);
  elements.milestoneCelebrationClose.addEventListener("click", hideMilestoneCelebration);
  elements.coverFile.addEventListener("change", handleCoverFileSelection);
  elements.removeCover.addEventListener("click", handleRemoveCoverFromForm);
  elements.lookupMetadata.addEventListener("click", () => lookupFormMetadata({ force: true }));
  elements.series.addEventListener("change", scheduleFormMetadataLookup);
  elements.volumeNumber.addEventListener("input", scheduleFormMetadataLookup);
  elements.isDuplicate.addEventListener("change", updateDuplicateConditionVisibility);
  elements.cancelEdit.addEventListener("click", resetForm);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.backupReminderAction.addEventListener("click", handleJsonExport);
  elements.progressTargetForm.addEventListener("submit", handleProgressTargetSubmit);
  elements.progressSeries.addEventListener("change", syncProgressTargetInput);
  elements.progressRemove.addEventListener("click", handleRemoveProgressTarget);
  elements.openMainCollection.addEventListener("click", () => shelfUI?.openSeries("ltb-main", { returnTarget: "home" }));
  elements.openOtherCollection.addEventListener("click", () => shelfUI?.openLibrary("other"));
  elements.openMainMissing.addEventListener("click", () => openMissingPage("main"));
  elements.openOtherMissing.addEventListener("click", () => openMissingPage("other"));
  elements.openFleaMarket.addEventListener("click", openFleaMarketPage);
  elements.closeFleaMarket.addEventListener("click", closeFleaMarketPage);
  elements.fleaMarketSearch.addEventListener("input", renderFleaMarket);
  elements.fleaMarketScope.addEventListener("change", renderFleaMarket);
  elements.fleaMarketPriorityFilter.addEventListener("change", renderFleaMarket);
  elements.fleaMarketList.addEventListener("change", handleFleaMarketListChange);
  elements.fleaMarketApplyCondition.addEventListener("click", applyFleaMarketDefaultCondition);
  elements.fleaMarketSave.addEventListener("click", saveFleaMarketFinds);
  elements.fleaMarketClear.addEventListener("click", clearFleaMarketFinds);
  elements.openProgress.addEventListener("click", openProgressPage);
  elements.closeProgress.addEventListener("click", closeProgressPage);
  elements.openScanner.addEventListener("click", openScannerFeature);

  elements.exportJson.addEventListener("click", handleJsonExport);
  elements.exportCsv.addEventListener("click", handleCollectionCsvExport);
  elements.exportMissingCsv.addEventListener("click", handleMissingCsvExport);
  elements.exportMissingPdf.addEventListener("click", handleMissingPdfExport);
  elements.requestPersistence.addEventListener("click", handlePersistenceRequest);
  elements.openDiagnostics.addEventListener("click", diagnosticsUI.open);
  elements.openArchiveMigration?.addEventListener("click", () => openArchiveMigrationModal());
  elements.leaveTestMode?.addEventListener("click", toggleTestMode);
  elements.openMedia.addEventListener("click", openMediaPage);
  elements.closeMedia.addEventListener("click", closeMediaPage);
  elements.showCovers.addEventListener("change", handleShowCoversChange);
  elements.autoEnrich.addEventListener("change", handleAutoEnrichChange);
  elements.enrichAll.addEventListener("click", handleEnrichAll);
  elements.clearMetadataCache.addEventListener("click", handleClearMetadataCache);
  elements.exportMediaBackup.addEventListener("click", handleMediaBackupExport);
  elements.openMediaImport.addEventListener("click", openImportModal);
  elements.deleteAllCovers.addEventListener("click", handleDeleteAllCovers);
  elements.openImport.addEventListener("click", openImportModal);
  elements.openSeriesManager.addEventListener("click", openSeriesModal);
  elements.closeSeries.addEventListener("click", closeSeriesModal);
  elements.seriesForm.addEventListener("submit", handleSaveCustomSeries);
  elements.cancelCustomSeriesEdit.addEventListener("click", resetCustomSeriesForm);
  elements.customSeriesList.addEventListener("click", handleCustomSeriesAction);
  elements.seriesModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-series]")) closeSeriesModal();
  });
  elements.duplicateForm.addEventListener("submit", handleSaveCopyManager);
  elements.copyManagerAdd.addEventListener("click", addCopyManagerCopy);
  elements.copyManagerList.addEventListener("input", handleCopyManagerInput);
  elements.copyManagerList.addEventListener("change", handleCopyManagerInput);
  elements.copyManagerList.addEventListener("click", handleCopyManagerClick);
  elements.closeDuplicate.addEventListener("click", closeDuplicateModal);
  elements.duplicateModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-duplicate]")) closeDuplicateModal();
  });
  elements.closeArchiveMigration?.addEventListener("click", acknowledgeArchiveMigration);
  elements.archiveMigrationConfirm?.addEventListener("click", acknowledgeArchiveMigration);
  elements.archiveMigrationExport?.addEventListener("click", exportArchiveMigrationReport);
  elements.archiveMigrationRestore?.addEventListener("click", restoreArchiveMigrationSnapshot);
  elements.archiveMigrationModal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-archive-migration]")) acknowledgeArchiveMigration();
  });
  document.querySelectorAll("[data-open-condition-guide]").forEach((button) => {
    button.addEventListener("click", openConditionGuide);
  });
  document.addEventListener("click", handleConditionAssistantTrigger);
  elements.closeConditionGuide.addEventListener("click", closeConditionGuide);
  elements.conditionGuideModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-condition-guide]")) closeConditionGuide();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (elements.archiveMigrationModal && !elements.archiveMigrationModal.classList.contains("hidden")) return acknowledgeArchiveMigration();
    if (elements.conditionAssistantModal && !elements.conditionAssistantModal.classList.contains("hidden")) return closeConditionAssistant();
    if (!elements.conditionGuideModal.classList.contains("hidden")) return closeConditionGuide();
    if (elements.diagnosticsModal && !elements.diagnosticsModal.classList.contains("hidden")) return diagnosticsUI.close();
    if (elements.shareCardModal && !elements.shareCardModal.classList.contains("hidden")) return closeShareCardModal();
    if (elements.importModal && !elements.importModal.classList.contains("hidden")) return closeImportModal();
    if (!elements.releaseLinkModal.classList.contains("hidden")) return calendarFeature.closeReleaseLinkModal();
    if (!elements.seriesModal.classList.contains("hidden")) return closeSeriesModal();
    if (!elements.missingDetailModal.classList.contains("hidden")) return closeMissingDetailModal();
    if (!elements.duplicateModal.classList.contains("hidden")) return closeDuplicateModal();
    if (!elements.scannerModal.classList.contains("hidden")) return scannerFeature?.close();
    if (!elements.addPage.classList.contains("hidden")) return closeAddPage();
    if (!elements.statisticsPage.classList.contains("hidden")) return closeStatisticsPage();
    if (!elements.collectionPage.classList.contains("hidden")) return closeCollectionPage();
    if (!elements.missingPage.classList.contains("hidden")) return closeMissingPage();
    if (!elements.fleaMarketPage.classList.contains("hidden")) return closeFleaMarketPage();
    if (!elements.calendarEventModal.classList.contains("hidden")) return calendarFeature.closeEventModal();
    if (!elements.releaseRadarPage.classList.contains("hidden")) return closeReleaseRadarPage();
    if (!elements.calendarPage.classList.contains("hidden")) return closeCalendarPage();
    if (!elements.progressPage.classList.contains("hidden")) return closeProgressPage();
    if (!elements.mediaPage.classList.contains("hidden")) return closeMediaPage();
  });
}

function renderConditionGuide() {
  if (!elements.conditionGuideList) return;
  const selectedCode = normalizeConditionCode(elements.condition?.value, DEFAULT_CONDITION_CODE);
  elements.conditionGuideList.replaceChildren();

  APP_CONFIG.conditions.forEach((condition) => {
    const details = document.createElement("details");
    details.className = "condition-guide-item";
    details.open = condition.code === selectedCode;

    const summary = document.createElement("summary");
    const badge = createConditionBadge(condition.code, "Bewertung");
    badge.classList.add("condition-guide-badge");

    const heading = document.createElement("span");
    heading.className = "condition-guide-heading";
    const title = document.createElement("strong");
    title.textContent = `Zustand ${condition.code} – ${condition.label}`;
    const relation = document.createElement("small");
    relation.textContent = condition.priceRelation;
    heading.append(title, relation);
    summary.append(badge, heading);

    const description = document.createElement("p");
    description.textContent = condition.description;
    details.append(summary, description);
    elements.conditionGuideList.append(details);
  });
}

function openConditionGuide(event) {
  state.conditionGuideReturnTarget = event?.currentTarget || document.activeElement;
  renderConditionGuide();
  elements.conditionGuideModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.closeConditionGuide.focus(), 0);
}

function closeConditionGuide() {
  if (elements.conditionGuideModal.classList.contains("hidden")) return;
  elements.conditionGuideModal.classList.add("hidden");
  restoreBodyModalState();
  const target = state.conditionGuideReturnTarget;
  state.conditionGuideReturnTarget = null;
  if (target && typeof target.focus === "function") target.focus();
}

function renderConditionAssistantOptions() {
  if (!elements.conditionAssistantImpressions || !elements.conditionAssistantDefects) return;

  elements.conditionAssistantImpressions.replaceChildren();
  CONDITION_ASSISTANT_IMPRESSIONS.forEach((impression) => {
    const label = document.createElement("label");
    label.className = "assistant-choice assistant-impression-choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "assistant-impression";
    input.value = impression.id;

    const badge = createConditionBadge(impression.code, "Orientierungsstufe");
    badge.classList.add("assistant-choice-badge");

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = impression.label;
    const help = document.createElement("small");
    help.textContent = impression.help;
    copy.append(title, help);

    label.append(input, badge, copy);
    elements.conditionAssistantImpressions.append(label);
  });

  elements.conditionAssistantDefects.replaceChildren();
  CONDITION_ASSISTANT_DEFECT_GROUPS.forEach((group) => {
    const section = document.createElement("section");
    section.className = "assistant-defect-group";

    const heading = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = group.title;
    const description = document.createElement("p");
    description.textContent = group.description;
    heading.append(title, description);

    const list = document.createElement("div");
    list.className = "assistant-defect-list";
    group.defects.forEach((defect) => {
      const label = document.createElement("label");
      label.className = "assistant-defect-choice";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "assistant-defect";
      input.value = defect.id;

      const text = document.createElement("span");
      text.textContent = defect.label;
      const minimum = document.createElement("small");
      minimum.textContent = `mindestens Zustand ${defect.code}`;
      label.append(input, text, minimum);
      list.append(label);
    });

    section.append(heading, list);
    elements.conditionAssistantDefects.append(section);
  });
}

function handleConditionAssistantTrigger(event) {
  const button = event.target.closest("[data-open-condition-assistant]");
  if (!button) return;
  event.preventDefault();

  const queueId = button.dataset.assistantQueueId;
  if (queueId) {
    const item = state.scannerQueue.find((entry) => entry.queueId === queueId);
    if (!item) return;
    const copyIndex = Math.max(0, Number(button.dataset.assistantQueueCopyIndex || 0));
    const drafts = Array.isArray(item.copyDrafts) && item.copyDrafts.length
      ? item.copyDrafts
      : [{ condition: item.condition || DEFAULT_CONDITION_CODE, isRead: item.isRead === true, isSealed: item.isSealed === true, notes: item.notes || "" }];
    const copyDraft = drafts[copyIndex];
    if (!copyDraft) return;
    openConditionAssistant({
      currentCode: copyDraft.condition,
      label: `${item.series} · Band ${item.volumeNumber} · Exemplar ${copyIndex + 1}`,
      notesAvailable: true,
      returnTarget: button,
      apply: (code, note) => {
        copyDraft.condition = code;
        if (note) copyDraft.notes = appendConditionNote(copyDraft.notes, note);
        item.copyDrafts = drafts;
        scannerFeature?.syncQueueItem(item);
        scannerFeature?.renderQueue();
      }
    });
    return;
  }

  if (button.dataset.assistantCopyIndex !== undefined) {
    const index = Number(button.dataset.assistantCopyIndex);
    const copy = state.copyManagerDraft[index];
    if (!copy) return;
    openConditionAssistant({
      currentCode: copy.condition,
      label: `Exemplar ${index + 1}`,
      notesAvailable: true,
      returnTarget: button,
      apply: (code, note) => {
        copy.condition = code;
        if (note) copy.notes = appendConditionNote(copy.notes, note);
        renderCopyManager();
      }
    });
    return;
  }

  const select = document.getElementById(button.dataset.assistantTarget || "");
  if (!(select instanceof HTMLSelectElement)) return;
  const notes = document.getElementById(button.dataset.assistantNotes || "");
  const label = button.dataset.assistantLabel
    || select.closest(".field")?.querySelector("label, span")?.textContent?.replace(/\s+/g, " ").trim()
    || "Zustand";

  openConditionAssistant({
    currentCode: select.value,
    label,
    notesAvailable: notes instanceof HTMLTextAreaElement || notes instanceof HTMLInputElement,
    returnTarget: button,
    apply: (code, note) => {
      select.value = code;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      if (note && (notes instanceof HTMLTextAreaElement || notes instanceof HTMLInputElement)) {
        notes.value = appendConditionNote(notes.value, note);
        notes.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  });
}

function openConditionAssistant({ currentCode, label, apply, notesAvailable = false, returnTarget = null }) {
  lazyDom.ensure("conditionAssistant");
  const assessment = createConditionAssessment(currentCode);
  if (assessment.comicComplete !== false) assessment.comicComplete = true;
  assessment.coverComplete = true;

  state.conditionAssistantTarget = { apply, notesAvailable, returnTarget };
  state.conditionAssistantAssessment = assessment;
  state.conditionAssistantStep = 1;
  elements.conditionAssistantTargetLabel.textContent = label || "Aktuelles Exemplar";
  elements.conditionAssistantAddNote.checked = true;
  elements.conditionAssistantAddNote.closest("label")?.classList.toggle("hidden", !notesAvailable);
  syncConditionAssistantControls();
  renderConditionAssistantStep();
  elements.conditionAssistantModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.closeConditionAssistant.focus(), 0);
}

function closeConditionAssistant() {
  if (!elements.conditionAssistantModal || elements.conditionAssistantModal.classList.contains("hidden")) return;
  elements.conditionAssistantModal.classList.add("hidden");
  restoreBodyModalState();
  const target = state.conditionAssistantTarget?.returnTarget;
  state.conditionAssistantTarget = null;
  if (target && typeof target.focus === "function") target.focus();
}

function syncConditionAssistantControls() {
  const assessment = state.conditionAssistantAssessment;
  elements.conditionAssistantModal.querySelectorAll('input[name="assistant-comic-complete"]').forEach((input) => {
    input.checked = input.value === (assessment.comicComplete === false ? "no" : "yes");
  });
  elements.conditionAssistantModal.querySelectorAll('input[name="assistant-cover-complete"]').forEach((input) => {
    input.checked = input.value === (assessment.coverComplete === false ? "no" : "yes");
  });
  elements.conditionAssistantModal.querySelectorAll('input[name="assistant-impression"]').forEach((input) => {
    input.checked = input.value === assessment.impression;
  });
  elements.conditionAssistantModal.querySelectorAll('input[name="assistant-defect"]').forEach((input) => {
    input.checked = assessment.defects.includes(input.value);
  });
}

function handleConditionAssistantChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const assessment = state.conditionAssistantAssessment;
  if (input.name === "assistant-comic-complete") assessment.comicComplete = input.value === "yes";
  if (input.name === "assistant-cover-complete") assessment.coverComplete = input.value === "yes";
  if (input.name === "assistant-impression") assessment.impression = input.value;
  if (input.name === "assistant-defect") {
    assessment.defects = [...elements.conditionAssistantModal.querySelectorAll('input[name="assistant-defect"]:checked')]
      .map((entry) => entry.value);
  }
  if (state.conditionAssistantStep === 4) renderConditionAssistantResult();
}

function changeConditionAssistantStep(delta) {
  const current = state.conditionAssistantStep;
  if (delta > 0) {
    if (current === 1) {
      if (state.conditionAssistantAssessment.comicComplete === null || state.conditionAssistantAssessment.coverComplete === null) {
        showToast("Bitte bestätige Comicteil und Umschlag.", "error");
        return;
      }
      state.conditionAssistantStep = state.conditionAssistantAssessment.comicComplete === false ? 4 : 2;
    } else if (current === 2) {
      if (!state.conditionAssistantAssessment.impression) {
        showToast("Bitte wähle den Gesamteindruck aus.", "error");
        return;
      }
      state.conditionAssistantStep = 3;
    } else if (current === 3) {
      state.conditionAssistantStep = 4;
    }
  } else if (delta < 0) {
    state.conditionAssistantStep = current === 4 && state.conditionAssistantAssessment.comicComplete === false
      ? 1
      : Math.max(1, current - 1);
  }
  renderConditionAssistantStep();
}

function renderConditionAssistantStep() {
  const step = state.conditionAssistantStep;
  elements.conditionAssistantModal.querySelectorAll("[data-assistant-step]").forEach((section) => {
    section.classList.toggle("hidden", Number(section.dataset.assistantStep) !== step);
  });
  elements.conditionAssistantProgressFill.style.width = `${step * 25}%`;
  elements.conditionAssistantBack.classList.toggle("hidden", step === 1);
  elements.conditionAssistantNext.classList.toggle("hidden", step === 4);
  elements.conditionAssistantApply.classList.toggle("hidden", step !== 4);
  if (step === 4) renderConditionAssistantResult();
  elements.conditionAssistantModal.querySelector(".condition-assistant-body")?.scrollTo({ top: 0, behavior: "smooth" });
}

function renderConditionAssistantResult() {
  const result = evaluateConditionAssessment(state.conditionAssistantAssessment);
  elements.conditionAssistantResult.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "assistant-result-heading";
  const badge = result.code ? createConditionBadge(result.code, result.label) : document.createElement("span");
  if (!result.code) {
    badge.className = "assistant-result-empty-badge";
    badge.textContent = "?";
  }

  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = result.code ? `Zustand ${result.code} – ${result.label}` : result.label;
  const relation = document.createElement("small");
  relation.textContent = result.priceRelation || "Weitere Angaben erforderlich";
  copy.append(title, relation);

  const confidence = document.createElement("span");
  confidence.className = `assistant-confidence is-${result.confidence}`;
  confidence.textContent = result.confidence === "high"
    ? "Klare Orientierung"
    : result.confidence === "medium"
      ? "Individuell prüfen"
      : "Angaben ergänzen";
  heading.append(badge, copy, confidence);
  elements.conditionAssistantResult.append(heading);

  if (result.description) {
    const description = document.createElement("p");
    description.className = "assistant-result-description";
    description.textContent = result.description;
    elements.conditionAssistantResult.append(description);
  }

  if (result.reasons.length) {
    const list = document.createElement("ul");
    list.className = "assistant-result-reasons";
    result.reasons.forEach((reason) => {
      const item = document.createElement("li");
      item.textContent = reason;
      list.append(item);
    });
    elements.conditionAssistantResult.append(list);
  }

  result.warnings.forEach((warning) => {
    const note = document.createElement("p");
    note.className = "assistant-result-warning";
    note.textContent = warning;
    elements.conditionAssistantResult.append(note);
  });
  elements.conditionAssistantApply.disabled = !result.code;
}

function applyConditionAssistantRecommendation() {
  const result = evaluateConditionAssessment(state.conditionAssistantAssessment);
  if (!result.code || !state.conditionAssistantTarget?.apply) {
    showToast("Die Angaben reichen noch nicht für eine Empfehlung.", "error");
    return;
  }
  const note = elements.conditionAssistantAddNote.checked && state.conditionAssistantTarget.notesAvailable
    ? buildConditionAssessmentNote(state.conditionAssistantAssessment)
    : "";
  state.conditionAssistantTarget.apply(result.code, note);
  closeConditionAssistant();
  showToast(`Zustand ${result.code} wurde übernommen.`, "success");
}

function appendConditionNote(currentValue, note) {
  const current = String(currentValue || "").trim();
  const addition = String(note || "").trim();
  if (!addition || current.includes(addition)) return current;
  return current ? `${current}\n${addition}` : addition;
}

function openAddPage() {
  elements.addPage.classList.remove("hidden");
  elements.addPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.addPage.scrollTop = 0;
  window.setTimeout(() => {
    const target = state.editingId ? elements.series : elements.closeAddPage;
    target.focus({ preventScroll: true });
  }, 0);
}

function closeAddPage({ returnFocus = true } = {}) {
  elements.addPage.classList.add("hidden");
  elements.addPage.setAttribute("aria-hidden", "true");
  const anotherPageOpen = [...document.querySelectorAll(".app-page")]
    .some((page) => !page.classList.contains("hidden"));
  document.body.classList.toggle("app-page-open", anotherPageOpen);
  if (returnFocus) window.setTimeout(() => elements.navAdd.focus({ preventScroll: true }), 0);
}

function openStatisticsPage() {
  elements.statisticsPage.classList.remove("hidden");
  renderStats();
  elements.statisticsPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.statisticsPage.scrollTop = 0;
  window.setTimeout(() => elements.closeStatistics.focus({ preventScroll: true }), 0);
}

function closeStatisticsPage({ returnFocus = true } = {}) {
  elements.statisticsPage.classList.add("hidden");
  elements.statisticsPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  if (returnFocus) window.setTimeout(() => elements.navStatistics.focus({ preventScroll: true }), 0);
}

function handleDashboardStatClick(event) {
  const card = event.target.closest("button[data-dashboard-action]");
  if (!card) return;
  const action = card.dataset.dashboardAction;
  if (action === "missing") {
    openMissingPage("all");
    return;
  }
  if (action === "series") {
    shelfUI?.openLibrary("all");
    return;
  }
  const presets = {
    read: { read: "read" },
    unread: { read: "unread" },
    sealed: { sealed: true },
    duplicate: { duplicate: true }
  };
  openCollectionPage("all", presets[action] || {});
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearValidationErrors();
  setFormBusy(true);

  try {
    const action = event.submitter?.dataset.action || "save";
    const wasEditing = Boolean(state.editingId);
    const formComic = buildComicFromForm();
    let comicToSave = formComic;
    let addedToExisting = false;

    if (!wasEditing) {
      const existing = findComicBySeriesAndVolume(formComic.series, formComic.volumeNumber);
      if (existing) {
        const confirmed = window.confirm(
          `${getEntrySeriesName(existing)}, Band ${getEntryVolumeNumber(existing)} ist bereits vorhanden. ` +
          `Die neue Eingabe wird als weiteres physisches Exemplar gespeichert, ohne einen doppelten Bandeintrag anzulegen. Fortfahren?`
        );
        if (!confirmed) return;
        comicToSave = appendFormCopiesToExistingComic(existing, formComic);
        addedToExisting = true;
      }
    }

    const savedComic = await saveArchiveEntry(comicToSave);
    const coverChanged = await commitCoverChanges(savedComic.id);
    await recordDataChange(1);
    if (coverChanged) await recordMediaChange(1);
    await refreshCollection();
    await refreshArchiveCoreStatus();
    if (coverChanged) await refreshMediaStatus();

    if (action === "save-next" && !wasEditing) {
      prepareNextComic(formComic);
      showToast(addedToExisting
        ? "Weiteres Exemplar gespeichert. Der nächste Band ist vorbereitet."
        : "Comic gespeichert. Der nächste Band ist vorbereitet.");
    } else {
      resetForm();
      showToast(addedToExisting
        ? "Weiteres Exemplar ohne Dubletten-Eintrag gespeichert."
        : wasEditing ? "Änderungen gespeichert." : "Comic gespeichert.");
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      showFormMessage("Bitte prüfe die markierten Eingaben.", "error");
    } else {
      console.error(error);
      showFormMessage(`Speichern fehlgeschlagen: ${error.message}`, "error");
    }
  } finally {
    setFormBusy(false);
  }
}

function findComicBySeriesAndVolume(series, volumeNumber) {
  const seriesId = resolveConfiguredSeriesId(series);
  const identityKey = seriesId ? createIssueIdentityKey(seriesId, volumeNumber) : "";
  const seriesKey = normalizeSeriesLookup(series);
  const rawVolume = String(volumeNumber || "").trim().normalize("NFC");
  const volumeKey = /^[0-9]+$/.test(rawVolume) && Number(rawVolume) > 0 ? String(Number(rawVolume)) : rawVolume;

  return state.collectionEntries.find((comic) => {
    const comicSeriesId = getEntrySeriesId(comic) || resolveConfiguredSeriesId(getEntrySeriesName(comic));
    if (identityKey && comicSeriesId) {
      return createIssueIdentityKey(comicSeriesId, getEntryVolumeNumber(comic)) === identityKey;
    }
    const comicRawVolume = String(getEntryVolumeNumber(comic) || "").trim().normalize("NFC");
    const comicVolumeKey = /^[0-9]+$/.test(comicRawVolume) && Number(comicRawVolume) > 0
      ? String(Number(comicRawVolume))
      : comicRawVolume;
    return normalizeSeriesLookup(getEntrySeriesName(comic)) === seriesKey && comicVolumeKey === volumeKey;
  }) || null;
}

function resolveConfiguredSeriesId(seriesName) {
  const lookup = normalizeSeriesLookup(seriesName);
  if (!lookup) return null;
  const custom = (state.settings.customSeriesConfigs || []).find((entry) => {
    if (normalizeSeriesLookup(entry?.name) === lookup) return true;
    return Array.isArray(entry?.aliases) && entry.aliases.some((alias) => normalizeSeriesLookup(alias) === lookup);
  });
  if (custom?.id) return custom.id;
  const standard = STANDARD_SERIES_DEFINITIONS.find((entry) => (
    normalizeSeriesLookup(entry.name) === lookup
    || entry.aliases.some((alias) => normalizeSeriesLookup(alias) === lookup)
  ));
  return standard?.id || null;
}

function appendFormCopiesToExistingComic(existing, formComic) {
  const now = new Date().toISOString();
  const existingView = toLegacyComic(existing);
  const existingCopies = getEntryCopies(existing);
  const incomingCopies = getComicCopies(formComic).map((copy, index) => normalizeCopy({
    ...copy,
    id: createEntityId("copy"),
    issueId: getEntryId(existing),
    displayOrder: existingCopies.length + index + 1,
    source: "manual-additional",
    createdAt: now,
    updatedAt: now
  }, { issueId: getEntryId(existing), position: existingCopies.length + index + 1, now }));
  const copies = [...existingCopies, ...incomingCopies].map((copy, index) => ({
    ...copy,
    issueId: getEntryId(existing),
    displayOrder: index + 1
  }));
  const primary = copies[0];
  const secondary = copies[1] || null;

  return {
    ...existingView,
    seriesId: existingView.seriesId || formComic.seriesId || null,
    title: existingView.title || formComic.title || "",
    publicationYear: existingView.publicationYear || formComic.publicationYear || null,
    duckipediaPageUrl: existingView.duckipediaPageUrl || formComic.duckipediaPageUrl || "",
    duckipediaCoverUrl: existingView.duckipediaCoverUrl || formComic.duckipediaCoverUrl || "",
    metadataStatus: existingView.metadataStatus || formComic.metadataStatus || "",
    metadataFetchedAt: existingView.metadataFetchedAt || formComic.metadataFetchedAt || null,
    copies,
    copyCount: copies.length,
    condition: primary.condition,
    duplicateCondition: secondary?.condition || null,
    isRead: primary.isRead,
    isSealed: primary.isSealed,
    isDuplicate: copies.length > 1,
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    updatedAt: now
  };
}

function buildComicFromForm() {
  const series = elements.series.value.trim();
  const volumeNumber = elements.volumeNumber.value.trim();
  const title = elements.title.value.trim();
  const publicationYearRaw = elements.publicationYear.value.trim();
  const condition = elements.condition.value;
  const duplicateCondition = elements.isDuplicate.checked ? elements.duplicateCondition.value : null;
  const notes = elements.notes.value.trim();
  const errors = {};
  const availableSeries = getAvailableSeries(state.settings, state.collectionEntries);

  if (!availableSeries.includes(series)) {
    errors.series = "Bitte wähle eine gültige Reihe aus.";
  }

  if (!volumeNumber) {
    errors.volumeNumber = "Bitte gib eine Bandnummer ein.";
  } else if (volumeNumber.length > 30) {
    errors.volumeNumber = "Die Bandnummer darf höchstens 30 Zeichen enthalten.";
  } else if (/^\d+$/.test(volumeNumber)) {
    const numericValue = Number(volumeNumber);

    if (!Number.isSafeInteger(numericValue) || numericValue < 1 || numericValue > 99999) {
      errors.volumeNumber = "Eine numerische Bandnummer muss zwischen 1 und 99.999 liegen.";
    }
  }

  let publicationYear = null;

  if (publicationYearRaw) {
    publicationYear = Number(publicationYearRaw);
    const maximumYear = APP_CONFIG.publicationYearMaximum;

    if (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > maximumYear) {
      errors.publicationYear = `Bitte gib ein Jahr zwischen 1800 und ${maximumYear} ein.`;
    }
  }

  if (title.length > 200) {
    errors.title = "Der Titel darf höchstens 200 Zeichen enthalten.";
  }

  if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
    errors.condition = "Bitte wähle einen gültigen Zustand aus.";
  }

  if (elements.isDuplicate.checked && !APP_CONFIG.conditions.some((entry) => entry.code === duplicateCondition)) {
    errors.duplicateCondition = "Bitte wähle den Zustand des zweiten Exemplars aus.";
  }

  if (notes.length > 2000) {
    errors.notes = "Die Notizen dürfen höchstens 2.000 Zeichen enthalten.";
  }

  if (Object.keys(errors).length > 0) {
    renderValidationErrors(errors);
    const validationError = new Error("Formular enthält ungültige Eingaben.");
    validationError.name = "ValidationError";
    throw validationError;
  }

  const now = new Date().toISOString();
  const numericBandNumber = parseStrictPositiveInteger(volumeNumber);
  const editingMetadataApplies = Boolean(
    state.editingComic &&
    state.editingComic.series === series &&
    state.editingComic.volumeNumber === volumeNumber
  );
  const formMetadataApplies = Boolean(
    state.formMetadata &&
    state.formMetadata.series === series &&
    Number(state.formMetadata.bandNumber) === numericBandNumber
  );
  const metadata = formMetadataApplies ? state.formMetadata : null;

  const comic = {
    id: state.editingId || createStableId(),
    seriesId: state.editingComic?.series === series
      ? (state.editingComic?.seriesId || resolveConfiguredSeriesId(series))
      : resolveConfiguredSeriesId(series),
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    series,
    volumeNumber,
    numericBandNumber,
    title,
    publicationYear,
    condition,
    duplicateCondition,
    isRead: elements.isRead.checked,
    isDuplicate: elements.isDuplicate.checked,
    isSealed: elements.isSealed.checked,
    notes,
    duckipediaPageUrl: metadata?.pageUrl || (editingMetadataApplies ? state.editingComic?.duckipediaPageUrl : "") || "",
    duckipediaCoverUrl: metadata?.coverUrl || (editingMetadataApplies ? state.editingComic?.duckipediaCoverUrl : "") || "",
    duckipediaCoverFileName: metadata?.coverFileName || (editingMetadataApplies ? state.editingComic?.duckipediaCoverFileName : "") || "",
    duckipediaCoverSource: metadata?.coverSource || (editingMetadataApplies ? state.editingComic?.duckipediaCoverSource : "") || "",
    duckipediaCoverLookupVersion: Number(metadata?.lookupVersion || (editingMetadataApplies ? state.editingComic?.duckipediaCoverLookupVersion : 0) || 0),
    metadataStatus: metadata?.found === true
      ? "found"
      : metadata?.found === false
        ? "not-found"
        : (editingMetadataApplies ? state.editingComic?.metadataStatus : "") || "",
    metadataFetchedAt: metadata?.fetchedAt || (editingMetadataApplies ? state.editingComic?.metadataFetchedAt : null) || null,
    createdAt: state.editingComic?.createdAt || now,
    updatedAt: now
  };
  comic.copies = mergeFormValuesIntoCopies(state.editingComic, comic);
  comic.copyCount = comic.copies.length;
  return comic;
}

async function commitCoverChanges(comicId) {
  let changed = false;

  if (state.removeCoverRequested) {
    await deleteCoverMedia(comicId);
    changed = true;
  }

  if (state.pendingCover) {
    await saveCoverMedia({
      comicId,
      ...state.pendingCover,
      source: "user",
      updatedAt: new Date().toISOString()
    });
    changed = true;
  }

  return changed;
}

async function recordMediaChange(changeAmount = 1) {
  try {
    const current = Number.isSafeInteger(state.settings.mediaChangesSinceBackup)
      ? state.settings.mediaChangesSinceBackup
      : 0;
    state.settings = await saveAppSettings({
      ...state.settings,
      mediaChangesSinceBackup: Math.min(999999, current + Math.max(0, changeAmount))
    });
    renderBackupStatus();
  } catch (error) {
    console.warn("Der Medien-Änderungszähler konnte nicht aktualisiert werden:", error);
  }
}



async function handleCoverFileSelection() {
  const file = elements.coverFile.files?.[0];
  elements.coverFile.value = "";
  if (!file) return;

  elements.coverStatus.textContent = "Cover wird komprimiert …";
  elements.coverStatus.dataset.type = "info";
  elements.coverFile.disabled = true;

  try {
    const prepared = await prepareCoverImage(file);
    state.pendingCover = prepared;
    state.removeCoverRequested = false;
    state.formHasLocalCover = true;
    const objectUrl = URL.createObjectURL(prepared.blob);
    setFormCoverPreview(objectUrl, `Eigenes Cover vorbereitet · ${formatBytes(prepared.size)}`, true);
  } catch (error) {
    console.error("Cover konnte nicht verarbeitet werden:", error);
    elements.coverStatus.textContent = error.message;
    elements.coverStatus.dataset.type = "error";
  } finally {
    elements.coverFile.disabled = false;
  }
}

function handleRemoveCoverFromForm() {
  const hadLocalCover = state.formHasLocalCover || Boolean(state.pendingCover);
  state.pendingCover = null;
  state.formHasLocalCover = false;
  state.removeCoverRequested = hadLocalCover && Boolean(state.editingId);

  if (state.formMetadata?.coverUrl || state.editingComic?.duckipediaCoverUrl) {
    setFormCoverPreview(
      state.formMetadata?.coverUrl || state.editingComic?.duckipediaCoverUrl,
      state.removeCoverRequested ? "Eigenes Cover wird beim Speichern entfernt. Duckipedia-Vorschau bleibt sichtbar." : "Duckipedia-Vorschau",
      false
    );
  } else {
    clearFormCoverPreview(state.removeCoverRequested ? "Eigenes Cover wird beim Speichern entfernt." : "Kein Cover ausgewählt.");
  }
}

function resetCoverEditorState() {
  state.pendingCover = null;
  state.removeCoverRequested = false;
  state.formHasLocalCover = false;
  state.formMetadata = null;
  clearFormCoverPreview("");
  elements.coverFile.value = "";
  elements.metadataStatus.textContent = "";
  elements.metadataStatus.dataset.type = "info";
}

function setFormCoverPreview(source, message = "", isLocal = false) {
  revokeFormCoverObjectUrl();
  if (isLocal && source.startsWith("blob:")) state.formCoverObjectUrl = source;
  elements.formCoverPreview.src = source;
  elements.formCoverPreview.classList.remove("hidden");
  elements.formCoverPlaceholder.classList.add("hidden");
  elements.removeCover.classList.toggle("hidden", !isLocal);
  elements.coverStatus.textContent = message;
  elements.coverStatus.dataset.type = "info";
}

function clearFormCoverPreview(message = "") {
  revokeFormCoverObjectUrl();
  elements.formCoverPreview.removeAttribute("src");
  elements.formCoverPreview.classList.add("hidden");
  elements.formCoverPlaceholder.classList.remove("hidden");
  elements.removeCover.classList.add("hidden");
  elements.coverStatus.textContent = message;
  elements.coverStatus.dataset.type = "info";
}

function revokeFormCoverObjectUrl() {
  if (state.formCoverObjectUrl) {
    URL.revokeObjectURL(state.formCoverObjectUrl);
    state.formCoverObjectUrl = null;
  }
}

async function loadExistingCoverIntoForm(comic) {
  state.pendingCover = null;
  state.removeCoverRequested = false;
  state.formHasLocalCover = false;
  clearFormCoverPreview("");

  try {
    const cover = await getCoverMedia(getEntryId(comic));
    if (state.editingId !== getEntryId(comic)) return;

    if (cover?.blob instanceof Blob) {
      state.formHasLocalCover = true;
      const objectUrl = URL.createObjectURL(cover.blob);
      setFormCoverPreview(objectUrl, `Eigenes Cover · ${formatBytes(cover.size || cover.blob.size)}`, true);
      return;
    }

    if (getEntryDuckipediaCoverUrl(comic)) {
      setFormCoverPreview(getEntryDuckipediaCoverUrl(comic), "Duckipedia-Vorschau · nicht lokal gespeichert", false);
    }
  } catch (error) {
    console.warn("Cover konnte nicht geladen werden:", error);
    elements.coverStatus.textContent = "Das gespeicherte Cover konnte nicht geladen werden.";
    elements.coverStatus.dataset.type = "error";
  }
}

function scheduleFormMetadataLookup() {
  window.clearTimeout(state.metadataLookupTimer);
  state.formMetadata = null;
  const bandNumber = parseStrictPositiveInteger(elements.volumeNumber.value.trim());
  const series = elements.series.value.trim();

  if (!state.settings.duckipediaAutoEnrich || !series || !bandNumber) {
    elements.metadataStatus.textContent = "";
    return;
  }

  state.metadataLookupTimer = window.setTimeout(() => lookupFormMetadata({ force: false }), 650);
}

async function lookupFormMetadata({ force = false } = {}) {
  const series = elements.series.value.trim();
  const bandNumber = parseStrictPositiveInteger(elements.volumeNumber.value.trim());

  if (!series || !bandNumber) {
    elements.metadataStatus.textContent = "Bitte wähle eine Reihe und eine rein numerische Bandnummer.";
    elements.metadataStatus.dataset.type = "error";
    return null;
  }

  elements.lookupMetadata.disabled = true;
  elements.metadataStatus.textContent = force ? "Duckipedia wird aktualisiert …" : "Duckipedia-Daten werden geprüft …";
  elements.metadataStatus.dataset.type = "info";

  try {
    const result = await getMetadataForBand(series, bandNumber, { force });
    state.formMetadata = { ...result, series, bandNumber };

    if (result.found) {
      if (!elements.title.value.trim() && result.title) elements.title.value = result.title;
      if (!elements.publicationYear.value.trim() && result.publicationYear) {
        elements.publicationYear.value = String(result.publicationYear);
      }
      if (!state.formHasLocalCover && result.coverUrl) {
        setFormCoverPreview(result.coverUrl, result.fromCache ? "Duckipedia-Vorschau aus dem lokalen Cache" : "Duckipedia-Vorschau", false);
      }
      const parts = [result.title ? "Titel" : "", result.publicationYear ? "Jahr" : "", result.coverUrl ? "Cover" : ""].filter(Boolean);
      elements.metadataStatus.textContent = parts.length
        ? `${parts.join(", ")} ${result.fromCache ? "aus dem lokalen Cache geladen" : "aus Duckipedia ergänzt"}.`
        : "Die Bandseite wurde gefunden, enthielt aber keine automatisch nutzbaren Zusatzdaten.";
      elements.metadataStatus.dataset.type = "success";
    } else {
      elements.metadataStatus.textContent = result.reason || "Keine passenden Duckipedia-Daten gefunden.";
      elements.metadataStatus.dataset.type = "info";
    }

    await refreshMediaStatus();
    return result;
  } catch (error) {
    console.error("Duckipedia-Anreicherung fehlgeschlagen:", error);
    elements.metadataStatus.textContent = `Duckipedia-Daten konnten nicht geladen werden: ${error.message}`;
    elements.metadataStatus.dataset.type = "error";
    return null;
  } finally {
    elements.lookupMetadata.disabled = false;
  }
}

async function getMetadataForBand(series, bandNumber, { force = false, signal } = {}) {
  const key = createMetadataCacheKey(series, bandNumber);
  const cached = await getMetadataCache(key);

  const cachedLookupVersion = Number(cached?.lookupVersion || 0);
  if (!force && cached && isMetadataFresh(cached) && cachedLookupVersion >= DUCKIPEDIA_LOOKUP_VERSION) {
    return { ...cached, fromCache: true };
  }

  if (!navigator.onLine) {
    if (cached) return { ...cached, fromCache: true };
    return {
      key, series, bandNumber, found: false, title: "", publicationYear: null, pageUrl: createConfiguredDuckipediaUrl(series, bandNumber),
      coverUrl: "", fetchedAt: new Date().toISOString(), reason: "Offline: Für diesen Band liegen noch keine Metadaten im lokalen Cache vor.", fromCache: false
    };
  }

  const result = await lookupDuckipediaMetadata(series, bandNumber, { signal, settings: state.settings });
  if (signal?.aborted) return { ...result, key, series, bandNumber, fromCache: false };
  const record = {
    key,
    series,
    bandNumber,
    found: Boolean(result.found),
    title: result.title || "",
    publicationYear: result.publicationYear || null,
    pageUrl: result.pageUrl || createConfiguredDuckipediaUrl(series, bandNumber),
    coverUrl: result.coverUrl || "",
    coverFileName: result.coverFileName || "",
    coverSource: result.coverSource || "",
    lookupVersion: Number(result.lookupVersion || DUCKIPEDIA_LOOKUP_VERSION),
    reason: result.reason || "",
    fetchedAt: result.fetchedAt || new Date().toISOString()
  };
  await saveMetadataCache(record);
  return { ...record, fromCache: false };
}

function isMetadataFresh(record) {
  const fetchedAt = Date.parse(record?.fetchedAt || record?.metadataFetchedAt);
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < APP_CONFIG.metadataCacheMaximumAgeDays * 86400000;
}


function createConfiguredDuckipediaUrl(series, volumeNumber, title = "") {
  return buildDuckipediaUrl(series, volumeNumber, title, state.settings);
}


async function refreshCollection() {
  try {
    const [runtime, coverKeys] = await Promise.all([
      getArchiveRuntimeCollection(),
      getAllCoverMediaKeys().catch((error) => {
        console.warn("Cover-IDs konnten nicht geladen werden:", error);
        return [];
      })
    ]);
    state.localCoverIds = new Set(coverKeys);
    state.archiveGraph = {
      series: runtime.series,
      issues: runtime.issues,
      copies: runtime.copies
    };
    state.archiveRuntimeSource = runtime.source || "archive-graph";
    state.collectionEntries = runtime.entries;

    populateConfiguration();
    state.missingGroups = calculateMissingBands(
      state.collectionEntries,
      state.settings.knownHighestBandBySeries
    );
    renderCollectionHub();
    renderMissingHub();
    shelfUI?.refresh({ comics: state.collectionEntries, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
    if (!elements.collectionPage.classList.contains("hidden")) renderCollection();
    renderStats();
    if (!elements.missingPage.classList.contains("hidden")) renderMissingBands();
    renderFleaMarketHubStatus();
    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
    if (!elements.progressPage.classList.contains("hidden")) renderSeriesProgress();
    renderBackupStatus();
    renderCalendarOverview();
    if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
  } catch (error) {
    state.archiveRuntimeSource = "error";
    console.error(error);
    recordDiagnosticError(error, "Archive Runtime", "error");
    showFormMessage(`Lokale Daten konnten nicht aus dem Archivgraph geladen werden: ${error.message}`, "error");
  }
}

async function saveMeaningfulSettings(patch, changeAmount = 1) {
  const currentChanges = Number.isSafeInteger(state.settings.changesSinceBackup)
    ? state.settings.changesSinceBackup
    : 0;

  state.settings = await saveAppSettings({
    ...state.settings,
    ...patch,
    changesSinceBackup: Math.min(999999, currentChanges + Math.max(0, changeAmount))
  });
  renderBackupStatus();
  return state.settings;
}

async function recordDataChange(changeAmount = 1) {
  try {
    await saveMeaningfulSettings({}, changeAmount);
  } catch (error) {
    console.warn("Der Backup-Änderungszähler konnte nicht aktualisiert werden:", error);
  }
}

async function saveShelfBulkComics(updatedComics, { action = "bulk" } = {}) {
  const entries = Array.isArray(updatedComics) ? updatedComics : [];
  if (!entries.length) return;
  await upsertArchiveEntries(entries);
  await recordDataChange(entries.length);
  await refreshCollection();
  await refreshArchiveCoreStatus({ showReport: false });
  if (action !== "undo") await refreshMediaStatus().catch(() => {});
}

function syncCollectionSeriesFilter(availableSeries, preferredValue) {
  return collectionFeature.syncSeriesFilter(availableSeries, preferredValue);
}

function renderCollectionHub() {
  return collectionFeature.renderHub();
}

function openCollectionPage(scope, presets = {}) {
  return collectionFeature.open(scope, presets);
}

function closeCollectionPage(options) {
  return collectionFeature.close(options);
}

function renderCollection() {
  return collectionFeature.render();
}

function resetFilters(options) {
  return collectionFeature.resetFilters(options);
}

function openProgressForSeries(seriesName) {
  openProgressPage();
  const optionExists = [...elements.progressSeries.options].some((option) => option.value === seriesName);
  if (optionExists) {
    elements.progressSeries.value = seriesName;
    syncProgressTargetInput();
  }
  elements.progressTargetPanel.open = true;
  window.setTimeout(() => elements.progressTarget.focus({ preventScroll: true }), 0);
}










function renderMissingHub() {
  return missingFeature.renderHub();
}

function openMissingPage(scope, options) {
  return missingFeature.open(scope, options);
}

function closeMissingPage(options) {
  return missingFeature.close(options);
}

function renderMissingBands(options) {
  return missingFeature.render(options);
}

function openMissingDetailModal(series, bandNumber) {
  return missingFeature.openDetail(series, bandNumber);
}

function closeMissingDetailModal() {
  return missingFeature.closeDetail();
}

function hasMissingDetailContent(detail) {
  return missingFeature.hasDetailContent(detail);
}

function getFleaMarketCandidates() {
  const candidates = [];
  state.missingGroups.forEach((group) => {
    group.missingBands.forEach((bandNumber) => {
      const key = createMissingDetailKey(group.series, bandNumber);
      const detail = state.settings.missingBandDetails?.[key] || {};
      candidates.push({
        key,
        series: group.series,
        bandNumber,
        title: detail.title || "",
        publicationYear: detail.publicationYear || null,
        desiredCondition: detail.desiredCondition || "",
        priority: normalizeWishlistPriority(detail.priority),
        notes: detail.notes || "",
        duckipediaUrl: detail.duckipediaUrl || createConfiguredDuckipediaUrl(group.series, bandNumber, detail.title || "")
      });
    });
  });

  return candidates.sort((first, second) => {
    const firstMainRank = first.series === "Lustiges Taschenbuch" ? 0 : 1;
    const secondMainRank = second.series === "Lustiges Taschenbuch" ? 0 : 1;
    return firstMainRank - secondMainRank
      || first.series.localeCompare(second.series, "de", { sensitivity: "base" })
      || compareWishlistEntries(first, second);
  });
}

function getFleaMarketSessionItems() {
  return state.settings.fleaMarketSession?.items && typeof state.settings.fleaMarketSession.items === "object"
    ? state.settings.fleaMarketSession.items
    : {};
}

async function persistFleaMarketSession(items) {
  state.settings = await saveAppSettings({
    ...state.settings,
    fleaMarketSession: {
      items,
      updatedAt: new Date().toISOString()
    }
  });
  renderFleaMarketHubStatus();
}

function renderFleaMarketHubStatus() {
  const candidateKeys = new Set(getFleaMarketCandidates().map((item) => item.key));
  const selectedCount = Object.keys(getFleaMarketSessionItems()).filter((key) => candidateKeys.has(key)).length;
  elements.fleaMarketFoundCount.textContent = selectedCount === 1 ? "1 gefunden" : `${selectedCount} gefunden`;
}

async function openFleaMarketPage() {
  const candidateKeys = new Set(getFleaMarketCandidates().map((item) => item.key));
  const currentItems = getFleaMarketSessionItems();
  const cleanedItems = Object.fromEntries(
    Object.entries(currentItems).filter(([key]) => candidateKeys.has(key))
  );
  if (Object.keys(cleanedItems).length !== Object.keys(currentItems).length) {
    await persistFleaMarketSession(cleanedItems);
  }

  elements.fleaMarketMessage.textContent = "";
  renderFleaMarket();
  elements.fleaMarketPage.classList.remove("hidden");
  elements.fleaMarketPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.fleaMarketPage.scrollTop = 0;
  window.setTimeout(() => elements.closeFleaMarket.focus({ preventScroll: true }), 0);
}

function closeFleaMarketPage() {
  elements.fleaMarketPage.classList.add("hidden");
  elements.fleaMarketPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  window.setTimeout(() => elements.openFleaMarket.focus({ preventScroll: true }), 0);
}

function renderFleaMarket() {
  const searchTerm = normalizeSearchText(elements.fleaMarketSearch.value);
  const scope = elements.fleaMarketScope.value || "all";
  const priorityFilter = elements.fleaMarketPriorityFilter.value || "active";
  const sessionItems = getFleaMarketSessionItems();
  const allCandidates = getFleaMarketCandidates();
  const scopedCandidates = allCandidates.filter((item) => {
    if (scope === "main" && item.series !== "Lustiges Taschenbuch") return false;
    if (scope === "other" && item.series === "Lustiges Taschenbuch") return false;
    if (priorityFilter === "active" && item.priority === "ignore") return false;
    if (priorityFilter === "unrated" && item.priority) return false;
    if (!["active", "all", "unrated"].includes(priorityFilter) && item.priority !== priorityFilter) return false;
    return true;
  });
  const candidates = scopedCandidates.filter((item) => {
    if (!searchTerm) return true;
    return normalizeSearchText(`${item.series} ${item.bandNumber} ${item.title}`).includes(searchTerm);
  });

  const selectedCount = scopedCandidates.filter((item) => sessionItems[item.key]).length;
  elements.fleaMarketMissingCount.textContent = String(scopedCandidates.length);
  elements.fleaMarketSelectedCount.textContent = String(selectedCount);
  elements.fleaMarketPageCount.textContent = selectedCount === 1 ? "1 gefunden" : `${selectedCount} gefunden`;
  elements.fleaMarketSave.disabled = selectedCount === 0;
  elements.fleaMarketClear.disabled = selectedCount === 0;
  elements.fleaMarketApplyCondition.disabled = selectedCount === 0;
  elements.fleaMarketEmpty.classList.toggle("hidden", candidates.length > 0);
  elements.fleaMarketList.replaceChildren();

  let currentSeries = "";
  let groupList = null;
  candidates.forEach((item) => {
    if (item.series !== currentSeries) {
      currentSeries = item.series;
      const group = document.createElement("section");
      group.className = "flea-market-group";
      const heading = document.createElement("div");
      heading.className = "flea-market-group-heading";
      const title = document.createElement("h3");
      title.textContent = item.series;
      const groupCount = document.createElement("span");
      const seriesCount = candidates.filter((candidate) => candidate.series === item.series).length;
      groupCount.className = "count-badge compact-count-badge";
      groupCount.textContent = String(seriesCount);
      heading.append(title, groupCount);
      groupList = document.createElement("div");
      groupList.className = "flea-market-group-list";
      group.append(heading, groupList);
      elements.fleaMarketList.append(group);
    }

    const selected = sessionItems[item.key];
    const row = document.createElement("article");
    row.className = selected ? "flea-market-item is-found" : "flea-market-item";
    row.dataset.marketKey = item.key;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(selected);
    checkbox.dataset.marketToggle = item.key;
    checkbox.setAttribute("aria-label", `${item.series} Band ${item.bandNumber} als gefunden markieren`);

    const copy = document.createElement("div");
    copy.className = "flea-market-item-copy";
    const bandLine = document.createElement("span");
    bandLine.className = "flea-market-band-line";
    const band = document.createElement("strong");
    band.textContent = `Band ${item.bandNumber}`;
    bandLine.append(band);
    const priorityDefinition = getWishlistPriorityDefinition(item.priority);
    if (priorityDefinition) {
      const priority = document.createElement("span");
      priority.className = `wishlist-priority wishlist-priority-${item.priority}`;
      priority.textContent = priorityDefinition.shortLabel;
      bandLine.append(priority);
    }
    const metadata = document.createElement("span");
    metadata.textContent = [item.title, item.publicationYear].filter(Boolean).join(" · ") || "Noch keine Zusatzdaten";
    copy.append(bandLine, metadata);

    const condition = document.createElement("select");
    condition.dataset.marketCondition = item.key;
    condition.setAttribute("aria-label", `Zustand für ${item.series} Band ${item.bandNumber}`);
    APP_CONFIG.conditions.forEach((entry) => condition.append(createOption(entry.code, entry.code)));
    condition.value = selected?.condition || item.desiredCondition || elements.fleaMarketDefaultCondition.value || DEFAULT_CONDITION_CODE;
    condition.disabled = !selected;

    const link = document.createElement("a");
    link.className = "flea-market-link";
    link.href = item.duckipediaUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Duckipedia ↗";

    row.append(checkbox, copy, condition, link);
    groupList.append(row);
  });

  renderFleaMarketHubStatus();
}

async function handleFleaMarketListChange(event) {
  const toggle = event.target.closest("input[data-market-toggle]");
  const conditionSelect = event.target.closest("select[data-market-condition]");
  const items = { ...getFleaMarketSessionItems() };

  if (toggle) {
    const candidate = getFleaMarketCandidates().find((item) => item.key === toggle.dataset.marketToggle);
    if (!candidate) return;
    if (toggle.checked) {
      items[candidate.key] = {
        series: candidate.series,
        bandNumber: candidate.bandNumber,
        condition: candidate.desiredCondition || elements.fleaMarketDefaultCondition.value || DEFAULT_CONDITION_CODE,
        markedAt: new Date().toISOString()
      };
    } else {
      delete items[candidate.key];
    }
  } else if (conditionSelect) {
    const key = conditionSelect.dataset.marketCondition;
    if (!items[key]) return;
    items[key] = { ...items[key], condition: conditionSelect.value };
  } else {
    return;
  }

  try {
    await persistFleaMarketSession(items);
    renderFleaMarket();
  } catch (error) {
    showFleaMarketMessage(`Markierung konnte nicht gespeichert werden: ${error.message}`, "error");
  }
}

async function applyFleaMarketDefaultCondition() {
  const defaultCondition = elements.fleaMarketDefaultCondition.value;
  const items = Object.fromEntries(
    Object.entries(getFleaMarketSessionItems()).map(([key, item]) => [key, { ...item, condition: defaultCondition }])
  );
  if (Object.keys(items).length === 0) return;
  await persistFleaMarketSession(items);
  renderFleaMarket();
  showFleaMarketMessage(`Zustand ${defaultCondition} wurde auf alle gefundenen Bände angewendet.`, "success");
}

async function clearFleaMarketFinds() {
  const count = Object.keys(getFleaMarketSessionItems()).length;
  if (count === 0) return;
  if (!window.confirm(`${count} Flohmarkt-Markierungen wirklich zurücksetzen?`)) return;
  await persistFleaMarketSession({});
  renderFleaMarket();
  showFleaMarketMessage("Alle Flohmarkt-Markierungen wurden zurückgesetzt.", "success");
}

async function saveFleaMarketFinds() {
  const sessionItems = getFleaMarketSessionItems();
  const candidatesByKey = new Map(getFleaMarketCandidates().map((item) => [item.key, item]));
  const selected = Object.entries(sessionItems)
    .map(([key, session]) => ({ key, session, candidate: candidatesByKey.get(key) }))
    .filter((entry) => entry.candidate);

  if (selected.length === 0) {
    showFleaMarketMessage("Es sind keine fehlenden Bände als gefunden markiert.", "error");
    return;
  }

  elements.fleaMarketSave.disabled = true;
  showFleaMarketMessage("Gefundene Bände werden gespeichert …", "info");

  try {
    const now = new Date().toISOString();
    const records = [];
    const nextDetails = { ...(state.settings.missingBandDetails || {}) };
    const nextSessionItems = { ...sessionItems };
    let newIssues = 0;
    let additionalCopies = 0;

    for (const entry of selected) {
      const { candidate, session, key } = entry;
      const condition = APP_CONFIG.conditions.some((item) => item.code === session.condition)
        ? session.condition
        : DEFAULT_CONDITION_CODE;
      const existing = state.collectionEntries.find((comic) => (
        normalizeSeriesLookup(getEntrySeriesName(comic)) === normalizeSeriesLookup(candidate.series)
        && getEntryNumericBandNumber(comic) === candidate.bandNumber
      ));

      if (existing) {
        const existingCopies = getComicCopies(existing);
        const copies = [
          ...existingCopies,
          normalizeCopy({
            id: createEntityId(`${existing.id}-copy`),
            issueId: getEntryId(existing),
            condition,
            isRead: false,
            isSealed: false,
            notes: candidate.notes || "",
            source: "flea-market",
            createdAt: now,
            updatedAt: now
          }, { issueId: getEntryId(existing), position: existingCopies.length + 1, now })
        ];
        records.push({
          ...existing,
          copies,
          copyCount: copies.length,
          condition: copies[0].condition,
          duplicateCondition: copies[1]?.condition || null,
          isRead: copies[0].isRead,
          isSealed: copies[0].isSealed,
          isDuplicate: copies.length > 1,
          dataFormatVersion: APP_CONFIG.dataFormatVersion,
          updatedAt: now
        });
        additionalCopies += 1;
      } else {
        const metadata = await getMetadataCache(createMetadataCacheKey(candidate.series, candidate.bandNumber));
        records.push({
          id: createStableId(),
          dataFormatVersion: APP_CONFIG.dataFormatVersion,
          series: candidate.series,
          volumeNumber: String(candidate.bandNumber),
          numericBandNumber: candidate.bandNumber,
          title: candidate.title || metadata?.title || "",
          publicationYear: candidate.publicationYear || metadata?.publicationYear || null,
          condition,
          duplicateCondition: null,
          isRead: false,
          isDuplicate: false,
          isSealed: false,
          notes: candidate.notes || "",
          duckipediaPageUrl: candidate.duckipediaUrl || metadata?.pageUrl || createConfiguredDuckipediaUrl(candidate.series, candidate.bandNumber),
          duckipediaCoverUrl: metadata?.coverUrl || "",
          duckipediaCoverFileName: metadata?.coverFileName || "",
          duckipediaCoverSource: metadata?.coverSource || "",
          duckipediaCoverLookupVersion: Number(metadata?.lookupVersion || 0),
          metadataStatus: metadata?.found === true ? "found" : "",
          metadataFetchedAt: metadata?.fetchedAt || null,
          createdAt: now,
          updatedAt: now
        });
        newIssues += 1;
      }

      delete nextDetails[key];
      delete nextSessionItems[key];
    }

    if (records.length > 0) await upsertArchiveEntries(records);
    await saveMeaningfulSettings({
      missingBandDetails: nextDetails,
      fleaMarketSession: { items: nextSessionItems, updatedAt: new Date().toISOString() }
    }, Math.max(1, records.length));
    await refreshCollection();
    await refreshArchiveCoreStatus({ showReport: false });
    renderFleaMarket();

    const parts = [];
    if (newIssues) parts.push(`${newIssues} neue${newIssues === 1 ? "r Band" : " Bände"}`);
    if (additionalCopies) parts.push(`${additionalCopies} weitere${additionalCopies === 1 ? "s Exemplar" : " Exemplare"}`);
    showFleaMarketMessage(`${parts.join(" und ")} wurden in die Sammlung übernommen.`, "success");
  } catch (error) {
    console.error("Flohmarkt-Funde konnten nicht gespeichert werden:", error);
    showFleaMarketMessage(`Speichern fehlgeschlagen: ${error.message}`, "error");
  } finally {
    elements.fleaMarketSave.disabled = Object.keys(getFleaMarketSessionItems()).length === 0;
  }
}

function showFleaMarketMessage(message, type = "info") {
  elements.fleaMarketMessage.textContent = message;
  elements.fleaMarketMessage.dataset.type = type;
}

function openProgressPage() {
  renderSeriesProgress();
  elements.progressPage.classList.remove("hidden");
  elements.progressPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.progressPage.scrollTop = 0;
  window.setTimeout(() => elements.closeProgress.focus({ preventScroll: true }), 0);
}

function closeProgressPage() {
  elements.progressPage.classList.add("hidden");
  elements.progressPage.setAttribute("aria-hidden", "true");
  const anotherPageOpen = [...document.querySelectorAll(".app-page")]
    .some((page) => !page.classList.contains("hidden"));
  document.body.classList.toggle("app-page-open", anotherPageOpen);
  window.setTimeout(() => {
    if (shelfUI?.isSeriesOpen()) document.querySelector("#series-target-button")?.focus({ preventScroll: true });
    else elements.openProgress.focus({ preventScroll: true });
  }, 0);
}

function openMediaPage() {
  refreshMediaStatus();
  elements.mediaPage.classList.remove("hidden");
  elements.mediaPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.mediaPage.scrollTop = 0;
  window.setTimeout(() => elements.closeMedia.focus({ preventScroll: true }), 0);
}

function closeMediaPage() {
  if (state.enrichmentRunning) {
    showToast("Bitte warte, bis die laufende Duckipedia-Anreicherung abgeschlossen ist.", "info");
    return;
  }
  elements.mediaPage.classList.add("hidden");
  elements.mediaPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  window.setTimeout(() => elements.openMedia.focus({ preventScroll: true }), 0);
}

async function refreshMediaStatus() {
  try {
    const [coverStats, metadataEntries] = await Promise.all([
      getCoverMediaStats(),
      getAllMetadataCache()
    ]);
    elements.mediaCoverCount.textContent = formatEntryCount(coverStats.count).replace("Eintrag", "Cover").replace("Einträge", "Cover");
    elements.mediaCoverSize.textContent = `${formatBytes(coverStats.bytes)} lokal gespeichert`;
    elements.mediaCacheCount.textContent = metadataEntries.length === 1 ? "1 Eintrag" : `${metadataEntries.length} Einträge`;
    elements.mediaPageSummary.textContent = coverStats.count === 1 ? "1 Cover" : `${coverStats.count} Cover`;
    elements.lastMediaBackup.textContent = state.settings.lastMediaBackupAt
      ? formatDateTime(state.settings.lastMediaBackupAt)
      : "Noch keines";
    const mediaChanges = Number(state.settings.mediaChangesSinceBackup || 0);
    elements.mediaBackupChanges.textContent = mediaChanges === 1 ? "1 Medienänderung seit Backup" : `${mediaChanges} Medienänderungen seit Backup`;
    elements.showCovers.checked = state.settings.showCovers !== false;
    elements.autoEnrich.checked = state.settings.duckipediaAutoEnrich !== false;

    const eligibleCount = state.collectionEntries.filter((comic) => getEntryNumericBandNumber(comic) && (
      !getEntryTitle(comic) || !getEntryPublicationYear(comic) || !getEntryDuckipediaCoverUrl(comic) || !isMetadataFresh(comic)
    )).length;
    elements.enrichmentCount.textContent = eligibleCount === 1 ? "1 Band prüfbar" : `${eligibleCount} Bände prüfbar`;

    if (navigator.storage && typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      const usage = Number(estimate.usage || 0);
      const quota = Number(estimate.quota || 0);
      elements.mediaOriginUsage.textContent = formatBytes(usage);
      elements.mediaOriginQuota.textContent = quota > 0 ? `von ungefähr ${formatBytes(quota)} verfügbar` : "Speicherlimit nicht gemeldet";
    } else {
      elements.mediaOriginUsage.textContent = "Nicht abrufbar";
      elements.mediaOriginQuota.textContent = "Der Browser stellt keine Schätzung bereit.";
    }
  } catch (error) {
    console.warn("Medienstatus konnte nicht geladen werden:", error);
    elements.mediaMessage.textContent = `Speicherübersicht konnte nicht geladen werden: ${error.message}`;
    elements.mediaMessage.dataset.type = "error";
  }
}

async function handleShowCoversChange() {
  state.settings = await saveAppSettings({ ...state.settings, showCovers: elements.showCovers.checked });
  renderCollection();
}

async function handleAutoEnrichChange() {
  state.settings = await saveAppSettings({ ...state.settings, duckipediaAutoEnrich: elements.autoEnrich.checked });
  elements.metadataStatus.textContent = elements.autoEnrich.checked
    ? "Automatische Duckipedia-Anreicherung ist aktiv."
    : "Automatische Anreicherung ist aus. Der Button bleibt nutzbar.";
}

async function handleEnrichAll() {
  if (state.enrichmentRunning) return;
  const candidates = state.collectionEntries.filter((comic) => getEntryNumericBandNumber(comic));

  if (candidates.length === 0) {
    elements.enrichmentStatus.textContent = "Es gibt noch keine Comics mit rein numerischer Bandnummer.";
    elements.enrichmentStatus.dataset.type = "info";
    return;
  }

  state.enrichmentRunning = true;
  setMediaControlsBusy(true);
  elements.enrichmentProgress.classList.remove("hidden");
  elements.enrichmentProgress.max = candidates.length;
  elements.enrichmentProgress.value = 0;
  elements.enrichmentStatus.textContent = "Duckipedia-Daten werden geprüft …";
  elements.enrichmentStatus.dataset.type = "info";

  const updates = [];
  let found = 0;
  let failed = 0;

  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const comic = candidates[index];
      elements.enrichmentStatus.textContent = `${getEntrySeriesName(comic)}, Band ${getEntryVolumeNumber(comic)} wird geprüft (${index + 1}/${candidates.length}) …`;
      const metadata = await getMetadataForBand(getEntrySeriesName(comic), getEntryNumericBandNumber(comic), { force: false });
      const { comic: updatedComic, changed } = mergeComicWithMetadata(comic, metadata);

      if (metadata.found) found += 1; else failed += 1;
      if (changed) updates.push(updatedComic);
      elements.enrichmentProgress.value = index + 1;
      if (!metadata.fromCache) await new Promise((resolve) => window.setTimeout(resolve, 180));
    }

    if (updates.length) {
      await upsertArchiveEntries(updates);
      await recordDataChange(updates.length);
      await refreshCollection();
    }

    elements.enrichmentStatus.textContent = `${found} Bandseiten gefunden, ${failed} ohne Treffer. ${updates.length} Einträge wurden ergänzt oder aktualisiert.`;
    elements.enrichmentStatus.dataset.type = "success";
    await refreshMediaStatus();
  } catch (error) {
    console.error("Sammelanreicherung fehlgeschlagen:", error);
    elements.enrichmentStatus.textContent = `Anreicherung abgebrochen: ${error.message}`;
    elements.enrichmentStatus.dataset.type = "error";
  } finally {
    state.enrichmentRunning = false;
    setMediaControlsBusy(false);
    window.setTimeout(() => elements.enrichmentProgress.classList.add("hidden"), 800);
  }
}

async function handleClearMetadataCache() {
  if (!window.confirm("Den lokalen Duckipedia-Cache leeren? Bereits in Comics gespeicherte Titel, Jahre und Coverlinks bleiben erhalten.")) return;
  await clearMetadataCache();
  elements.enrichmentStatus.textContent = "Der Duckipedia-Cache wurde geleert. Bei der nächsten Prüfung werden Daten neu geladen.";
  elements.enrichmentStatus.dataset.type = "success";
  await refreshMediaStatus();
}

async function handleMediaBackupExport() {
  setMediaControlsBusy(true);
  elements.mediaMessage.textContent = "Medien-Backup wird vorbereitet …";
  elements.mediaMessage.dataset.type = "info";

  try {
    const [covers, metadataCache] = await Promise.all([getAllCoverMedia(), getAllMetadataCache()]);
    const backupTime = new Date().toISOString();
    const nextSettings = {
      ...state.settings,
      lastBackupAt: backupTime,
      lastMediaBackupAt: backupTime,
      changesSinceBackup: 0,
      mediaChangesSinceBackup: 0,
      lastBackupComicCount: state.collectionEntries.length
    };
    const content = await createMediaBackup(state.collectionEntries, nextSettings, metadataCache, covers);
    const result = await shareOrDownloadBlob({
      blob: new Blob([content], { type: "application/json;charset=utf-8" }),
      filename: createAppFilename("Entenarchiv-Medien-Backup", "json"),
      mimeType: "application/json;charset=utf-8",
      title: "Entenarchiv – vollständiges Medien-Backup",
      text: "Vollständiges Entenarchiv-Backup inklusive eigener Coverfotos."
    });

    if (result.method !== "cancelled") {
      state.settings = await saveAppSettings(nextSettings);
      renderBackupStatus();
      await refreshMediaStatus();
    }

    elements.mediaMessage.textContent = result.method === "share"
      ? "Das Medien-Backup wurde an das Teilen-Menü übergeben."
      : result.method === "download"
        ? "Das Medien-Backup wurde als Download bereitgestellt."
        : "Teilen wurde abgebrochen.";
    elements.mediaMessage.dataset.type = result.method === "cancelled" ? "info" : "success";
  } catch (error) {
    console.error("Medien-Backup fehlgeschlagen:", error);
    elements.mediaMessage.textContent = `Medien-Backup fehlgeschlagen: ${error.message}`;
    elements.mediaMessage.dataset.type = "error";
  } finally {
    setMediaControlsBusy(false);
  }
}

async function handleDeleteAllCovers() {
  const stats = await getCoverMediaStats();
  if (!stats.count) {
    elements.mediaMessage.textContent = "Es sind keine eigenen Cover gespeichert.";
    elements.mediaMessage.dataset.type = "info";
    return;
  }
  if (!window.confirm(`Wirklich alle ${stats.count} eigenen Coverfotos löschen? Ein Daten-Backup ohne Medien kann sie nicht wiederherstellen.`)) return;
  await clearAllCoverMedia();
  await recordMediaChange(stats.count);
  renderCollection();
  await refreshMediaStatus();
  elements.mediaMessage.textContent = "Alle eigenen Coverfotos wurden gelöscht. Duckipedia-Vorschauen bleiben erhalten.";
  elements.mediaMessage.dataset.type = "success";
}

function setMediaControlsBusy(isBusy) {
  [elements.enrichAll, elements.clearMetadataCache, elements.exportMediaBackup, elements.openMediaImport, elements.deleteAllCovers].forEach((button) => {
    button.disabled = isBusy;
  });
}

function syncProgressTargetInput() {
  const series = elements.progressSeries.value;
  const targets = state.settings.knownHighestBandBySeries || {};
  const hasConfiguredTarget = Boolean(series && Object.prototype.hasOwnProperty.call(targets, series));
  elements.progressTarget.value = hasConfiguredTarget ? targets[series] : "";
  elements.progressRemove.classList.toggle("hidden", !hasConfiguredTarget);
}

async function handleProgressTargetSubmit(event) {
  event.preventDefault();
  const series = elements.progressSeries.value;
  const rawTarget = elements.progressTarget.value.trim();

  if (!series) {
    elements.progressMessage.textContent = "Bitte wähle eine Reihe aus.";
    elements.progressMessage.dataset.type = "error";
    elements.progressSeries.focus();
    return;
  }

  const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };

  if (!rawTarget) {
    if (!(series in nextTargets)) {
      elements.progressMessage.textContent = "Für diese Reihe ist kein festes Ziel gespeichert.";
      elements.progressMessage.dataset.type = "info";
      return;
    }
    delete nextTargets[series];
  } else {
    const target = Number(rawTarget);
    if (!Number.isSafeInteger(target) || target < 1 || target > 99999) {
      elements.progressMessage.textContent = "Die Zielbandnummer muss zwischen 1 und 99.999 liegen.";
      elements.progressMessage.dataset.type = "error";
      elements.progressTarget.focus();
      return;
    }
    const highestPresent = state.collectionEntries
      .filter((comic) => getEntrySeriesName(comic) === series && Number.isSafeInteger(getEntryNumericBandNumber(comic)))
      .reduce((maximum, comic) => Math.max(maximum, getEntryNumericBandNumber(comic)), 0);
    if (target < highestPresent) {
      elements.progressMessage.textContent = `Das Ziel kann nicht unter dem bereits vorhandenen Band ${highestPresent} liegen.`;
      elements.progressMessage.dataset.type = "error";
      elements.progressTarget.focus();
      return;
    }
    nextTargets[series] = target;
  }

  try {
    await saveMeaningfulSettings({ knownHighestBandBySeries: nextTargets });
    state.missingGroups = calculateMissingBands(state.collectionEntries, nextTargets);
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
    shelfUI?.refresh({ comics: state.collectionEntries, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
    syncProgressTargetInput();
    elements.progressMessage.textContent = rawTarget
      ? `Ziel für „${series}“ gespeichert.`
      : `Festes Ziel für „${series}“ entfernt.`;
    elements.progressMessage.dataset.type = "success";
  } catch (error) {
    elements.progressMessage.textContent = `Ziel konnte nicht gespeichert werden: ${error.message}`;
    elements.progressMessage.dataset.type = "error";
  }
}

async function handleRemoveProgressTarget() {
  const series = elements.progressSeries.value;
  const targets = state.settings.knownHighestBandBySeries || {};

  if (!series || !Object.prototype.hasOwnProperty.call(targets, series)) {
    elements.progressMessage.textContent = "Für die ausgewählte Reihe ist kein festes Ziel gespeichert.";
    elements.progressMessage.dataset.type = "info";
    syncProgressTargetInput();
    return;
  }

  if (!window.confirm(`Festes Ziel für „${series}“ entfernen? Danach wird wieder bis zum höchsten vorhandenen Band gerechnet.`)) return;

  try {
    const nextTargets = { ...targets };
    delete nextTargets[series];
    await saveMeaningfulSettings({ knownHighestBandBySeries: nextTargets });
    state.missingGroups = calculateMissingBands(state.collectionEntries, nextTargets);
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
    shelfUI?.refresh({ comics: state.collectionEntries, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
    syncProgressTargetInput();
    elements.progressMessage.textContent = `Festes Ziel für „${series}“ entfernt.`;
    elements.progressMessage.dataset.type = "success";
  } catch (error) {
    elements.progressMessage.textContent = `Ziel konnte nicht entfernt werden: ${error.message}`;
    elements.progressMessage.dataset.type = "error";
  }
}

function getSeriesProgressData() {
  const numericBandsBySeries = new Map();

  state.collectionEntries.forEach((comic) => {
    if (!Number.isSafeInteger(getEntryNumericBandNumber(comic)) || getEntryNumericBandNumber(comic) < 1) return;
    if (!numericBandsBySeries.has(getEntrySeriesName(comic))) numericBandsBySeries.set(getEntrySeriesName(comic), new Set());
    numericBandsBySeries.get(getEntrySeriesName(comic)).add(getEntryNumericBandNumber(comic));
  });

  const configuredTargets = state.settings.knownHighestBandBySeries || {};
  const seriesNames = new Set([
    ...numericBandsBySeries.keys(),
    ...Object.keys(configuredTargets)
  ]);

  return [...seriesNames].map((series) => {
    const bands = numericBandsBySeries.get(series) || new Set();
    const highestPresent = bands.size ? Math.max(...bands) : 0;
    const configuredTarget = Number(configuredTargets[series]) || 0;
    const target = configuredTarget || highestPresent;
    const presentWithinTarget = target > 0
      ? [...bands].filter((band) => band <= target).length
      : 0;
    const missing = Math.max(0, target - presentWithinTarget);
    const percentage = target > 0 ? Math.min(100, (presentWithinTarget / target) * 100) : 0;

    return {
      series,
      target,
      configuredTarget,
      highestPresent,
      presentWithinTarget,
      missing,
      percentage
    };
  }).filter((entry) => entry.target > 0)
    .sort((first, second) => {
      const mainSeries = "Lustiges Taschenbuch";
      if (first.series === mainSeries && second.series !== mainSeries) return -1;
      if (second.series === mainSeries && first.series !== mainSeries) return 1;
      const completenessDifference = second.percentage - first.percentage;
      return completenessDifference || first.series.localeCompare(second.series, "de", { sensitivity: "base" });
    });
}

function renderSeriesProgress() {
  const progressData = getSeriesProgressData();
  elements.progressList.replaceChildren();
  const seriesCountLabel = progressData.length === 1 ? "1 Reihe" : `${progressData.length} Reihen`;
  elements.progressSummary.textContent = seriesCountLabel;
  elements.progressPageSummary.textContent = seriesCountLabel;

  const totalTarget = progressData.reduce((sum, entry) => sum + entry.target, 0);
  const totalPresent = progressData.reduce((sum, entry) => sum + entry.presentWithinTarget, 0);
  const totalMissing = progressData.reduce((sum, entry) => sum + entry.missing, 0);
  const overallPercentage = totalTarget > 0 ? Math.min(100, (totalPresent / totalTarget) * 100) : 0;
  const roundedOverallPercentage = Math.round(overallPercentage);
  elements.progressOverviewPercent.textContent = `${overallPercentage.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
  elements.progressOverviewCopy.textContent = totalTarget > 0
    ? `${totalPresent} von ${totalTarget} Zielbänden vorhanden · ${totalMissing} fehlen`
    : "Noch kein Fortschritt berechenbar.";
  elements.progressOverviewFill.style.width = `${overallPercentage}%`;
  const overviewBar = elements.progressOverviewFill.parentElement;
  overviewBar.setAttribute("aria-valuenow", String(roundedOverallPercentage));

  if (progressData.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel empty-state compact-empty-state";
    const heading = document.createElement("h3");
    heading.textContent = "Noch kein Fortschritt berechenbar";
    const copy = document.createElement("p");
    copy.textContent = "Trage numerische Bände ein oder speichere oben ein Ziel für eine Reihe.";
    empty.append(heading, copy);
    elements.progressList.append(empty);
    return;
  }

  progressData.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "panel progress-card";

    const heading = document.createElement("div");
    heading.className = "progress-card-heading";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = entry.series;
    const meta = document.createElement("p");
    meta.className = "muted-copy";
    meta.textContent = entry.configuredTarget
      ? `Persönliches Ziel: Band ${entry.target}`
      : `Automatisch bis zum höchsten vorhandenen Band ${entry.target}`;
    titleWrap.append(title, meta);
    const percent = document.createElement("strong");
    percent.className = "progress-percent";
    percent.textContent = `${entry.percentage.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
    heading.append(titleWrap, percent);

    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(Math.round(entry.percentage)));
    const fill = document.createElement("span");
    fill.style.width = `${entry.percentage}%`;
    bar.append(fill);

    const stats = document.createElement("div");
    stats.className = "progress-card-stats";
    const createProgressStat = (value, label) => {
      const wrapper = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      const small = document.createElement("small");
      small.textContent = label;
      wrapper.append(strong, small);
      return wrapper;
    };
    stats.append(
      createProgressStat(entry.presentWithinTarget, "vorhanden"),
      createProgressStat(entry.missing, "fehlend"),
      createProgressStat(entry.target, "Ziel")
    );

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "text-button progress-edit-button";
    editButton.textContent = entry.configuredTarget ? "Ziel ändern" : "Festes Ziel setzen";
    editButton.addEventListener("click", () => {
      elements.progressTargetPanel.open = true;
      elements.progressSeries.value = entry.series;
      syncProgressTargetInput();
      elements.progressTargetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => elements.progressTarget.focus({ preventScroll: true }), 350);
    });

    card.append(heading, bar, stats, editButton);
    elements.progressList.append(card);
  });
}









function renderStats() {
  const total = state.collectionEntries.length;
  const read = state.collectionEntries.filter((comic) => getEntryCopies(comic).some((copy) => copy.isRead)).length;
  const sealed = state.collectionEntries.filter((comic) => getEntryCopies(comic).some((copy) => copy.isSealed)).length;
  const duplicate = state.collectionEntries.filter((comic) => getEntryCopies(comic).length > 1).length;
  const physicalCopies = countPhysicalCopies(state.collectionEntries);
  const seriesCount = new Set(state.collectionEntries.map((comic) => getEntrySeriesId(comic) || getEntrySeriesName(comic))).size;
  const missingCount = countMissingBands(state.missingGroups);

  elements.statTotal.textContent = total;
  elements.statSeries.textContent = seriesCount;
  elements.statRead.textContent = read;
  elements.statUnread.textContent = total - read;
  elements.statSealed.textContent = sealed;
  elements.statDuplicate.textContent = duplicate;
  elements.statMissing.textContent = missingCount;

  const dashboardLabels = {
    total: ["Gesamt", total],
    series: ["Reihen", seriesCount],
    read: ["Gelesen", read],
    unread: ["Ungelesen", total - read],
    sealed: ["Foliert", sealed],
    duplicate: ["Mehrfach vorhanden", duplicate],
    missing: ["Fehlende Bände", missingCount]
  };
  elements.dashboardStats.querySelectorAll("[data-dashboard-action]").forEach((button) => {
    const [label, value] = dashboardLabels[button.dataset.dashboardAction] || ["Kennzahl", ""];
    button.setAttribute("aria-label", `${label}: ${value}. Zugehörige Ansicht öffnen`);
  });

  renderCollectorMission();

  if (elements.statisticsPage.classList.contains("hidden")) return;

  elements.conditionStatsTotal.textContent = physicalCopies === 1 ? "1 Exemplar" : `${physicalCopies} Exemplare`;

  const allCopies = state.collectionEntries.flatMap((comic) => getEntryCopies(comic));
  elements.conditionStats.replaceChildren();
  APP_CONFIG.conditions.forEach((condition) => {
    const count = allCopies.filter((copy) => copy.condition === condition.code).length;
    const percentage = physicalCopies > 0 ? (count / physicalCopies) * 100 : 0;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "condition-stat-row condition-stat-action";
    row.setAttribute("aria-label", `${condition.label}: ${count} Exemplare. Bände öffnen`);
    const label = document.createElement("span");
    label.className = "condition-stat-label";
    label.textContent = condition.label;
    const bar = document.createElement("span");
    bar.className = "condition-stat-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    const conditionClassToken = condition.code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    fill.className = `condition-stat-fill condition-fill-${conditionClassToken}`;
    fill.style.width = `${percentage}%`;
    bar.append(fill);
    const countElement = document.createElement("span");
    countElement.className = "condition-stat-count";
    countElement.textContent = count;
    row.append(label, bar, countElement);
    if (count > 0) {
      row.addEventListener("click", () => openStatisticsCollection({
        conditionCodes: [condition.code],
        bannerTitle: condition.label,
        bannerDescription: `Alle Ausgaben mit mindestens einem Exemplar in Zustand ${condition.code}.`
      }));
    } else {
      row.disabled = true;
    }
    elements.conditionStats.append(row);
  });
  renderStatistics();
}


function renderCollectorMission() {
  if (!elements.collectorMission) return;
  const mission = buildCollectorMission({
    progressData: getSeriesProgressData(),
    missingGroups: state.missingGroups,
    settings: state.settings
  });
  state.collectorMission = mission;
  elements.collectorMissionEyebrow.textContent = mission.eyebrow;
  elements.collectorMissionTitle.textContent = mission.title;
  elements.collectorMissionText.textContent = mission.copy;
  elements.collectorMission.dataset.accent = mission.accent || "progress";
  elements.collectorMission.disabled = !mission.action;
  elements.collectorMission.setAttribute("aria-label", mission.action ? `${mission.eyebrow}: ${mission.title}. Öffnen` : `${mission.eyebrow}: ${mission.title}`);
}

function handleCollectorMissionClick() {
  const action = state.collectorMission?.action;
  if (!action) return;
  if (action.type === "missing-series") {
    state.missingScope = "all";
    state.missingReturnTarget = "home";
    state.openMissingSeries = new Set([action.series]);
    elements.missingPageTitle.textContent = `Fehlende Bände · ${action.series}`;
    renderMissingBands({ forceOpenSeries: action.series });
    elements.missingPage.classList.remove("hidden");
    elements.missingPage.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-page-open");
    window.setTimeout(() => {
      [...elements.missingList.querySelectorAll("details[data-series]")]
        .find((detail) => detail.dataset.series === action.series)
        ?.scrollIntoView({ block: "start" });
    }, 0);
    return;
  }
  if (action.type === "missing-band") {
    openMissingPage("all");
    state.openMissingSeries.add(action.series);
    renderMissingBands({ forceOpenSeries: action.series });
    window.setTimeout(() => openMissingDetailModal(action.series, action.bandNumber), 40);
  }
}

function renderMilestones(milestones) {
  if (!elements.milestoneList) return;
  const source = Array.isArray(milestones) ? milestones : [];
  elements.milestoneCount.textContent = String(source.length);
  elements.milestoneList.replaceChildren();
  if (!source.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "Die ersten Meilensteine entstehen automatisch mit deiner Sammlung und deinen Reihenzielen.";
    elements.milestoneList.append(empty);
    return;
  }
  source.forEach((milestone) => {
    const item = document.createElement("article");
    item.className = "milestone-row";
    const mark = document.createElement("span");
    const milestoneVisual = getMilestoneVisual(milestone);
    mark.className = `milestone-row-mark milestone-rarity-${milestoneVisual.rarity}`;
    mark.dataset.rarity = milestoneVisual.rarity;
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = milestoneVisual.icon;
    const copy = document.createElement("span");
    const eyebrow = document.createElement("small"); eyebrow.textContent = milestone.eyebrow;
    const title = document.createElement("strong"); title.textContent = milestone.title;
    const detail = document.createElement("span"); detail.textContent = milestone.copy;
    copy.append(eyebrow, title, detail);
    item.append(mark, copy);
    elements.milestoneList.append(item);
  });
}

function getMilestoneVisual(milestone) {
  if (!milestone) return { rarity: "common", icon: "•" };
  if (milestone.type === "copies") {
    const value = Number(milestone.value || 0);
    if (value >= 1000) return { rarity: "legendary", icon: "✹" };
    if (value >= 750) return { rarity: "epic", icon: "✦" };
    if (value >= 500) return { rarity: "rare", icon: "★" };
    if (value >= 250) return { rarity: "uncommon", icon: "◆" };
    return { rarity: "common", icon: "●" };
  }
  if (milestone.type === "progress") {
    const value = Number(milestone.value || 0);
    if (value >= 100) return { rarity: "legendary", icon: "✹" };
    if (value >= 90) return { rarity: "epic", icon: "✦" };
    if (value >= 75) return { rarity: "rare", icon: "★" };
    return { rarity: "uncommon", icon: "◆" };
  }
  if (milestone.type === "series-complete") {
    const value = Number(milestone.value || 0);
    if (value >= 100) return { rarity: "legendary", icon: "✹" };
    if (value >= 50) return { rarity: "epic", icon: "✦" };
    if (value >= 20) return { rarity: "rare", icon: "★" };
    return { rarity: "uncommon", icon: "◆" };
  }
  return { rarity: "common", icon: "●" };
}

function scheduleMilestoneSync(milestones) {
  if (state.milestoneSyncPending) return;
  state.milestoneSyncPending = true;
  window.setTimeout(async () => {
    const currentIds = milestones.map((entry) => entry.id);
    const seen = new Set(normalizeMilestoneIds(state.settings.milestoneSeenIds));
    try {
      if (!state.settings.milestonesInitializedAt) {
        state.settings = await saveAppSettings({
          ...state.settings,
          milestoneSeenIds: currentIds,
          milestonesInitializedAt: new Date().toISOString()
        });
        return;
      }
      const newMilestones = milestones.filter((entry) => !seen.has(entry.id));
      if (!newMilestones.length) return;
      newMilestones.forEach((entry) => seen.add(entry.id));
      state.settings = await saveAppSettings({ ...state.settings, milestoneSeenIds: [...seen] });
      showMilestoneCelebration(newMilestones[0]);
    } catch (error) {
      console.warn("Meilensteinstatus konnte nicht gespeichert werden:", error);
    } finally {
      state.milestoneSyncPending = false;
    }
  }, 0);
}

function showMilestoneCelebration(milestone) {
  if (!milestone || !elements.milestoneCelebration) return;
  const milestoneVisual = getMilestoneVisual(milestone);
  if (elements.milestoneCelebrationMark) {
    elements.milestoneCelebrationMark.textContent = milestoneVisual.icon;
    elements.milestoneCelebrationMark.className = `milestone-celebration-mark milestone-rarity-${milestoneVisual.rarity}`;
  }
  elements.milestoneCelebration.dataset.rarity = milestoneVisual.rarity;
  elements.milestoneCelebrationTitle.textContent = milestone.title;
  elements.milestoneCelebrationCopy.textContent = milestone.copy;
  elements.milestoneCelebration.classList.remove("hidden");
  window.clearTimeout(state.milestoneCelebrationTimer);
  state.milestoneCelebrationTimer = window.setTimeout(hideMilestoneCelebration, 6500);
}

function hideMilestoneCelebration() {
  window.clearTimeout(state.milestoneCelebrationTimer);
  state.milestoneCelebrationTimer = null;
  elements.milestoneCelebration?.classList.add("hidden");
}

function createShareCardContext() {
  const progressData = getSeriesProgressData();
  const dna = buildStatisticsDNA({ comics: state.collectionEntries, progressData, missingGroups: state.missingGroups });
  return {
    dna,
    mainProgress: progressData.find((entry) => entry.series === "Lustiges Taschenbuch") || null,
    milestone: state.currentMilestones[0] || buildMilestones({ comics: state.collectionEntries, progressData })[0] || null,
    totalSeries: new Set(state.collectionEntries.map((comic) => getEntrySeriesId(comic) || getEntrySeriesName(comic))).size,
    totalMissing: countMissingBands(state.missingGroups),
    generatedAt: new Date()
  };
}

async function openShareCardModal() {
  lazyDom.ensure("shareCard");
  elements.shareCardMessage.textContent = "";
  elements.shareCardModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  await renderShareCardPreview();
  window.setTimeout(() => elements.shareCardTemplate.focus({ preventScroll: true }), 0);
}

function closeShareCardModal() {
  if (!elements.shareCardModal) return;
  elements.shareCardModal.classList.add("hidden");
  elements.shareCardMessage.textContent = "";
  restoreBodyModalState();
  window.setTimeout(() => elements.openShareCard?.focus({ preventScroll: true }), 0);
}

async function renderShareCardPreview() {
  if (state.shareCardRendering) return;
  state.shareCardRendering = true;
  elements.shareCardShare.disabled = true;
  try {
    const payload = buildShareCardPayload(elements.shareCardTemplate.value, createShareCardContext());
    await renderShareCard(elements.shareCardCanvas, payload);
    elements.shareCardMessage.textContent = "";
  } catch (error) {
    console.error(error);
    elements.shareCardMessage.textContent = `Vorschau fehlgeschlagen: ${error.message}`;
    elements.shareCardMessage.dataset.type = "error";
  } finally {
    state.shareCardRendering = false;
    elements.shareCardShare.disabled = false;
  }
}

async function handleShareCardShare() {
  if (state.shareCardRendering) return;
  elements.shareCardShare.disabled = true;
  elements.shareCardMessage.textContent = "Share Card wird vorbereitet …";
  elements.shareCardMessage.dataset.type = "info";
  try {
    const payload = buildShareCardPayload(elements.shareCardTemplate.value, createShareCardContext());
    await renderShareCard(elements.shareCardCanvas, payload);
    const blob = await canvasToPngBlob(elements.shareCardCanvas);
    const result = await shareOrDownloadBlob({
      blob,
      filename: createAppFilename(`Entenarchiv-Share-${payload.template}`, "png"),
      mimeType: "image/png",
      title: "Entenarchiv – meine Sammlung",
      text: "Meine Sammlung aus Entenarchiv."
    });
    elements.shareCardMessage.textContent = result.method === "share" ? "Share Card wurde ans Teilen-Menü übergeben." : result.method === "download" ? "Share Card wurde als PNG gespeichert." : "Teilen abgebrochen.";
    elements.shareCardMessage.dataset.type = result.method === "cancelled" ? "info" : "success";
  } catch (error) {
    console.error(error);
    elements.shareCardMessage.textContent = `Share Card konnte nicht erzeugt werden: ${error.message}`;
    elements.shareCardMessage.dataset.type = "error";
  } finally {
    elements.shareCardShare.disabled = false;
  }
}

function renderStatistics() {
  if (!elements.statisticsHighlights) return;
  const progressData = getSeriesProgressData();
  const dna = buildStatisticsDNA({
    comics: state.collectionEntries,
    progressData,
    missingGroups: state.missingGroups
  });
  const readRate = dna.uniqueIssues ? Math.round((dna.readIssues / dna.uniqueIssues) * 100) : 0;
  const extraCopyRate = dna.uniqueIssues ? Math.round((dna.extraCopies / dna.uniqueIssues) * 100) : 0;
  elements.statisticsSummary.textContent = dna.physicalCopies === 1 ? "1 Buch" : `${dna.physicalCopies} Bücher`;
  elements.dnaSummary.textContent = `${dna.uniqueIssues} Ausgaben · ${dna.physicalCopies} Exemplare`;

  renderDnaInsights(dna);
  const milestones = buildMilestones({ comics: state.collectionEntries, progressData });
  state.currentMilestones = milestones;
  renderMilestones(milestones);
  scheduleMilestoneSync(milestones);

  const oldestYear = dna.years.length ? Math.min(...dna.years.map((entry) => entry.year)) : null;
  const bestProgress = progressData.filter((entry) => entry.target > 0).sort((a, b) => b.percentage - a.percentage || b.target - a.target)[0];
  const highlightData = [
    {
      label: "Lesefortschritt",
      value: `${readRate} %`,
      copy: `${dna.readIssues} von ${dna.uniqueIssues} Ausgaben gelesen`,
      action: () => openStatisticsCollection({ read: "unread", bannerTitle: "Noch ungelesen", bannerDescription: "Ausgaben, von denen noch kein Exemplar gelesen wurde." })
    },
    {
      label: "Zusätzliche Exemplare",
      value: String(dna.extraCopies),
      copy: extraCopyRate ? `${extraCopyRate} % mehr Bücher als Ausgaben` : "Keine Mehrfachexemplare",
      action: dna.extraCopies ? () => openStatisticsCollection({ duplicate: true, bannerTitle: "Mehrfach vorhanden", bannerDescription: "Ausgaben mit mindestens zwei physischen Exemplaren." }) : null
    },
    {
      label: "Durchschnittszustand",
      value: dna.averageCondition ? `Zustand ${dna.averageCondition.code}` : "–",
      copy: dna.averageCondition?.label || "Noch keine Bewertung",
      action: dna.averageCondition ? () => openStatisticsCollection({ conditionCodes: [dna.averageCondition.code], bannerTitle: `Zustand ${dna.averageCondition.code}`, bannerDescription: "Ausgaben rund um den rechnerischen Durchschnitt deiner Sammlung." }) : null
    },
    {
      label: "Vollständige Reihen",
      value: String(dna.completedSeries),
      copy: dna.progressSeriesCount ? `von ${dna.progressSeriesCount} berechenbaren Reihen` : "Noch keine Ziele berechenbar",
      action: dna.progressSeriesCount ? () => openProgressPage() : null
    },
    {
      label: "Ältestes Erscheinungsjahr",
      value: oldestYear ? String(oldestYear) : "–",
      copy: oldestYear ? "frühester Jahrgang im Archiv" : "Noch kein Jahr erfasst",
      action: oldestYear ? () => openStatisticsCollection({ publicationYear: oldestYear, bannerTitle: `Jahrgang ${oldestYear}`, bannerDescription: `Alle Ausgaben aus dem Erscheinungsjahr ${oldestYear}.` }) : null
    },
    {
      label: "Vollständigste Reihe",
      value: bestProgress ? `${Math.round(bestProgress.percentage)} %` : "–",
      copy: bestProgress ? bestProgress.series : "Noch nicht berechenbar",
      action: bestProgress ? () => openStatisticsCollection({ series: bestProgress.series, bannerTitle: bestProgress.series, bannerDescription: `Vollständigkeit ${Math.round(bestProgress.percentage)} %.` }) : null
    }
  ];
  elements.statisticsHighlights.replaceChildren();
  highlightData.forEach((item) => {
    const card = document.createElement(item.action ? "button" : "article");
    if (item.action) card.type = "button";
    card.className = `statistics-highlight-card${item.action ? " is-interactive" : ""}`;
    const label = document.createElement("span"); label.textContent = item.label;
    const value = document.createElement("strong"); value.textContent = item.value;
    const copy = document.createElement("small"); copy.textContent = item.copy;
    card.append(label, value, copy);
    if (item.action) card.addEventListener("click", item.action);
    elements.statisticsHighlights.append(card);
  });

  renderNearComplete(dna.nearComplete);

  const yearData = dna.years.slice(0, 12).map((entry) => ({
    label: String(entry.year),
    value: entry.copies,
    display: String(entry.copies),
    detail: `${entry.issues} Ausgaben`,
    action: () => openStatisticsCollection({
      publicationYear: entry.year,
      bannerTitle: `Jahrgang ${entry.year}`,
      bannerDescription: `${entry.issues} Ausgaben und ${entry.copies} physische Exemplare aus ${entry.year}.`
    })
  }));
  elements.yearChartTotal.textContent = dna.years.length ? `${dna.years.length} Jahrgänge erfasst` : "Keine Jahresdaten";
  renderHorizontalChart(elements.yearChart, yearData, { empty: "Noch keine Erscheinungsjahre eingetragen." });

  const qualityData = [...dna.series]
    .sort((a, b) => b.qualityRate - a.qualityRate || b.copies - a.copies || a.series.localeCompare(b.series, "de"))
    .slice(0, 10)
    .map((entry) => ({
      label: entry.series,
      value: entry.qualityRate,
      display: `${Math.round(entry.qualityRate)} %`,
      detail: `${entry.qualityGood} von ${entry.copies} Exemplaren`,
      action: () => openStatisticsCollection({
        series: entry.series,
        conditionCodes: ["0", "0-1", "1", "1-2"],
        bannerTitle: `${entry.series}: 1–2 oder besser`,
        bannerDescription: `${entry.qualityGood} Exemplare in Zustand 1–2 oder besser.`
      })
    }));
  renderHorizontalChart(elements.qualityChart, qualityData, { maximum: 100, empty: "Noch keine Zustände vorhanden." });

  const seriesData = [...dna.series]
    .sort((a, b) => b.copies - a.copies || a.series.localeCompare(b.series, "de"))
    .slice(0, 10)
    .map((entry) => ({
      label: entry.series,
      value: entry.copies,
      display: String(entry.copies),
      detail: `${entry.issues} Ausgaben`,
      action: () => openStatisticsCollection({
        series: entry.series,
        bannerTitle: entry.series,
        bannerDescription: `${entry.issues} Ausgaben · ${entry.copies} physische Exemplare.`
      })
    }));
  renderHorizontalChart(elements.seriesChart, seriesData, { empty: "Noch keine Reihen vorhanden." });
  renderQualityMap(dna.series);
}

function renderDnaInsights(dna) {
  elements.dnaInsights.replaceChildren();
  const insights = [
    dna.strongestYear ? {
      kicker: "Stärkster Jahrgang",
      value: String(dna.strongestYear.year),
      copy: `${dna.strongestYear.copies} Bücher aus diesem Erscheinungsjahr`,
      action: () => openStatisticsCollection({ publicationYear: dna.strongestYear.year, bannerTitle: `Jahrgang ${dna.strongestYear.year}`, bannerDescription: "Dein stärkster Erscheinungsjahrgang." })
    } : null,
    dna.bestQualitySeries ? {
      kicker: "Beste Qualitätsquote",
      value: `${Math.round(dna.bestQualitySeries.qualityRate)} %`,
      copy: `${dna.bestQualitySeries.series} · Zustand 1–2 oder besser`,
      action: () => openStatisticsCollection({ series: dna.bestQualitySeries.series, conditionCodes: ["0", "0-1", "1", "1-2"], bannerTitle: dna.bestQualitySeries.series, bannerDescription: "Exemplare in Zustand 1–2 oder besser." })
    } : null,
    dna.biggestSeries ? {
      kicker: "Größte Reihe",
      value: `${dna.biggestSeries.copies}`,
      copy: `${dna.biggestSeries.series} · ${dna.biggestSeries.issues} Ausgaben`,
      action: () => openStatisticsCollection({ series: dna.biggestSeries.series, bannerTitle: dna.biggestSeries.series, bannerDescription: "Deine größte Reihe nach physischen Exemplaren." })
    } : null,
    dna.largestGap ? {
      kicker: "Größte Lücke",
      value: String(dna.largestGap.length),
      copy: `${dna.largestGap.series} · ${formatMissingRun(dna.largestGap)}`,
      action: () => openStatisticsMissingSeries(dna.largestGap.series)
    } : null
  ].filter(Boolean);

  if (!insights.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "Mit mehr erfassten Bänden entstehen hier automatisch persönliche Erkenntnisse.";
    elements.dnaInsights.append(empty);
    return;
  }

  insights.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dna-insight-card";
    const kicker = document.createElement("span"); kicker.textContent = item.kicker;
    const value = document.createElement("strong"); value.textContent = item.value;
    const copy = document.createElement("small"); copy.textContent = item.copy;
    const arrow = document.createElement("span"); arrow.className = "dna-insight-arrow"; arrow.textContent = "›";
    button.append(kicker, value, copy, arrow);
    button.addEventListener("click", item.action);
    elements.dnaInsights.append(button);
  });
}

function renderNearComplete(entries) {
  elements.nearCompleteList.replaceChildren();
  const source = (Array.isArray(entries) ? entries : []).slice(0, 8);
  elements.nearCompleteSummary.textContent = source.length ? `${source.length} Reihen` : "Keine Reihe mit 1–5 Lücken";
  if (!source.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "Sobald einer Reihe höchstens fünf Zielbände fehlen, erscheint sie hier.";
    elements.nearCompleteList.append(empty);
    return;
  }
  source.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "near-complete-row";
    const copy = document.createElement("span");
    const title = document.createElement("strong"); title.textContent = entry.series;
    const detail = document.createElement("small"); detail.textContent = `${entry.presentWithinTarget} von ${entry.target} vorhanden`;
    copy.append(title, detail);
    const side = document.createElement("span");
    side.className = "near-complete-side";
    const missing = document.createElement("strong"); missing.textContent = `${entry.missing} ${entry.missing === 1 ? "fehlt" : "fehlen"}`;
    const percentage = document.createElement("small"); percentage.textContent = `${Math.round(entry.percentage)} %`;
    side.append(missing, percentage);
    button.append(copy, side);
    button.addEventListener("click", () => openStatisticsMissingSeries(entry.series));
    elements.nearCompleteList.append(button);
  });
}

function renderQualityMap(seriesEntries) {
  elements.qualityMapLegend.replaceChildren();
  QUALITY_BUCKETS.forEach((bucket) => {
    const chip = document.createElement("span");
    chip.className = `quality-map-legend-item quality-bucket-${bucket.id}`;
    chip.textContent = bucket.label;
    elements.qualityMapLegend.append(chip);
  });

  elements.qualityMap.replaceChildren();
  const rows = [...(Array.isArray(seriesEntries) ? seriesEntries : [])]
    .filter((entry) => entry.copies > 0)
    .sort((a, b) => b.copies - a.copies || a.series.localeCompare(b.series, "de"))
    .slice(0, 12);
  if (!rows.length) {
    const empty = document.createElement("p"); empty.className = "muted-copy"; empty.textContent = "Noch keine Zustandsdaten vorhanden.";
    elements.qualityMap.append(empty);
    return;
  }

  rows.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "quality-map-row";
    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "quality-map-series";
    const title = document.createElement("strong"); title.textContent = entry.series;
    const meta = document.createElement("small"); meta.textContent = `${entry.copies} Exemplare`;
    heading.append(title, meta);
    heading.addEventListener("click", () => openStatisticsCollection({ series: entry.series, bannerTitle: entry.series, bannerDescription: `${entry.copies} physische Exemplare.` }));
    row.append(heading);

    const cells = document.createElement("div");
    cells.className = "quality-map-cells";
    QUALITY_BUCKETS.forEach((bucket) => {
      const count = entry.qualityBuckets[bucket.id] || 0;
      const percentage = entry.copies ? (count / entry.copies) * 100 : 0;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `quality-map-cell quality-bucket-${bucket.id}`;
      cell.disabled = count === 0;
      cell.title = `${bucket.label}: ${count} Exemplare`;
      cell.setAttribute("aria-label", `${entry.series}, ${bucket.label}: ${count} Exemplare. Bände öffnen`);
      const value = document.createElement("strong"); value.textContent = String(count);
      const rate = document.createElement("small"); rate.textContent = `${Math.round(percentage)} %`;
      cell.append(value, rate);
      if (count > 0) {
        cell.addEventListener("click", () => openStatisticsCollection({
          series: entry.series,
          conditionCodes: [...bucket.codes],
          bannerTitle: `${entry.series}: ${bucket.label}`,
          bannerDescription: `${count} Exemplare in diesem Zustandsbereich.`
        }));
      }
      cells.append(cell);
    });
    row.append(cells);
    elements.qualityMap.append(row);
  });
}

function openStatisticsCollection(presets = {}) {
  openCollectionPage("all", {
    ...presets,
    returnTarget: "statistics",
    title: presets.title || "Statistische Auswahl"
  });
}

function openStatisticsMissingSeries(series) {
  state.missingReturnTarget = "statistics";
  state.missingScope = "all";
  state.openMissingSeries = new Set([series]);
  elements.missingPageTitle.textContent = `Fehlende Bände · ${series}`;
  renderMissingBands({ forceOpenSeries: series });
  elements.missingPage.classList.remove("hidden");
  elements.missingPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.missingPage.scrollTop = 0;
  window.setTimeout(() => {
    const details = [...elements.missingList.querySelectorAll("details[data-series]")]
      .find((entry) => entry.dataset.series === series);
    details?.scrollIntoView({ block: "start" });
    elements.closeMissingPage.focus({ preventScroll: true });
  }, 0);
}


function renderHorizontalChart(container, data, options = {}) {
  container.replaceChildren();
  if (!data.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = options.empty || "Noch keine Daten vorhanden.";
    container.append(empty);
    return;
  }
  const maximum = Number(options.maximum) || Math.max(...data.map((item) => Number(item.value) || 0), 1);
  data.forEach((item) => {
    const row = document.createElement(item.action ? "button" : "div");
    if (item.action) row.type = "button";
    row.className = `horizontal-chart-row${item.action ? " is-interactive" : ""}`;
    const heading = document.createElement("div");
    heading.className = "horizontal-chart-heading";
    const label = document.createElement("span"); label.textContent = item.label;
    const value = document.createElement("strong"); value.textContent = item.display ?? String(item.value);
    heading.append(label, value);
    const track = document.createElement("div");
    track.className = "horizontal-chart-track";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(2, Math.min(100, ((Number(item.value) || 0) / maximum) * 100))}%`;
    track.append(fill);
    row.append(heading, track);
    if (item.detail) {
      const detail = document.createElement("small");
      detail.textContent = item.detail;
      row.append(detail);
    }
    if (item.action) row.addEventListener("click", item.action);
    container.append(row);
  });
}



function openDuplicateModal(comic) {
  const comicView = toLegacyComic(comic);
  state.selectedCopyComicId = comicView.id;
  state.copyManagerDraft = getComicCopies(comic).map((copy, index) => normalizeCopy({ ...copy }, {
    issueId: comicView.id,
    position: index + 1,
    createdAt: comicView.createdAt,
    updatedAt: comicView.updatedAt
  }));
  if (state.copyManagerDraft.length === 0) {
    state.copyManagerDraft = [normalizeCopy({
      id: createEntityId(`${comicView.id}-copy`),
      issueId: comicView.id,
      condition: comicView.condition || DEFAULT_CONDITION_CODE,
      isRead: comicView.isRead,
      isSealed: comicView.isSealed
    }, { issueId: comicView.id, position: 1 })];
  }
  elements.duplicateContext.textContent = `${comicView.series} · Band ${comicView.volumeNumber}${comicView.title ? ` · ${comicView.title}` : ""}`;
  elements.duplicateMessage.textContent = "";
  renderCopyManager();
  elements.duplicateModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.copyManagerList.querySelector("select")?.focus(), 0);
}

function closeDuplicateModal() {
  elements.duplicateModal.classList.add("hidden");
  state.selectedCopyComicId = null;
  state.copyManagerDraft = [];
  elements.copyManagerList.replaceChildren();
  elements.duplicateMessage.textContent = "";
  restoreBodyModalState();
}

function renderCopyManager() {
  elements.copyManagerList.replaceChildren();
  state.copyManagerDraft.forEach((copy, index) => {
    const card = document.createElement("article");
    card.className = "copy-manager-item";
    card.dataset.copyIndex = String(index);

    const heading = document.createElement("div");
    heading.className = "copy-manager-heading";
    const title = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = `Exemplar ${index + 1}`;
    const subtitle = document.createElement("small");
    subtitle.textContent = index === 0 ? "Hauptexemplar für Karten und Schnellfilter" : "Weiteres physisches Exemplar";
    title.append(label, subtitle);
    heading.append(title);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "text-button danger-text compact-button";
    removeButton.dataset.removeCopy = String(index);
    removeButton.textContent = "Entfernen";
    removeButton.disabled = state.copyManagerDraft.length <= 1;
    heading.append(removeButton);

    const fields = document.createElement("div");
    fields.className = "copy-manager-fields";

    const conditionField = document.createElement("div");
    conditionField.className = "field";
    const conditionSelectId = `copy-condition-${index}`;
    const conditionLabelRow = document.createElement("div");
    conditionLabelRow.className = "field-label-row";
    const conditionLabel = document.createElement("label");
    conditionLabel.htmlFor = conditionSelectId;
    conditionLabel.textContent = "Zustand";
    const assistantButton = document.createElement("button");
    assistantButton.type = "button";
    assistantButton.className = "inline-action condition-assistant-trigger";
    assistantButton.dataset.openConditionAssistant = "";
    assistantButton.dataset.assistantCopyIndex = String(index);
    assistantButton.textContent = "Assistent";
    conditionLabelRow.append(conditionLabel, assistantButton);
    const conditionSelect = document.createElement("select");
    conditionSelect.id = conditionSelectId;
    conditionSelect.dataset.copyIndex = String(index);
    conditionSelect.dataset.copyField = "condition";
    APP_CONFIG.conditions.forEach((condition) => {
      conditionSelect.append(createOption(condition.code, `Zustand ${condition.code} – ${condition.label}`));
    });
    conditionSelect.value = normalizeConditionCode(copy.condition, DEFAULT_CONDITION_CODE);
    conditionField.append(conditionLabelRow, conditionSelect);

    const flags = document.createElement("fieldset");
    flags.className = "copy-manager-flags";
    const legend = document.createElement("legend");
    legend.textContent = "Eigenschaften";
    flags.append(legend);
    flags.append(
      createCopyManagerCheckbox(index, "isRead", "Gelesen", copy.isRead),
      createCopyManagerCheckbox(index, "isSealed", "Foliert", copy.isSealed)
    );

    const notesField = document.createElement("label");
    notesField.className = "field field-full";
    const notesLabel = document.createElement("span");
    notesLabel.textContent = "Notiz zu diesem Exemplar";
    const notes = document.createElement("textarea");
    notes.rows = 2;
    notes.maxLength = 1200;
    notes.placeholder = "Optional, z. B. Stempel, Lochung oder Tauschbestand";
    notes.dataset.copyIndex = String(index);
    notes.dataset.copyField = "notes";
    notes.value = copy.notes || "";
    notesField.append(notesLabel, notes);

    fields.append(conditionField, flags, notesField);
    card.append(heading, fields);
    elements.copyManagerList.append(card);
  });

  const count = state.copyManagerDraft.length;
  elements.duplicateSave.textContent = count === 1 ? "Exemplar speichern" : `${count} Exemplare speichern`;
}

function createCopyManagerCheckbox(index, field, labelText, checked) {
  const label = document.createElement("label");
  label.className = "check-row";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.dataset.copyIndex = String(index);
  input.dataset.copyField = field;
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function addCopyManagerCopy() {
  const comic = state.collectionEntries.find((entry) => entry.id === state.selectedCopyComicId);
  if (!comic) return;
  const now = new Date().toISOString();
  const reference = state.copyManagerDraft[0];
  state.copyManagerDraft.push(normalizeCopy({
    id: createEntityId(`${getEntryId(comic)}-copy`),
    issueId: getEntryId(comic),
    condition: reference?.condition || DEFAULT_CONDITION_CODE,
    isRead: false,
    isSealed: false,
    notes: "",
    createdAt: now,
    updatedAt: now
  }, { issueId: getEntryId(comic), position: state.copyManagerDraft.length + 1 }));
  renderCopyManager();
  window.setTimeout(() => elements.copyManagerList.lastElementChild?.querySelector("select")?.focus(), 0);
}

function handleCopyManagerInput(event) {
  const control = event.target.closest("[data-copy-index][data-copy-field]");
  if (!control) return;
  const index = Number(control.dataset.copyIndex);
  const field = control.dataset.copyField;
  const copy = state.copyManagerDraft[index];
  if (!copy || !["condition", "isRead", "isSealed", "notes"].includes(field)) return;
  copy[field] = control.type === "checkbox" ? control.checked : control.value;
  copy.updatedAt = new Date().toISOString();
}

function handleCopyManagerClick(event) {
  const button = event.target.closest("button[data-remove-copy]");
  if (!button) return;
  const index = Number(button.dataset.removeCopy);
  if (!Number.isSafeInteger(index) || !state.copyManagerDraft[index]) return;
  if (state.copyManagerDraft.length <= 1) {
    elements.duplicateMessage.textContent = "Mindestens ein Exemplar muss erhalten bleiben.";
    elements.duplicateMessage.dataset.type = "error";
    return;
  }
  state.copyManagerDraft.splice(index, 1);
  renderCopyManager();
}

async function handleSaveCopyManager(event) {
  event.preventDefault();
  const comic = state.collectionEntries.find((entry) => entry.id === state.selectedCopyComicId);
  if (!comic) return;
  if (state.copyManagerDraft.length === 0) {
    elements.duplicateMessage.textContent = "Mindestens ein Exemplar ist erforderlich.";
    elements.duplicateMessage.dataset.type = "error";
    return;
  }

  const now = new Date().toISOString();
  const copies = state.copyManagerDraft.map((copy, index) => normalizeCopy({
    ...copy,
    issueId: getEntryId(comic),
    updatedAt: now
  }, { issueId: getEntryId(comic), position: index + 1, createdAt: getEntryCreatedAt(comic) }));
  if (copies.some((copy) => !APP_CONFIG.conditions.some((entry) => entry.code === copy.condition))) {
    elements.duplicateMessage.textContent = "Bitte prüfe die Zustände aller Exemplare.";
    elements.duplicateMessage.dataset.type = "error";
    return;
  }

  elements.duplicateSave.disabled = true;
  elements.copyManagerAdd.disabled = true;
  try {
    const primary = copies[0];
    const second = copies[1] || null;
    await saveArchiveEntry({
      ...comic,
      copies,
      copyCount: copies.length,
      condition: primary.condition,
      duplicateCondition: second?.condition || null,
      isRead: primary.isRead,
      isSealed: primary.isSealed,
      isDuplicate: copies.length > 1,
      dataFormatVersion: APP_CONFIG.dataFormatVersion,
      updatedAt: now
    });
    await recordDataChange(1);
    closeDuplicateModal();
    await refreshCollection();
    await refreshArchiveCoreStatus({ showReport: false });
    showToast(copies.length === 1 ? "Exemplar gespeichert." : `${copies.length} Exemplare gespeichert.`, "success");
  } catch (error) {
    elements.duplicateMessage.textContent = `Exemplare konnten nicht gespeichert werden: ${error.message}`;
    elements.duplicateMessage.dataset.type = "error";
  } finally {
    elements.duplicateSave.disabled = false;
    elements.copyManagerAdd.disabled = false;
  }
}

function mergeComicWithMetadata(comic, metadata) {
  const comicView = toLegacyComic(comic);
  const lookupVersion = Number(metadata?.lookupVersion || 0);
  const hasResolvedInfoboxCover = Boolean(
    metadata?.found
    && lookupVersion >= DUCKIPEDIA_LOOKUP_VERSION
    && metadata?.coverUrl
  );
  const hasConfirmedNoInfoboxCover = Boolean(
    metadata?.found
    && lookupVersion >= DUCKIPEDIA_LOOKUP_VERSION
    && !metadata?.coverUrl
    && !metadata?.coverFileName
  );
  const hasAuthoritativeCoverResult = hasResolvedInfoboxCover || hasConfirmedNoInfoboxCover;
  const nextCoverUrl = hasAuthoritativeCoverResult
    ? String(metadata.coverUrl || "")
    : String(metadata?.coverUrl || comicView.duckipediaCoverUrl || "");

  const nextValues = {
    title: comicView.title || metadata.title || "",
    publicationYear: comicView.publicationYear || metadata.publicationYear || null,
    duckipediaPageUrl: metadata.pageUrl || comicView.duckipediaPageUrl || createConfiguredDuckipediaUrl(comicView.series, comicView.volumeNumber, comicView.title),
    duckipediaCoverUrl: nextCoverUrl,
    duckipediaCoverFileName: hasAuthoritativeCoverResult ? String(metadata.coverFileName || "") : String(comicView.duckipediaCoverFileName || ""),
    duckipediaCoverSource: hasAuthoritativeCoverResult ? String(metadata.coverSource || "") : String(comicView.duckipediaCoverSource || ""),
    duckipediaCoverLookupVersion: hasAuthoritativeCoverResult ? lookupVersion : Number(comicView.duckipediaCoverLookupVersion || 0),
    metadataStatus: metadata.found ? "found" : "not-found",
    metadataFetchedAt: metadata.fetchedAt || comicView.metadataFetchedAt || new Date().toISOString(),
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  };
  const changed = Object.entries(nextValues).some(([key, value]) => comicView[key] !== value);
  return {
    changed,
    comic: changed ? { ...comicView, ...nextValues, updatedAt: new Date().toISOString() } : comicView
  };
}

async function resolveShelfCoverUrl(comic, { force = false } = {}) {
  if (!comic || !getEntryId(comic) || !getEntryNumericBandNumber(comic)) return "";

  // Only a cover produced by the current infobox lookup may skip validation.
  // Older URLs can originate from PageImages and are repaired automatically.
  const storedLookupVersion = getEntryDuckipediaCoverLookupVersion(comic);
  if (!force && storedLookupVersion >= DUCKIPEDIA_LOOKUP_VERSION) {
    return getEntryDuckipediaCoverUrl(comic) || "";
  }

  // A previously stored URL is still useful while offline or when automatic
  // enrichment is disabled. It is not marked as validated, so the next online
  // session can replace it with the cover declared by the Duckipedia infobox.
  if (state.settings.duckipediaAutoEnrich === false || !navigator.onLine) {
    return getEntryDuckipediaCoverUrl(comic) || "";
  }

  const existingPromise = state.shelfCoverResolutionPromises.get(getEntryId(comic));
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const metadata = await getMetadataForBand(getEntrySeriesName(comic), getEntryNumericBandNumber(comic), { force });
      const currentComic = state.collectionEntries.find((entry) => getEntryId(entry) === getEntryId(comic)) || comic;
      const { comic: updatedComic, changed } = mergeComicWithMetadata(currentComic, metadata);
      if (changed) {
        const savedEntry = await saveArchiveEntry(updatedComic);
        replaceComicInMemory(savedEntry);
        return getEntryDuckipediaCoverUrl(savedEntry) || "";
      }
      return getEntryDuckipediaCoverUrl(currentComic) || "";
    } catch (error) {
      console.warn(`Cover für ${getEntrySeriesName(comic)}, Band ${getEntryVolumeNumber(comic)} konnte nicht automatisch geladen werden:`, error);
      return getEntryDuckipediaCoverUrl(comic) || "";
    } finally {
      state.shelfCoverResolutionPromises.delete(getEntryId(comic));
    }
  })();

  state.shelfCoverResolutionPromises.set(getEntryId(comic), promise);
  return promise;
}

function replaceComicInMemory(updatedComic) {
  const replace = (items) => {
    const index = items.findIndex((entry) => entry.id === updatedComic.id);
    if (index >= 0) items[index] = updatedComic;
  };
  replace(state.collectionEntries);
  replace(state.filteredComics);
}

async function enrichSingleComic(comic, { force = false, silent = false } = {}) {
  if (!getEntryNumericBandNumber(comic)) {
    if (!silent) showToast("Dieser Eintrag besitzt keine rein numerische Bandnummer.", "error");
    return { changed: false, found: false };
  }

  try {
    const metadata = await getMetadataForBand(getEntrySeriesName(comic), getEntryNumericBandNumber(comic), { force });
    const { comic: updatedComic, changed } = mergeComicWithMetadata(comic, metadata);

    if (changed) {
      const savedEntry = await saveArchiveEntry(updatedComic);
      replaceComicInMemory(savedEntry);
      if (!silent) await recordDataChange(1);
    }

    if (!silent) {
      await refreshCollection();
      await refreshMediaStatus();
      showToast(metadata.found ? "Duckipedia-Daten wurden aktualisiert." : (metadata.reason || "Keine Duckipedia-Daten gefunden."), metadata.found ? "success" : "info");
    }

    return { changed, found: metadata.found };
  } catch (error) {
    console.error("Metadaten konnten nicht aktualisiert werden:", error);
    if (!silent) showToast(`Duckipedia-Aktualisierung fehlgeschlagen: ${error.message}`, "error");
    return { changed: false, found: false, error };
  }
}

function startEditing(comic) {
  const comicView = toLegacyComic(comic);
  state.editingId = comicView.id;
  state.editingComic = comicView;

  elements.series.value = comicView.series;
  elements.volumeNumber.value = comicView.volumeNumber;
  elements.publicationYear.value = comicView.publicationYear ?? "";
  elements.title.value = comicView.title;
  elements.condition.value = comicView.condition;
  elements.duplicateCondition.value = comicView.duplicateCondition || comicView.condition;
  elements.isRead.checked = comicView.isRead;
  elements.isDuplicate.checked = comicView.isDuplicate;
  elements.isSealed.checked = comicView.isSealed;
  elements.notes.value = comicView.notes;
  state.formMetadata = {
    series: comicView.series,
    bandNumber: comicView.numericBandNumber,
    found: comicView.metadataStatus === "found",
    pageUrl: comicView.duckipediaPageUrl || createConfiguredDuckipediaUrl(comicView.series, comicView.volumeNumber, comicView.title),
    coverUrl: comicView.duckipediaCoverUrl || "",
    coverFileName: comicView.duckipediaCoverFileName || "",
    coverSource: comicView.duckipediaCoverSource || "",
    lookupVersion: Number(comicView.duckipediaCoverLookupVersion || 0),
    fetchedAt: comicView.metadataFetchedAt || null
  };
  elements.metadataStatus.textContent = comicView.metadataFetchedAt
    ? `Duckipedia-Daten zuletzt geprüft: ${formatDateTime(comicView.metadataFetchedAt)}.`
    : "Für diesen Eintrag wurden noch keine Duckipedia-Metadaten gespeichert.";
  elements.metadataStatus.dataset.type = "info";
  loadExistingCoverIntoForm(comic);
  updateDuplicateConditionVisibility();

  elements.formTitle.textContent = "Comic bearbeiten";
  elements.cancelEdit.classList.remove("hidden");
  elements.saveNext.classList.add("hidden");
  clearValidationErrors();
  showFormMessage("Du bearbeitest einen vorhandenen Eintrag.");

  openAddPage();
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.series.focus({ preventScroll: true });
}

async function confirmAndDelete(comic) {
  const comicView = toLegacyComic(comic);
  const label = comicView.title
    ? `${comicView.series}, Band ${comicView.volumeNumber} „${comicView.title}“`
    : `${comicView.series}, Band ${comicView.volumeNumber}`;

  const confirmed = window.confirm(
    `Möchtest du ${label} wirklich löschen? Ohne aktuelles JSON-Backup kann dieser Schritt nicht rückgängig gemacht werden.`
  );

  if (!confirmed) {
    return;
  }

  try {
    const hadCover = Boolean(await getCoverMedia(comicView.id));
    await deleteArchiveEntry(comicView.id);
    await recordDataChange(1);
    if (hadCover) await recordMediaChange(1);

    if (state.editingId === comicView.id) {
      resetForm();
    }

    await refreshCollection();
    await refreshArchiveCoreStatus({ showReport: false });
    if (hadCover) await refreshMediaStatus();
    showToast("Comic gelöscht.");
  } catch (error) {
    console.error(error);
    showToast(`Löschen fehlgeschlagen: ${error.message}`, "error");
  }
}

function prepareNextComic(savedComic) {
  const selectedSeries = savedComic.series;
  const nextBandNumber = savedComic.numericBandNumber
    ? String(savedComic.numericBandNumber + 1)
    : "";

  elements.form.reset();
  resetCoverEditorState();
  elements.series.value = selectedSeries;
  elements.volumeNumber.value = nextBandNumber;
  elements.condition.value = savedComic.condition;
  elements.duplicateCondition.value = savedComic.duplicateCondition || savedComic.condition;
  updateDuplicateConditionVisibility();
  state.editingId = null;
  state.editingComic = null;
  clearValidationErrors();
  showFormMessage(
    "Reihe und Zustand bleiben ausgewählt. Die Bandnummer wurde nach Möglichkeit erhöht.",
    "success"
  );
  elements.volumeNumber.focus();
}

function resetForm() {
  window.clearTimeout(state.metadataLookupTimer);
  elements.form.reset();
  resetCoverEditorState();
  elements.condition.value = DEFAULT_CONDITION_CODE;
  elements.duplicateCondition.value = DEFAULT_CONDITION_CODE;
  updateDuplicateConditionVisibility();
  state.editingId = null;
  state.editingComic = null;
  elements.formTitle.textContent = "Comic hinzufügen";
  elements.cancelEdit.classList.add("hidden");
  elements.saveNext.classList.remove("hidden");
  clearValidationErrors();
  showFormMessage("");
}



function updateDuplicateConditionVisibility() {
  const isDuplicate = elements.isDuplicate.checked;
  elements.duplicateConditionField.classList.toggle("hidden", !isDuplicate);
  document.querySelector("#primary-condition-field").classList.toggle("field-full", !isDuplicate);
  elements.duplicateCondition.required = isDuplicate;
  const labelText = document.createTextNode(isDuplicate ? "Zustand Exemplar 1 " : "Zustand ");
  const requiredMark = document.createElement("strong");
  requiredMark.setAttribute("aria-hidden", "true");
  requiredMark.textContent = "*";
  elements.primaryConditionLabel.replaceChildren(labelText, requiredMark);
  if (isDuplicate && !elements.duplicateCondition.value) {
    elements.duplicateCondition.value = elements.condition.value || DEFAULT_CONDITION_CODE;
  }
}


function renderValidationErrors(errors) {
  Object.entries(errors).forEach(([fieldName, message]) => {
    const errorElement = document.querySelector(`#${toKebabCase(fieldName)}-error`);
    const inputElement = elements[fieldName];

    if (errorElement) {
      errorElement.textContent = message;
    }

    if (inputElement) {
      inputElement.setAttribute("aria-invalid", "true");
    }
  });

  const firstInvalidField = Object.keys(errors)[0];
  elements[firstInvalidField]?.focus();
}

function clearValidationErrors() {
  document.querySelectorAll(".field-error").forEach((errorElement) => {
    errorElement.textContent = "";
  });

  [
    elements.series,
    elements.volumeNumber,
    elements.publicationYear,
    elements.title,
    elements.condition,
    elements.duplicateCondition,
    elements.notes
  ].forEach((inputElement) => inputElement.removeAttribute("aria-invalid"));
}


function setFormBusy(isBusy) {
  elements.form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
}

function openSeriesModal() {
  resetCustomSeriesForm();
  renderCustomSeriesList();
  renderStandardSeriesList();
  elements.seriesMessage.textContent = "";
  elements.seriesModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.customSeriesName.focus(), 0);
}

function closeSeriesModal() {
  elements.seriesModal.classList.add("hidden");
  resetCustomSeriesForm();
  elements.seriesMessage.textContent = "";
  restoreBodyModalState();
}

function resetCustomSeriesForm() {
  state.editingCustomSeriesName = "";
  elements.customSeriesOriginalName.value = "";
  elements.customSeriesName.value = "";
  elements.customSeriesPattern.value = "";
  elements.saveCustomSeries.textContent = "Reihe hinzufügen";
  elements.cancelCustomSeriesEdit.classList.add("hidden");
}

async function handleSaveCustomSeries(event) {
  event.preventDefault();
  const name = elements.customSeriesName.value.trim();
  const originalName = state.editingCustomSeriesName;
  const rawPattern = elements.customSeriesPattern.value.trim();
  const pattern = normalizeDuckipediaPattern(rawPattern);
  const allSeries = getAvailableSeries(state.settings, state.collectionEntries)
    .filter((entry) => !originalName || entry.localeCompare(originalName, "de", { sensitivity: "base" }) !== 0);

  if (!name) {
    elements.seriesMessage.textContent = "Bitte gib einen Namen ein.";
    elements.seriesMessage.dataset.type = "error";
    return;
  }

  if (name.length > 100) {
    elements.seriesMessage.textContent = "Der Name darf höchstens 100 Zeichen enthalten.";
    elements.seriesMessage.dataset.type = "error";
    return;
  }

  if (rawPattern && !pattern) {
    elements.seriesMessage.textContent = "Bitte gib nur einen Duckipedia-Pfad oder eine URL von de.duckipedia.org ein.";
    elements.seriesMessage.dataset.type = "error";
    return;
  }

  if (allSeries.some((entry) => entry.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
    elements.seriesMessage.textContent = "Diese Reihe ist bereits vorhanden.";
    elements.seriesMessage.dataset.type = "error";
    return;
  }

  try {
    const currentConfigs = Array.isArray(state.settings.customSeriesConfigs)
      ? [...state.settings.customSeriesConfigs]
      : [];
    const previousConfig = originalName
      ? currentConfigs.find((entry) => entry.name === originalName)
      : null;
    const nextConfig = {
      ...(previousConfig || {}),
      id: previousConfig?.id || createCustomSeriesId(name),
      name,
      duckipediaPattern: pattern,
      category: ["main", "special", "other"].includes(previousConfig?.category)
        ? previousConfig.category
        : "special",
      aliases: Array.isArray(previousConfig?.aliases) ? [...previousConfig.aliases] : [],
      isArchived: false
    };
    let nextConfigs;
    let nextHighest = { ...(state.settings.knownHighestBandBySeries || {}) };
    let nextDetails = { ...(state.settings.missingBandDetails || {}) };
    let nextFleaItems = { ...(state.settings.fleaMarketSession?.items || {}) };

    if (originalName) {
      nextConfigs = currentConfigs.map((entry) => entry.name === originalName ? nextConfig : entry);
      if (name !== originalName) {
        const usedCount = state.collectionEntries.filter((comic) => getEntrySeriesName(comic) === originalName).length;
        if (usedCount > 0 && !window.confirm(`Die Reihe wird von ${usedCount} gespeicherten Bänden verwendet. Alle Einträge in „${name}“ umbenennen?`)) {
          return;
        }
        if (nextHighest[originalName]) {
          nextHighest[name] = nextHighest[originalName];
          delete nextHighest[originalName];
        }

        const oldPrefix = `${encodeURIComponent(originalName)}::`;
        Object.entries(nextDetails).forEach(([key, detail]) => {
          if (!key.startsWith(oldPrefix)) return;
          const bandPart = key.slice(oldPrefix.length);
          nextDetails[`${encodeURIComponent(name)}::${bandPart}`] = detail;
          delete nextDetails[key];
        });

        Object.entries(nextFleaItems).forEach(([key, item]) => {
          if (item?.series !== originalName) return;
          const newKey = createMissingDetailKey(name, item.bandNumber);
          nextFleaItems[newKey] = { ...item, series: name };
          delete nextFleaItems[key];
        });
      }
    } else {
      nextConfigs = [...currentConfigs, nextConfig];
    }

    const temporarySettings = { ...state.settings, customSeriesConfigs: nextConfigs };
    const sourceSeriesName = originalName || name;
    const configuredComics = state.collectionEntries
      .filter((comic) => getEntrySeriesName(comic) === sourceSeriesName)
      .map((comic) => {
        const comicView = toLegacyComic(comic);
        const pageUrl = getEntryNumericBandNumber(comic)
          ? buildDuckipediaUrl(name, getEntryVolumeNumber(comic), getEntryTitle(comic), temporarySettings)
          : getEntryDuckipediaPageUrl(comic);
        const changed = getEntrySeriesName(comic) !== name || getEntryDuckipediaPageUrl(comic) !== pageUrl;
        return changed
          ? {
              ...comicView,
              seriesId: nextConfig.id,
              series: name,
              duckipediaPageUrl: pageUrl,
              dataFormatVersion: APP_CONFIG.dataFormatVersion,
              updatedAt: new Date().toISOString()
            }
          : null;
      })
      .filter(Boolean);

    await saveMeaningfulSettings({
      customSeriesConfigs: nextConfigs,
      knownHighestBandBySeries: nextHighest,
      missingBandDetails: nextDetails,
      fleaMarketSession: {
        items: nextFleaItems,
        updatedAt: state.settings.fleaMarketSession?.updatedAt || null
      }
    }, Math.max(1, configuredComics.length));
    await saveSeriesDefinition(nextConfig);
    if (configuredComics.length > 0) await upsertArchiveEntries(configuredComics);

    if (configuredComics.length > 0) await refreshCollection();
    else {
      populateConfiguration();
      await refreshArchiveCoreStatus({ showReport: false });
    }
    elements.series.value = name;
    elements.seriesMessage.textContent = originalName ? `„${name}“ wurde aktualisiert.` : `„${name}“ wurde hinzugefügt.`;
    elements.seriesMessage.dataset.type = "success";
    resetCustomSeriesForm();
    renderCustomSeriesList();
  } catch (error) {
    elements.seriesMessage.textContent = `Reihe konnte nicht gespeichert werden: ${error.message}`;
    elements.seriesMessage.dataset.type = "error";
  }
}

function renderCustomSeriesList() {
  elements.customSeriesList.replaceChildren();
  const configs = Array.isArray(state.settings.customSeriesConfigs)
    ? state.settings.customSeriesConfigs
    : [];

  if (configs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "Noch keine eigenen Reihen angelegt.";
    elements.customSeriesList.append(empty);
    return;
  }

  configs
    .slice()
    .sort((first, second) => first.name.localeCompare(second.name, "de", { sensitivity: "base" }))
    .forEach((config) => {
      const row = document.createElement("div");
      row.className = "management-row series-management-row";
      const copy = document.createElement("div");
      copy.className = "management-copy";
      const label = document.createElement("strong");
      label.textContent = config.name;
      const path = document.createElement("small");
      path.textContent = config.duckipediaPattern
        ? `Duckipedia: ${config.duckipediaPattern}`
        : "Duckipedia: Suchlink als Fallback";
      const aliases = [...new Set([...(config.aliases || []), ...((state.settings.releaseSeriesAliases || {})[config.id] || [])])];
      copy.append(label, path);
      if (aliases.length) {
        const aliasCopy = document.createElement("small");
        aliasCopy.textContent = `Kalender-Alias${aliases.length === 1 ? "" : "e"}: ${aliases.join(", ")}`;
        copy.append(aliasCopy);
      }

      const actions = document.createElement("div");
      actions.className = "management-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "text-button";
      editButton.dataset.editSeries = config.name;
      editButton.textContent = "Bearbeiten";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "text-button danger-text";
      removeButton.dataset.removeSeries = config.name;
      removeButton.textContent = "Entfernen";
      actions.append(editButton, removeButton);
      row.append(copy, actions);
      elements.customSeriesList.append(row);
    });
}

function renderStandardSeriesList() {
  elements.standardSeriesList.replaceChildren();
  Object.entries(STANDARD_DUCKIPEDIA_PATTERNS).forEach(([name, pattern]) => {
    if (!APP_CONFIG.series.includes(name)) return;
    const row = document.createElement("div");
    row.className = "management-row compact-management-row";
    const label = document.createElement("span");
    label.textContent = name;
    const path = document.createElement("code");
    path.textContent = pattern;
    row.append(label, path);
    elements.standardSeriesList.append(row);
  });
}

function handleCustomSeriesAction(event) {
  const editButton = event.target.closest("button[data-edit-series]");
  if (editButton) {
    const config = (state.settings.customSeriesConfigs || []).find((entry) => entry.name === editButton.dataset.editSeries);
    if (!config) return;
    state.editingCustomSeriesName = config.name;
    elements.customSeriesOriginalName.value = config.name;
    elements.customSeriesName.value = config.name;
    elements.customSeriesPattern.value = config.duckipediaPattern || "";
    elements.saveCustomSeries.textContent = "Änderungen speichern";
    elements.cancelCustomSeriesEdit.classList.remove("hidden");
    elements.customSeriesName.focus();
    return;
  }

  const removeButton = event.target.closest("button[data-remove-series]");
  if (removeButton) handleRemoveCustomSeries(removeButton.dataset.removeSeries);
}

async function handleRemoveCustomSeries(seriesName) {
  const isUsed = state.collectionEntries.some((comic) => getEntrySeriesName(comic) === seriesName);
  const prompt = isUsed
    ? `„${seriesName}“ wird von gespeicherten Comics verwendet. Aus der persönlichen Auswahlliste entfernen und zugehörige Ziele, Fehlband-Details sowie Flohmarkt-Markierungen löschen? Bestehende Comics bleiben erhalten.`
    : `„${seriesName}“ vollständig aus der persönlichen Reihenverwaltung entfernen? Zugehörige Ziele, Fehlband-Details und Flohmarkt-Markierungen werden ebenfalls gelöscht.`;
  if (!window.confirm(prompt)) return;

  try {
    const removedConfig = (state.settings.customSeriesConfigs || []).find((entry) => entry.name === seriesName) || null;
    const removedSeriesId = removedConfig?.id || createCustomSeriesId(seriesName);
    const nextConfigs = (state.settings.customSeriesConfigs || []).filter((entry) => entry.name !== seriesName);
    const nextReleaseAliases = { ...normalizeReleaseSeriesAliases(state.settings.releaseSeriesAliases) };
    delete nextReleaseAliases[removedSeriesId];
    const nextReleaseLinks = Object.fromEntries(
      Object.entries(normalizeReleaseEventLinks(state.settings.releaseEventLinks))
        .filter(([, link]) => link.seriesId !== removedSeriesId)
    );

    const nextHighest = { ...(state.settings.knownHighestBandBySeries || {}) };
    delete nextHighest[seriesName];

    const detailPrefix = `${encodeURIComponent(seriesName)}::`;
    const nextDetails = Object.fromEntries(
      Object.entries(state.settings.missingBandDetails || {})
        .filter(([key]) => !key.startsWith(detailPrefix))
    );

    const nextFleaItems = Object.fromEntries(
      Object.entries(state.settings.fleaMarketSession?.items || {})
        .filter(([, item]) => item?.series !== seriesName)
    );

    const metadataRecords = await getAllMetadataCache();
    const remainingMetadata = metadataRecords.filter((record) => record?.series !== seriesName);
    if (remainingMetadata.length !== metadataRecords.length) {
      await replaceMetadataCache(remainingMetadata);
    }

    await saveMeaningfulSettings({
      customSeriesConfigs: nextConfigs,
      releaseSeriesAliases: nextReleaseAliases,
      releaseEventLinks: nextReleaseLinks,
      knownHighestBandBySeries: nextHighest,
      missingBandDetails: nextDetails,
      fleaMarketSession: {
        items: nextFleaItems,
        updatedAt: state.settings.fleaMarketSession?.updatedAt || null
      }
    });
    await removeSeriesDefinition(removedSeriesId);

    state.openMissingSeries.delete(seriesName);
    state.missingGroups = calculateMissingBands(state.collectionEntries, nextHighest);

    populateConfiguration();
    renderCustomSeriesList();
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
    renderFleaMarketHubStatus();
    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
    await refreshMediaStatus();
    await refreshArchiveCoreStatus({ showReport: false });

    if (state.editingCustomSeriesName === seriesName) resetCustomSeriesForm();
    elements.seriesMessage.textContent = isUsed
      ? `„${seriesName}“ wurde aus der persönlichen Reihenverwaltung entfernt. Bestehende Comics bleiben erhalten; Ziele und Fehlband-Daten wurden gelöscht.`
      : `„${seriesName}“ wurde einschließlich der zugehörigen Ziele und Fehlband-Daten entfernt.`;
    elements.seriesMessage.dataset.type = "success";
  } catch (error) {
    elements.seriesMessage.textContent = `Reihe konnte nicht vollständig entfernt werden: ${error.message}`;
    elements.seriesMessage.dataset.type = "error";
  }
}









function restoreBodyModalState() {
  const anyModalOpen = [
    elements.conditionGuideModal,
    elements.conditionAssistantModal,
    elements.issueDetailModal,
    elements.diagnosticsModal,
    elements.shareCardModal,
    elements.importModal,
    elements.releaseLinkModal,
    elements.seriesModal,
    elements.missingDetailModal,
    elements.duplicateModal,
    elements.scannerModal,
    elements.calendarEventModal,
    elements.archiveMigrationModal
  ].filter(Boolean).some((modal) => !modal.classList.contains("hidden"));
  document.body.classList.toggle("modal-open", anyModalOpen);
}

async function handleCollectionCsvExport() {
  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const result = await shareOrDownloadText({
      content: createCollectionCsv(state.collectionEntries, state.settings),
      filename: createAppFilename("Entenarchiv-Sammlung", "csv"),
      mimeType: "text/csv;charset=utf-8",
      title: "Entenarchiv – Sammlung",
      text: "Meine Entenarchiv-Sammlung als CSV-Datei."
    });
    reportExportResult(result, "Die Sammlung");
  } catch (error) {
    console.error(error);
    showExportMessage(`CSV-Export fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

async function handleMissingCsvExport() {
  const totalMissing = countMissingBands(state.missingGroups);

  if (totalMissing === 0) {
    showExportMessage("Aktuell wurden keine fehlenden Bände erkannt.");
    return;
  }

  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const result = await shareOrDownloadText({
      content: createMissingCsv(state.missingGroups, state.settings),
      filename: createAppFilename("Entenarchiv-Fehlende-Baende", "csv"),
      mimeType: "text/csv;charset=utf-8",
      title: "Entenarchiv – Fehlende Bände",
      text: "Meine Such- und Wunschliste aus Entenarchiv."
    });
    reportExportResult(result, "Die Liste der fehlenden Bände");
  } catch (error) {
    console.error(error);
    showExportMessage(`CSV-Export fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

async function handleMissingPdfExport() {
  const totalMissing = countMissingBands(state.missingGroups);

  if (totalMissing === 0) {
    showExportMessage("Aktuell wurden keine fehlenden Bände erkannt.");
    return;
  }

  setExportButtonsBusy(true);
  showExportMessage("PDF wird gestaltet …");

  try {
    await ensurePdfLibrary();
    const pdfBlob = createMissingPdfBlob(state.missingGroups, state.settings);
    const result = await shareOrDownloadBlob({
      blob: pdfBlob,
      filename: createAppFilename("Entenarchiv-Flohmarkt-Suchliste", "pdf"),
      mimeType: "application/pdf",
      title: "Entenarchiv - Flohmarkt-Suchliste",
      text: "Meine übersichtliche Liste fehlender Bände für Flohmärkte und Comicbörsen."
    });
    reportExportResult(result, "Die Flohmarkt-Suchliste");
  } catch (error) {
    console.error(error);
    recordDiagnosticError(error, "PDF-Export", "warning");
    showExportMessage(`PDF-Export fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

async function handleJsonExport() {
  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const backupTime = new Date().toISOString();
    const nextSettings = {
      ...state.settings,
      lastBackupAt: backupTime,
      changesSinceBackup: 0,
      lastBackupComicCount: state.collectionEntries.length
    };
    const metadataCache = await getAllMetadataCache();
    const result = await shareOrDownloadText({
      content: createJsonBackup(state.collectionEntries, nextSettings, metadataCache),
      filename: createAppFilename("Entenarchiv-Backup", "json"),
      mimeType: "application/json;charset=utf-8",
      title: "Entenarchiv – JSON-Backup",
      text: "Vollständiges Backup meiner Entenarchiv-Daten."
    });

    if (result.method !== "cancelled") {
      state.settings = await saveAppSettings(nextSettings);
      renderBackupStatus();
    }

    reportExportResult(result, "Das JSON-Backup");
  } catch (error) {
    console.error(error);
    showExportMessage(`JSON-Backup fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

function reportExportResult(result, subject) {
  if (result.method === "share") {
    showExportMessage(`${subject} wurde an das iPhone-Teilen-Menü übergeben.`, "success");
  } else if (result.method === "download") {
    showExportMessage(`${subject} wurde als Download bereitgestellt.`, "success");
  } else {
    showExportMessage("Teilen wurde abgebrochen.");
  }
}

function setExportButtonsBusy(isBusy) {
  [
    elements.exportJson,
    elements.exportCsv,
    elements.exportMissingCsv,
    elements.exportMissingPdf,
    elements.openImport
  ].forEach((button) => {
    button.disabled = isBusy;
  });
}

function showExportMessage(message, type = "info") {
  elements.exportMessage.textContent = message;
  elements.exportMessage.dataset.type = type;
}

function openImportModal(event) {
  lazyDom.ensure("import");
  state.importReturnTarget = event?.currentTarget || elements.openImport;
  state.importBackup = null;
  elements.importFile.value = "";
  elements.importSummary.replaceChildren();
  elements.importSummary.classList.add("hidden");
  elements.importIssues.replaceChildren();
  elements.importIssues.classList.add("hidden");
  elements.importSubmit.disabled = true;
  elements.importModeMerge.checked = true;
  elements.importMessage.textContent = "";
  elements.importMessage.dataset.type = "info";
  elements.importModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.importFile.focus(), 0);
}

function closeImportModal() {
  if (!elements.importModal || importInProgress || elements.importModal.classList.contains("hidden")) {
    return;
  }

  elements.importModal.classList.add("hidden");
  restoreBodyModalState();
  (state.importReturnTarget || elements.openImport).focus();
  state.importReturnTarget = null;
}

async function handleImportFileSelection() {
  const file = elements.importFile.files?.[0];
  state.importBackup = null;
  elements.importSubmit.disabled = true;
  elements.importSummary.replaceChildren();
  elements.importSummary.classList.add("hidden");
  elements.importIssues.replaceChildren();
  elements.importIssues.classList.add("hidden");
  elements.importMessage.textContent = "Datei wird geprüft …";
  elements.importMessage.dataset.type = "info";

  if (!file) {
    elements.importMessage.textContent = "";
    return;
  }

  try {
    const backup = await readAndValidateBackupFile(file);
    state.importBackup = backup;
    elements.importSubmit.disabled = false;
    elements.importMessage.textContent = "Die Datei ist gültig und kann importiert werden.";
    elements.importMessage.dataset.type = "success";
    renderImportSummary(backup, file.name);
  } catch (error) {
    console.error(error);
    const message = error instanceof BackupValidationError
      ? error.message
      : `Datei konnte nicht gelesen werden: ${error.message}`;
    elements.importMessage.textContent = message;
    elements.importMessage.dataset.type = "error";
    renderImportIssues(error.issues || []);
  }
}

function renderImportSummary(backup, filename) {
  const filenameLine = document.createElement("p");
  filenameLine.textContent = `Datei: ${filename}`;

  const typeLine = document.createElement("p");
  typeLine.textContent = backup.hasMedia
    ? `Backup-Typ: vollständig mit ${backup.covers.length} eigenen Coverfotos`
    : "Backup-Typ: Sammlungsdaten ohne eigene Coverfotos";

  const countLine = document.createElement("p");
  const physicalCopyCount = backup.comics.reduce((sum, comic) => sum + getComicCopies(comic).length, 0);
  countLine.textContent = `${backup.comics.length} Ausgaben · ${physicalCopyCount} physische Exemplare`;

  const cacheLine = document.createElement("p");
  cacheLine.textContent = `Duckipedia-Cache: ${backup.metadataCache.length} Einträge`;

  const versionLine = document.createElement("p");
  versionLine.textContent = backup.hasArchiveCore
    ? `Datenformat ${backup.dataFormatVersion} · Archivmodell ${backup.archiveModelVersion}`
    : `Datenformat ${backup.dataFormatVersion} · wird beim Import auf den Archivkern übertragen`;

  const dateLine = document.createElement("p");
  dateLine.textContent = backup.exportedAt
    ? `Exportiert: ${formatDateTime(backup.exportedAt)}`
    : "Exportdatum: nicht enthalten";

  elements.importSummary.replaceChildren(filenameLine, typeLine, countLine, cacheLine, versionLine, dateLine);
  elements.importSummary.classList.remove("hidden");
}

function renderImportIssues(issues) {
  if (!issues.length) {
    return;
  }

  issues.forEach((issue) => {
    const item = document.createElement("li");
    item.textContent = issue;
    elements.importIssues.append(item);
  });
  elements.importIssues.classList.remove("hidden");
}

async function handleImportSubmit() {
  if (!state.importBackup || importInProgress) {
    return;
  }

  const mode = elements.importModeReplace.checked ? "replace" : "merge";
  const confirmationText = mode === "replace"
    ? `Die aktuelle Sammlung mit ${state.collectionEntries.length} Einträgen wird vollständig ersetzt. Fortfahren?`
    : `Das Backup mit ${state.importBackup.comics.length} Einträgen wird mit deiner Sammlung zusammengeführt. Fortfahren?`;

  if (!window.confirm(confirmationText)) {
    return;
  }

  importInProgress = true;
  setImportControlsBusy(true);
  elements.importMessage.textContent = "Import läuft …";
  elements.importMessage.dataset.type = "info";

  try {
    let resultMessage;
    let importedChangeAmount = 0;
    let mergeResult = null;

    if (mode === "replace") {
      await replaceArchiveEntriesFromLegacy(state.importBackup.comics);
      resultMessage = `${state.importBackup.comics.length} Einträge wurden wiederhergestellt.`;
    } else {
      mergeResult = mergeCollections(state.collectionEntries, state.importBackup.comics);
      await replaceArchiveEntriesFromLegacy(mergeResult.comics);
      importedChangeAmount = mergeResult.added + mergeResult.updated;
      resultMessage = `${mergeResult.added} Ausgaben hinzugefügt, ${mergeResult.updated} aktualisiert`
        + (mergeResult.copiesAdded ? `, ${mergeResult.copiesAdded} zusätzliche Exemplare übernommen` : "")
        + `, ${mergeResult.skipped} übersprungen.`;
    }

    if (state.importBackup.hasMetadataCache) {
      if (mode === "replace") {
        await replaceMetadataCache(state.importBackup.metadataCache);
      } else {
        await upsertMetadataCache(state.importBackup.metadataCache);
      }
    }

    const storedComicsAfterImport = (mode === "replace" || state.importBackup.hasMedia)
      ? (await getArchiveRuntimeCollection()).entries
      : null;

    if (mode === "replace" && !state.importBackup.hasMedia) {
      const validComicIds = new Set((storedComicsAfterImport || []).map((comic) => comic.id));
      const existingCovers = await getAllCoverMedia();
      await replaceAllCoverMedia(existingCovers.filter((cover) => validComicIds.has(cover.comicId)));
    }

    if (state.importBackup.hasMedia) {
      const importedComicIds = new Set((storedComicsAfterImport || (await getArchiveRuntimeCollection()).entries).map((comic) => comic.id));
      const coverIdMap = mode === "merge"
        ? (mergeResult?.idMap || {})
        : createImportedIssueIdMap(state.importBackup.comics, storedComicsAfterImport || []);
      const coverRecords = state.importBackup.covers
        .map((cover) => ({
          ...cover,
          comicId: coverIdMap[cover.comicId] || cover.comicId
        }))
        .filter((cover) => importedComicIds.has(cover.comicId))
        .map((cover) => {
          const blob = dataUrlToBlob(cover.dataUrl);
          return {
            comicId: cover.comicId,
            blob,
            mimeType: cover.mimeType || blob.type,
            size: cover.size || blob.size,
            width: cover.width || 0,
            height: cover.height || 0,
            updatedAt: cover.updatedAt || new Date().toISOString(),
            source: "import"
          };
        });

      if (mode === "replace") {
        await replaceAllCoverMedia(coverRecords);
      } else {
        await upsertCoverMedia(coverRecords);
      }
    }

    const nextSettings = mergeImportedSettings(mode, state.importBackup, importedChangeAmount);
    state.settings = await saveAppSettings(nextSettings);
    applyTheme(state.settings.theme);
    persistThemeLocally(state.settings.theme);
    populateConfiguration();
    resetFilters();
    resetForm();
    await refreshCollection();
    await refreshArchiveCoreStatus({ showReport: false });
    renderBackupStatus();
    await refreshMediaStatus();

    importInProgress = false;
    setImportControlsBusy(false);
    closeImportModal();
    showToast(`Import abgeschlossen: ${resultMessage}`);
  } catch (error) {
    console.error(error);
    elements.importMessage.textContent = `Import fehlgeschlagen: ${error.message}`;
    elements.importMessage.dataset.type = "error";
    importInProgress = false;
    setImportControlsBusy(false);
  }
}

function createImportedIssueIdMap(importedComics, storedComics) {
  const targetsById = new Map((storedComics || []).map((comic) => [String(comic.id), comic]));
  const targetsByIdentity = new Map((storedComics || []).map((comic) => [createImportIssueIdentity(comic), comic]));
  return Object.fromEntries((importedComics || []).map((comic) => {
    const direct = targetsById.get(String(comic.id));
    const target = direct || targetsByIdentity.get(createImportIssueIdentity(comic));
    return [String(comic.id), target?.id || String(comic.id)];
  }));
}

function createImportIssueIdentity(comic) {
  const seriesId = comic?.seriesId
    || resolveConfiguredSeriesId(comic?.series)
    || createCustomSeriesId(comic?.series || "Sonstige");
  return createIssueIdentityKey(seriesId, comic?.volumeNumber);
}

function mergeReleaseSeriesAliasMaps(first, second) {
  const left = normalizeReleaseSeriesAliases(first);
  const right = normalizeReleaseSeriesAliases(second);
  const merged = { ...left };
  Object.entries(right).forEach(([seriesId, aliases]) => {
    merged[seriesId] = [...new Set([...(merged[seriesId] || []), ...aliases])];
  });
  return merged;
}

function mergeImportedSettings(mode, backup, importedChangeAmount = 0) {
  const importedSettings = backup.settings || {};

  if (mode === "replace") {
    return {
      ...importedSettings,
      lastBackupAt: importedSettings.lastBackupAt || backup.exportedAt || state.settings.lastBackupAt,
      changesSinceBackup: 0,
      mediaChangesSinceBackup: backup.hasMedia ? 0 : (importedSettings.mediaChangesSinceBackup || state.settings.mediaChangesSinceBackup || 0),
      lastMediaBackupAt: backup.hasMedia ? (importedSettings.lastMediaBackupAt || backup.exportedAt || state.settings.lastMediaBackupAt) : state.settings.lastMediaBackupAt,
      lastBackupComicCount: backup.comics.length
    };
  }

  const customConfigMap = new Map();
  [...(state.settings.customSeriesConfigs || []), ...(importedSettings.customSeriesConfigs || [])]
    .forEach((entry) => {
      if (entry?.name) customConfigMap.set(entry.name.toLocaleLowerCase("de"), entry);
    });
  const mergedCustomSeriesConfigs = [...customConfigMap.values()];

  return {
    ...state.settings,
    customSeriesConfigs: mergedCustomSeriesConfigs,
    knownHighestBandBySeries: {
      ...(state.settings.knownHighestBandBySeries || {}),
      ...(importedSettings.knownHighestBandBySeries || {})
    },
    missingBandDetails: {
      ...(state.settings.missingBandDetails || {}),
      ...(importedSettings.missingBandDetails || {})
    },
    fleaMarketSession: {
      items: {
        ...(state.settings.fleaMarketSession?.items || {}),
        ...(importedSettings.fleaMarketSession?.items || {})
      },
      updatedAt: importedSettings.fleaMarketSession?.updatedAt || state.settings.fleaMarketSession?.updatedAt || null
    },
    releaseSeriesAliases: mergeReleaseSeriesAliasMaps(state.settings.releaseSeriesAliases, importedSettings.releaseSeriesAliases),
    releaseEventLinks: {
      ...normalizeReleaseEventLinks(state.settings.releaseEventLinks),
      ...normalizeReleaseEventLinks(importedSettings.releaseEventLinks)
    },
    releaseRadarDecisions: {
      ...normalizeReleaseDecisionMap(state.settings.releaseRadarDecisions),
      ...normalizeReleaseDecisionMap(importedSettings.releaseRadarDecisions)
    },
    releaseRadarKnownSignatures: mergeKnownReleaseSignatures(
      state.settings.releaseRadarKnownSignatures,
      (importedSettings.releaseRadarKnownSignatures || []).map((signature) => ({ signature }))
    ),
    milestoneSeenIds: [...new Set([
      ...normalizeMilestoneIds(state.settings.milestoneSeenIds),
      ...normalizeMilestoneIds(importedSettings.milestoneSeenIds)
    ])],
    milestonesInitializedAt: state.settings.milestonesInitializedAt || importedSettings.milestonesInitializedAt || null,
    showCovers: importedSettings.showCovers ?? state.settings.showCovers,
    duckipediaAutoEnrich: importedSettings.duckipediaAutoEnrich ?? state.settings.duckipediaAutoEnrich,
    lastMediaBackupAt: backup.hasMedia ? (importedSettings.lastMediaBackupAt || backup.exportedAt || state.settings.lastMediaBackupAt) : state.settings.lastMediaBackupAt,
    mediaChangesSinceBackup: backup.hasMedia ? 0 : (state.settings.mediaChangesSinceBackup || 0),
    changesSinceBackup: Math.min(999999, (state.settings.changesSinceBackup || 0) + importedChangeAmount),
    lastBackupComicCount: state.settings.lastBackupComicCount || 0
  };
}

function setImportControlsBusy(isBusy) {
  elements.importFile.disabled = isBusy;
  elements.importModeMerge.disabled = isBusy;
  elements.importModeReplace.disabled = isBusy;
  elements.importSubmit.disabled = isBusy;
  elements.closeImport.disabled = isBusy;
  elements.importModal.querySelectorAll("[data-close-import]").forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = isBusy;
    }
  });
}

function renderBackupStatus() {
  const lastBackupAt = state.settings.lastBackupAt;
  const changes = Number.isSafeInteger(state.settings.changesSinceBackup)
    ? state.settings.changesSinceBackup
    : 0;
  const hasCollectionData = state.collectionEntries.length > 0;
  const daysSinceBackup = lastBackupAt
    ? Math.floor((Date.now() - Date.parse(lastBackupAt)) / 86400000)
    : null;
  const needsBackup = hasCollectionData && (
    !lastBackupAt ||
    changes >= 25 ||
    (changes > 0 && daysSinceBackup !== null && daysSinceBackup >= 14)
  );

  elements.lastBackup.textContent = lastBackupAt
    ? formatDateTime(lastBackupAt)
    : "Noch keines";
  elements.backupChangeCount.textContent = changes === 1
    ? "1 Änderung seit dem letzten Backup"
    : `${changes} Änderungen seit dem letzten Backup`;

  if (!hasCollectionData) {
    elements.backupHealth.textContent = "Noch nicht erforderlich";
  } else if (!lastBackupAt) {
    elements.backupHealth.textContent = "Erstes Backup fehlt";
  } else if (needsBackup) {
    elements.backupHealth.textContent = "Backup empfohlen";
  } else {
    elements.backupHealth.textContent = "Aktuell gesichert";
  }

  elements.backupReminder.classList.toggle("hidden", !needsBackup);
  if (needsBackup) {
    if (!lastBackupAt) {
      elements.backupReminderText.textContent = `Deine Sammlung enthält ${formatEntryCount(state.collectionEntries.length)}, aber noch kein JSON-Backup.`;
    } else if (changes >= 25) {
      elements.backupReminderText.textContent = `Seit dem letzten Backup wurden ${changes} Änderungen vorgenommen.`;
    } else {
      elements.backupReminderText.textContent = `Das letzte Backup ist ${daysSinceBackup} Tage alt und seitdem wurde die Sammlung geändert.`;
    }
  }
}

async function refreshStorageStatus() {
  if (!navigator.storage) {
    elements.storagePersistence.textContent = "Nicht abrufbar";
    elements.storageUsage.textContent = "Regelmäßige Backups bleiben erforderlich.";
    elements.requestPersistence.classList.add("hidden");
    return;
  }

  try {
    const persisted = typeof navigator.storage.persisted === "function"
      ? await navigator.storage.persisted()
      : false;

    elements.storagePersistence.textContent = persisted ? "Dauerhaft angefragt" : "Best Effort";
    elements.requestPersistence.classList.toggle(
      "hidden",
      persisted || typeof navigator.storage.persist !== "function"
    );

    if (typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      const usage = Number(estimate.usage || 0);
      const quota = Number(estimate.quota || 0);
      elements.storageUsage.textContent = quota > 0
        ? `${formatBytes(usage)} von ungefähr ${formatBytes(quota)} genutzt.`
        : `${formatBytes(usage)} genutzt.`;
    } else {
      elements.storageUsage.textContent = "Speicherumfang konnte nicht ermittelt werden.";
    }
  } catch (error) {
    console.warn("Speicherstatus konnte nicht ermittelt werden:", error);
    elements.storagePersistence.textContent = "Nicht abrufbar";
    elements.storageUsage.textContent = "Regelmäßige Backups bleiben erforderlich.";
  }
}

async function handlePersistenceRequest() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    showExportMessage("Dieser Browser bietet keine anfragbare dauerhafte Speicherung.");
    return;
  }

  elements.requestPersistence.disabled = true;

  try {
    const granted = await navigator.storage.persist();
    showExportMessage(
      granted
        ? "Der Browser hat den dauerhaften Speichermodus gewährt. Backups bleiben trotzdem wichtig."
        : "Der Browser hat den dauerhaften Speichermodus nicht gewährt. Nutze regelmäßig JSON-Backups.",
      granted ? "success" : "info"
    );
    await refreshStorageStatus();
  } catch (error) {
    console.error(error);
    showExportMessage(`Speicherschutz konnte nicht angefragt werden: ${error.message}`, "error");
  } finally {
    elements.requestPersistence.disabled = false;
  }
}



function showFormMessage(message, type = "info") {
  elements.formMessage.textContent = message;
  elements.formMessage.dataset.type = type;
}

function showToast(message, type = "success") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.classList.add("toast-visible");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast-visible");
  }, 3800);
}


function applyStoredTheme() {
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht gelesen werden:", error);
  }

  applyTheme(storedTheme === "light" ? "light" : "dark");
}

async function toggleTheme() {
  const nextTheme = elements.html.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  persistThemeLocally(nextTheme);

  try {
    state.settings = await saveAppSettings({ ...state.settings, theme: nextTheme });
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht in IndexedDB gespeichert werden:", error);
  }
}

function persistThemeLocally(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht lokal gespeichert werden:", error);
  }
}

function applyTheme(theme) {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  elements.html.dataset.theme = normalizedTheme;
  elements.themeIcon.textContent = normalizedTheme === "dark" ? "☀︎" : "☾";
  elements.themeToggle.setAttribute(
    "aria-label",
    normalizedTheme === "dark" ? "Helle Darstellung aktivieren" : "Dunkle Darstellung aktivieren"
  );

  const themeColor = normalizedTheme === "dark" ? "#0b1020" : "#f7f4ee";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", themeColor);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
      const activateUpdate = (worker) => {
        if (!worker) return;
        state.waitingServiceWorker = worker;
        worker.postMessage({ type: "SKIP_WAITING" });
      };

      if (registration.waiting) activateUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) activateUpdate(installingWorker);
        });
      });

      let hasReloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloaded) return;
        hasReloaded = true;
        window.location.reload();
      });
      await registration.update();
    } catch (error) {
      console.error("Service Worker konnte nicht registriert werden:", error);
      recordDiagnosticError(error, "Service Worker registrieren", "warning");
    }
  });
}

function renderCalendarOverview() {
  return calendarFeature.renderOverview();
}

function openCalendarPage() {
  return calendarFeature.open();
}

function closeCalendarPage(options) {
  return calendarFeature.close(options);
}

function renderCalendarPage() {
  return calendarFeature.render();
}

function initializeReleaseRadarIfNeeded() {
  return calendarFeature.initializeReleaseRadar();
}

function renderReleaseRadarIndicators() {
  return calendarFeature.renderReleaseRadarIndicators();
}

function openReleaseRadarPage(options) {
  return calendarFeature.openReleaseRadar(options);
}

function closeReleaseRadarPage(options) {
  return calendarFeature.closeReleaseRadar(options);
}
