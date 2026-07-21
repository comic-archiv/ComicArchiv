import {
  APP_CONFIG,
  DEFAULT_SETTINGS,
  STANDARD_DUCKIPEDIA_PATTERNS,
  createDuckipediaUrl as buildDuckipediaUrl,
  createMetadataCacheKey,
  createMissingDetailKey,
  getAvailableSeries,
  getConditionLabel,
  getConditionRank,
  normalizeDuckipediaPattern
} from "./config.js";
import {
  clearAllCoverMedia,
  clearMetadataCache,
  deleteComic,
  deleteCoverMedia,
  getAllComics,
  getAllCoverMedia,
  getAllMetadataCache,
  getAppSettings,
  getCoverMedia,
  getCoverMediaStats,
  getMetadataCache,
  replaceAllComics,
  replaceAllCoverMedia,
  replaceMetadataCache,
  saveAppSettings,
  saveComic,
  saveCoverMedia,
  saveMetadataCache,
  upsertComics,
  upsertCoverMedia,
  upsertMetadataCache
} from "./storage.js";
import { calculateMissingBands, countMissingBands } from "./missing.js";
import { lookupDuckipediaMetadata } from "./duckipedia.js";
import { MagazineBarcodeScanner, parseSupplementToBandNumber } from "./scanner.js";
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

const THEME_STORAGE_KEY = "comicarchiv-theme";

const state = {
  comics: [],
  filteredComics: [],
  missingGroups: [],
  settings: {
    ...DEFAULT_SETTINGS,
    customSeries: [],
    customSeriesConfigs: [],
    knownHighestBandBySeries: {},
    missingBandDetails: {},
    fleaMarketSession: { items: {}, updatedAt: null }
  },
  editingId: null,
  editingComic: null,
  importBackup: null,
  importReturnTarget: null,
  waitingServiceWorker: null,
  selectedMissingBand: null,
  scannerResult: null,
  scannerLookupController: null,
  scannerQueue: [],
  formMetadata: null,
  pendingCover: null,
  removeCoverRequested: false,
  formCoverObjectUrl: null,
  formHasLocalCover: false,
  cardCoverObjectUrls: new Set(),
  metadataLookupTimer: null,
  enrichmentRunning: false,
  collectionScope: "main",
  missingScope: "main",
  openMissingSeries: new Set(),
  missingLookupSequence: 0,
  fleaMarketScope: "all",
  selectedDuplicateComicId: null,
  editingCustomSeriesName: ""
};

const elements = {
  html: document.documentElement,
  form: document.querySelector("#comic-form"),
  formTitle: document.querySelector("#form-title"),
  formMessage: document.querySelector("#form-message"),
  series: document.querySelector("#series"),
  volumeNumber: document.querySelector("#volume-number"),
  publicationYear: document.querySelector("#publication-year"),
  title: document.querySelector("#title"),
  coverFile: document.querySelector("#cover-file"),
  formCoverPreview: document.querySelector("#form-cover-preview"),
  formCoverPlaceholder: document.querySelector("#form-cover-placeholder"),
  removeCover: document.querySelector("#remove-cover"),
  coverStatus: document.querySelector("#cover-status"),
  lookupMetadata: document.querySelector("#lookup-metadata"),
  metadataStatus: document.querySelector("#metadata-status"),
  condition: document.querySelector("#condition"),
  duplicateCondition: document.querySelector("#duplicate-condition"),
  duplicateConditionField: document.querySelector("#duplicate-condition-field"),
  primaryConditionLabel: document.querySelector("#primary-condition-label"),
  isRead: document.querySelector("#is-read"),
  isDuplicate: document.querySelector("#is-duplicate"),
  isSealed: document.querySelector("#is-sealed"),
  notes: document.querySelector("#notes"),
  saveNext: document.querySelector("#save-next"),
  cancelEdit: document.querySelector("#cancel-edit"),
  comicList: document.querySelector("#comic-list"),
  collectionPage: document.querySelector("#collection-page"),
  collectionPageTitle: document.querySelector("#collection-page-title"),
  closeCollection: document.querySelector("#close-collection"),
  openMainCollection: document.querySelector("#open-main-collection"),
  openOtherCollection: document.querySelector("#open-other-collection"),
  mainCollectionCount: document.querySelector("#main-collection-count"),
  otherCollectionCount: document.querySelector("#other-collection-count"),
  emptyState: document.querySelector("#empty-state"),
  noResults: document.querySelector("#no-results"),
  collectionCount: document.querySelector("#collection-count"),
  search: document.querySelector("#search"),
  filterSeries: document.querySelector("#filter-series"),
  filterSeriesField: document.querySelector("#filter-series-field"),
  filterCondition: document.querySelector("#filter-condition"),
  filterRead: document.querySelector("#filter-read"),
  filterSealed: document.querySelector("#filter-sealed"),
  filterDuplicate: document.querySelector("#filter-duplicate"),
  sortBy: document.querySelector("#sort-by"),
  resetFilters: document.querySelector("#reset-filters"),
  filterResult: document.querySelector("#filter-result"),
  filterSummary: document.querySelector("#filter-summary"),
  filterPanel: document.querySelector("#filter-panel"),
  statTotal: document.querySelector("#stat-total"),
  statSeries: document.querySelector("#stat-series"),
  statRead: document.querySelector("#stat-read"),
  statUnread: document.querySelector("#stat-unread"),
  statSealed: document.querySelector("#stat-sealed"),
  statDuplicate: document.querySelector("#stat-duplicate"),
  statMissing: document.querySelector("#stat-missing"),
  conditionStats: document.querySelector("#condition-stats"),
  conditionStatsTotal: document.querySelector("#condition-stats-total"),
  missingList: document.querySelector("#missing-list"),
  missingEmpty: document.querySelector("#missing-empty"),
  missingCount: document.querySelector("#missing-count"),
  missingPage: document.querySelector("#missing-page"),
  missingPageTitle: document.querySelector("#missing-page-title"),
  missingPageCount: document.querySelector("#missing-page-count"),
  closeMissingPage: document.querySelector("#close-missing-page"),
  openMainMissing: document.querySelector("#open-main-missing"),
  openOtherMissing: document.querySelector("#open-other-missing"),
  mainMissingCount: document.querySelector("#main-missing-count"),
  otherMissingCount: document.querySelector("#other-missing-count"),
  openFleaMarket: document.querySelector("#open-flea-market"),
  fleaMarketFoundCount: document.querySelector("#flea-market-found-count"),
  fleaMarketPage: document.querySelector("#flea-market-page"),
  closeFleaMarket: document.querySelector("#close-flea-market"),
  fleaMarketPageCount: document.querySelector("#flea-market-page-count"),
  fleaMarketMissingCount: document.querySelector("#flea-market-missing-count"),
  fleaMarketSelectedCount: document.querySelector("#flea-market-selected-count"),
  fleaMarketSearch: document.querySelector("#flea-market-search"),
  fleaMarketScope: document.querySelector("#flea-market-scope"),
  fleaMarketDefaultCondition: document.querySelector("#flea-market-default-condition"),
  fleaMarketApplyCondition: document.querySelector("#flea-market-apply-condition"),
  fleaMarketEmpty: document.querySelector("#flea-market-empty"),
  fleaMarketList: document.querySelector("#flea-market-list"),
  fleaMarketSave: document.querySelector("#flea-market-save"),
  fleaMarketClear: document.querySelector("#flea-market-clear"),
  fleaMarketMessage: document.querySelector("#flea-market-message"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  connectionStatus: document.querySelector("#connection-status"),
  appVersion: document.querySelector("#app-version"),
  updateApp: document.querySelector("#update-app"),
  backupReminder: document.querySelector("#backup-reminder"),
  backupReminderText: document.querySelector("#backup-reminder-text"),
  backupReminderAction: document.querySelector("#backup-reminder-action"),
  progressTargetPanel: document.querySelector("#progress-target-panel"),
  progressTargetForm: document.querySelector("#progress-target-form"),
  progressSeries: document.querySelector("#progress-series"),
  progressTarget: document.querySelector("#progress-target"),
  progressSave: document.querySelector("#progress-save"),
  progressRemove: document.querySelector("#progress-remove"),
  progressMessage: document.querySelector("#progress-message"),
  progressList: document.querySelector("#progress-list"),
  progressSummary: document.querySelector("#progress-summary"),
  progressPageSummary: document.querySelector("#progress-page-summary"),
  progressPage: document.querySelector("#progress-page"),
  openProgress: document.querySelector("#open-progress"),
  closeProgress: document.querySelector("#close-progress"),
  progressOverviewPercent: document.querySelector("#progress-overview-percent"),
  progressOverviewCopy: document.querySelector("#progress-overview-copy"),
  progressOverviewFill: document.querySelector("#progress-overview-fill"),
  exportJson: document.querySelector("#export-json"),
  exportCsv: document.querySelector("#export-csv"),
  exportMissingCsv: document.querySelector("#export-missing-csv"),
  exportMissingPdf: document.querySelector("#export-missing-pdf"),
  exportMessage: document.querySelector("#export-message"),
  lastBackup: document.querySelector("#last-backup"),
  backupHealth: document.querySelector("#backup-health"),
  backupChangeCount: document.querySelector("#backup-change-count"),
  storagePersistence: document.querySelector("#storage-persistence"),
  storageUsage: document.querySelector("#storage-usage"),
  requestPersistence: document.querySelector("#request-persistence"),
  openMedia: document.querySelector("#open-media"),
  mediaPage: document.querySelector("#media-page"),
  closeMedia: document.querySelector("#close-media"),
  mediaPageSummary: document.querySelector("#media-page-summary"),
  mediaCoverCount: document.querySelector("#media-cover-count"),
  mediaCoverSize: document.querySelector("#media-cover-size"),
  mediaCacheCount: document.querySelector("#media-cache-count"),
  mediaOriginUsage: document.querySelector("#media-origin-usage"),
  mediaOriginQuota: document.querySelector("#media-origin-quota"),
  lastMediaBackup: document.querySelector("#last-media-backup"),
  mediaBackupChanges: document.querySelector("#media-backup-changes"),
  showCovers: document.querySelector("#show-covers"),
  autoEnrich: document.querySelector("#auto-enrich"),
  enrichAll: document.querySelector("#enrich-all"),
  clearMetadataCache: document.querySelector("#clear-metadata-cache"),
  enrichmentCount: document.querySelector("#enrichment-count"),
  enrichmentProgress: document.querySelector("#enrichment-progress"),
  enrichmentStatus: document.querySelector("#enrichment-status"),
  exportMediaBackup: document.querySelector("#export-media-backup"),
  openMediaImport: document.querySelector("#open-media-import"),
  deleteAllCovers: document.querySelector("#delete-all-covers"),
  mediaMessage: document.querySelector("#media-message"),
  openImport: document.querySelector("#open-import"),
  importModal: document.querySelector("#import-modal"),
  closeImport: document.querySelector("#close-import"),
  importFile: document.querySelector("#import-file"),
  importSummary: document.querySelector("#import-summary"),
  importIssues: document.querySelector("#import-issues"),
  importModeMerge: document.querySelector("#import-mode-merge"),
  importModeReplace: document.querySelector("#import-mode-replace"),
  importSubmit: document.querySelector("#import-submit"),
  importMessage: document.querySelector("#import-message"),
  openSeriesManager: document.querySelector("#open-series-manager"),
  seriesModal: document.querySelector("#series-modal"),
  closeSeries: document.querySelector("#close-series"),
  seriesForm: document.querySelector("#series-form"),
  customSeriesOriginalName: document.querySelector("#custom-series-original-name"),
  customSeriesName: document.querySelector("#custom-series-name"),
  customSeriesPattern: document.querySelector("#custom-series-pattern"),
  saveCustomSeries: document.querySelector("#save-custom-series"),
  cancelCustomSeriesEdit: document.querySelector("#cancel-custom-series-edit"),
  customSeriesList: document.querySelector("#custom-series-list"),
  standardSeriesList: document.querySelector("#standard-series-list"),
  seriesMessage: document.querySelector("#series-message"),
  missingDetailModal: document.querySelector("#missing-detail-modal"),
  closeMissingDetail: document.querySelector("#close-missing-detail"),
  missingDetailForm: document.querySelector("#missing-detail-form"),
  missingDetailContext: document.querySelector("#missing-detail-context"),
  missingDetailName: document.querySelector("#missing-detail-name"),
  missingDetailYear: document.querySelector("#missing-detail-year"),
  missingDetailCondition: document.querySelector("#missing-detail-condition"),
  missingDetailUrl: document.querySelector("#missing-detail-url"),
  missingDetailNotes: document.querySelector("#missing-detail-notes"),
  missingDuckipediaLink: document.querySelector("#missing-duckipedia-link"),
  deleteMissingDetail: document.querySelector("#delete-missing-detail"),
  missingMarkOwned: document.querySelector("#missing-mark-owned"),
  missingDetailMessage: document.querySelector("#missing-detail-message"),
  duplicateModal: document.querySelector("#duplicate-modal"),
  closeDuplicate: document.querySelector("#close-duplicate"),
  duplicateForm: document.querySelector("#duplicate-form"),
  duplicateContext: document.querySelector("#duplicate-context"),
  duplicateModalCondition: document.querySelector("#duplicate-modal-condition"),
  duplicateSave: document.querySelector("#duplicate-save"),
  duplicateRemove: document.querySelector("#duplicate-remove"),
  duplicateMessage: document.querySelector("#duplicate-message"),
  openScanner: document.querySelector("#open-scanner"),
  scannerModal: document.querySelector("#scanner-modal"),
  closeScanner: document.querySelector("#close-scanner"),
  scannerSeries: document.querySelector("#scanner-series"),
  scannerCondition: document.querySelector("#scanner-condition"),
  scannerDuplicateCondition: document.querySelector("#scanner-duplicate-condition"),
  scannerDuplicateConditionField: document.querySelector("#scanner-duplicate-condition-field"),
  scannerIsRead: document.querySelector("#scanner-is-read"),
  scannerIsDuplicate: document.querySelector("#scanner-is-duplicate"),
  scannerIsSealed: document.querySelector("#scanner-is-sealed"),
  scannerCameraTarget: document.querySelector("#scanner-camera-target"),
  scannerCameraPlaceholder: document.querySelector("#scanner-camera-placeholder"),
  scannerStatus: document.querySelector("#scanner-status"),
  scannerStart: document.querySelector("#scanner-start"),
  scannerStop: document.querySelector("#scanner-stop"),
  scannerPhoto: document.querySelector("#scanner-photo"),
  scannerManualCode: document.querySelector("#scanner-manual-code"),
  scannerManualApply: document.querySelector("#scanner-manual-apply"),
  scannerResult: document.querySelector("#scanner-result"),
  scannerBandNumber: document.querySelector("#scanner-band-number"),
  scannerExtension: document.querySelector("#scanner-extension"),
  scannerExistingWarning: document.querySelector("#scanner-existing-warning"),
  scannerResultName: document.querySelector("#scanner-result-name"),
  scannerResultYear: document.querySelector("#scanner-result-year"),
  scannerDuckipediaLink: document.querySelector("#scanner-duckipedia-link"),
  scannerLookupStatus: document.querySelector("#scanner-lookup-status"),
  scannerSave: document.querySelector("#scanner-save"),
  scannerApplyForm: document.querySelector("#scanner-apply-form"),
  scannerRescan: document.querySelector("#scanner-rescan"),
  scannerQueue: document.querySelector("#scanner-queue"),
  scannerQueueCount: document.querySelector("#scanner-queue-count"),
  scannerQueueList: document.querySelector("#scanner-queue-list"),
  scannerApplyDefaults: document.querySelector("#scanner-apply-defaults"),
  scannerSaveQueue: document.querySelector("#scanner-save-queue"),
  scannerClearQueue: document.querySelector("#scanner-clear-queue"),
  scannerQueueMessage: document.querySelector("#scanner-queue-message"),
  toast: document.querySelector("#toast")
};

let toastTimer;
let importInProgress = false;
let barcodeScanner;

initializeApp().catch((error) => {
  console.error(error);
  showToast(`Sammlerhausen konnte nicht gestartet werden: ${error.message}`, "error");
});

async function initializeApp() {
  applyStoredTheme();
  barcodeScanner = new MagazineBarcodeScanner(elements.scannerCameraTarget);
  bindEvents();
  updateConnectionStatus();
  elements.appVersion.textContent = `v${APP_CONFIG.appVersion}`;

  try {
    state.settings = await getAppSettings();
    applyTheme(state.settings.theme);
    elements.showCovers.checked = state.settings.showCovers !== false;
    elements.autoEnrich.checked = state.settings.duckipediaAutoEnrich !== false;
    persistThemeLocally(state.settings.theme);
  } catch (error) {
    console.warn("Einstellungen konnten nicht geladen werden:", error);
  }

  populateConfiguration();
  updateDuplicateConditionVisibility();
  renderScannerQueue();
  resetCoverEditorState();
  await refreshCollection();
  renderBackupStatus();
  await refreshStorageStatus();
  await refreshMediaStatus();
  registerServiceWorker();
}

function populateConfiguration() {
  const availableSeries = getAvailableSeries(state.settings, state.comics);
  const selectedSeries = elements.series.value;
  const selectedFilterSeries = elements.filterSeries.value;
  const selectedCondition = elements.condition.value || "VG";
  const selectedDuplicateCondition = elements.duplicateCondition.value || selectedCondition;
  const selectedFilterCondition = elements.filterCondition.value;
  const selectedMissingCondition = elements.missingDetailCondition.value;
  const selectedScannerSeries = elements.scannerSeries.value || selectedSeries;
  const selectedScannerCondition = elements.scannerCondition.value || selectedCondition;
  const selectedScannerDuplicateCondition = elements.scannerDuplicateCondition.value || selectedDuplicateCondition;
  const selectedProgressSeries = elements.progressSeries.value || selectedSeries;
  const selectedFleaMarketCondition = elements.fleaMarketDefaultCondition.value || "VG";
  const selectedDuplicateModalCondition = elements.duplicateModalCondition.value || selectedDuplicateCondition || "VG";

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
      select.append(createOption(condition.code, `${condition.label} – ${condition.code}`));
    });
  });
  elements.condition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedCondition)
    ? selectedCondition
    : "VG";
  elements.duplicateCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedDuplicateCondition)
    ? selectedDuplicateCondition
    : elements.condition.value;

  elements.filterCondition.replaceChildren();
  elements.filterCondition.append(createOption("all", "Alle Zustände"));
  APP_CONFIG.conditions.forEach((condition) => {
    elements.filterCondition.append(createOption(condition.code, `${condition.label} – ${condition.code}`));
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
      select.append(createOption(condition.code, `${condition.label} – ${condition.code}`));
    });
  });
  elements.scannerCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedScannerCondition)
    ? selectedScannerCondition
    : "VG";
  elements.scannerDuplicateCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedScannerDuplicateCondition)
    ? selectedScannerDuplicateCondition
    : elements.scannerCondition.value;

  elements.missingDetailCondition.replaceChildren();
  elements.missingDetailCondition.append(createOption("", "Nicht festgelegt"));
  APP_CONFIG.conditions.forEach((condition) => {
    elements.missingDetailCondition.append(createOption(condition.code, `${condition.label} – ${condition.code}`));
  });
  elements.missingDetailCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedMissingCondition)
    ? selectedMissingCondition
    : "";

  [elements.fleaMarketDefaultCondition, elements.duplicateModalCondition].forEach((select) => {
    select.replaceChildren();
    APP_CONFIG.conditions.forEach((condition) => {
      select.append(createOption(condition.code, `${condition.label} – ${condition.code}`));
    });
  });
  elements.fleaMarketDefaultCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedFleaMarketCondition)
    ? selectedFleaMarketCondition
    : "VG";
  elements.duplicateModalCondition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedDuplicateModalCondition)
    ? selectedDuplicateModalCondition
    : "VG";
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function bindEvents() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.coverFile.addEventListener("change", handleCoverFileSelection);
  elements.removeCover.addEventListener("click", handleRemoveCoverFromForm);
  elements.lookupMetadata.addEventListener("click", () => lookupFormMetadata({ force: true }));
  elements.series.addEventListener("change", scheduleFormMetadataLookup);
  elements.volumeNumber.addEventListener("input", scheduleFormMetadataLookup);
  elements.isDuplicate.addEventListener("change", updateDuplicateConditionVisibility);
  elements.cancelEdit.addEventListener("click", resetForm);
  elements.comicList.addEventListener("click", handleCardAction);
  elements.missingList.addEventListener("click", handleMissingBandClick);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.updateApp.addEventListener("click", handleUpdateButtonClick);
  elements.backupReminderAction.addEventListener("click", handleJsonExport);
  elements.progressTargetForm.addEventListener("submit", handleProgressTargetSubmit);
  elements.progressSeries.addEventListener("change", syncProgressTargetInput);
  elements.progressRemove.addEventListener("click", handleRemoveProgressTarget);
  elements.openMainCollection.addEventListener("click", () => openCollectionPage("main"));
  elements.openOtherCollection.addEventListener("click", () => openCollectionPage("other"));
  elements.closeCollection.addEventListener("click", closeCollectionPage);
  elements.openMainMissing.addEventListener("click", () => openMissingPage("main"));
  elements.openOtherMissing.addEventListener("click", () => openMissingPage("other"));
  elements.closeMissingPage.addEventListener("click", closeMissingPage);
  elements.openFleaMarket.addEventListener("click", openFleaMarketPage);
  elements.closeFleaMarket.addEventListener("click", closeFleaMarketPage);
  elements.fleaMarketSearch.addEventListener("input", renderFleaMarket);
  elements.fleaMarketScope.addEventListener("change", renderFleaMarket);
  elements.fleaMarketList.addEventListener("change", handleFleaMarketListChange);
  elements.fleaMarketApplyCondition.addEventListener("click", applyFleaMarketDefaultCondition);
  elements.fleaMarketSave.addEventListener("click", saveFleaMarketFinds);
  elements.fleaMarketClear.addEventListener("click", clearFleaMarketFinds);
  elements.openProgress.addEventListener("click", openProgressPage);
  elements.closeProgress.addEventListener("click", closeProgressPage);
  elements.openScanner.addEventListener("click", openScannerModal);
  elements.closeScanner.addEventListener("click", closeScannerModal);
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
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  [
    elements.search,
    elements.filterSeries,
    elements.filterCondition,
    elements.filterRead,
    elements.filterSealed,
    elements.filterDuplicate,
    elements.sortBy
  ].forEach((control) => {
    control.addEventListener(control === elements.search ? "input" : "change", renderCollection);
  });

  elements.resetFilters.addEventListener("click", resetFilters);
  elements.exportJson.addEventListener("click", handleJsonExport);
  elements.exportCsv.addEventListener("click", handleCollectionCsvExport);
  elements.exportMissingCsv.addEventListener("click", handleMissingCsvExport);
  elements.exportMissingPdf.addEventListener("click", handleMissingPdfExport);
  elements.requestPersistence.addEventListener("click", handlePersistenceRequest);
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
  elements.closeImport.addEventListener("click", closeImportModal);
  elements.importFile.addEventListener("change", handleImportFileSelection);
  elements.importSubmit.addEventListener("click", handleImportSubmit);
  elements.openSeriesManager.addEventListener("click", openSeriesModal);
  elements.closeSeries.addEventListener("click", closeSeriesModal);
  elements.seriesForm.addEventListener("submit", handleSaveCustomSeries);
  elements.cancelCustomSeriesEdit.addEventListener("click", resetCustomSeriesForm);
  elements.customSeriesList.addEventListener("click", handleCustomSeriesAction);
  elements.seriesModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-series]")) closeSeriesModal();
  });
  elements.closeMissingDetail.addEventListener("click", closeMissingDetailModal);
  elements.missingDetailForm.addEventListener("submit", handleSaveMissingDetail);
  elements.deleteMissingDetail.addEventListener("click", handleDeleteMissingDetail);
  elements.missingMarkOwned.addEventListener("click", handleMarkMissingBandOwned);
  elements.missingDetailModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-missing-detail]")) closeMissingDetailModal();
  });
  elements.duplicateForm.addEventListener("submit", handleSaveDuplicateCopy);
  elements.duplicateRemove.addEventListener("click", handleRemoveDuplicateCopy);
  elements.closeDuplicate.addEventListener("click", closeDuplicateModal);
  elements.duplicateModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-duplicate]")) closeDuplicateModal();
  });
  elements.importModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-import]")) {
      closeImportModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!elements.importModal.classList.contains("hidden")) return closeImportModal();
    if (!elements.seriesModal.classList.contains("hidden")) return closeSeriesModal();
    if (!elements.missingDetailModal.classList.contains("hidden")) return closeMissingDetailModal();
    if (!elements.duplicateModal.classList.contains("hidden")) return closeDuplicateModal();
    if (!elements.scannerModal.classList.contains("hidden")) return closeScannerModal();
    if (!elements.collectionPage.classList.contains("hidden")) return closeCollectionPage();
    if (!elements.missingPage.classList.contains("hidden")) return closeMissingPage();
    if (!elements.fleaMarketPage.classList.contains("hidden")) return closeFleaMarketPage();
    if (!elements.progressPage.classList.contains("hidden")) return closeProgressPage();
    if (!elements.mediaPage.classList.contains("hidden")) return closeMediaPage();
  });
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearValidationErrors();
  setFormBusy(true);

  try {
    const action = event.submitter?.dataset.action || "save";
    const wasEditing = Boolean(state.editingId);
    const comic = buildComicFromForm();
    await saveComic(comic);
    const coverChanged = await commitCoverChanges(comic.id);
    await recordDataChange(1);
    if (coverChanged) await recordMediaChange(1);
    await refreshCollection();
    if (coverChanged) await refreshMediaStatus();

    if (action === "save-next" && !wasEditing) {
      prepareNextComic(comic);
      showToast("Comic gespeichert. Der nächste Band ist vorbereitet.");
    } else {
      resetForm();
      showToast(wasEditing ? "Änderungen gespeichert." : "Comic gespeichert.");
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

function buildComicFromForm() {
  const series = elements.series.value.trim();
  const volumeNumber = elements.volumeNumber.value.trim();
  const title = elements.title.value.trim();
  const publicationYearRaw = elements.publicationYear.value.trim();
  const condition = elements.condition.value;
  const duplicateCondition = elements.isDuplicate.checked ? elements.duplicateCondition.value : null;
  const notes = elements.notes.value.trim();
  const errors = {};
  const availableSeries = getAvailableSeries(state.settings, state.comics);

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

  return {
    id: state.editingId || createStableId(),
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
    metadataStatus: metadata?.found === true
      ? "found"
      : metadata?.found === false
        ? "not-found"
        : (editingMetadataApplies ? state.editingComic?.metadataStatus : "") || "",
    metadataFetchedAt: metadata?.fetchedAt || (editingMetadataApplies ? state.editingComic?.metadataFetchedAt : null) || null,
    createdAt: state.editingComic?.createdAt || now,
    updatedAt: now
  };
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
    const cover = await getCoverMedia(comic.id);
    if (state.editingId !== comic.id) return;

    if (cover?.blob instanceof Blob) {
      state.formHasLocalCover = true;
      const objectUrl = URL.createObjectURL(cover.blob);
      setFormCoverPreview(objectUrl, `Eigenes Cover · ${formatBytes(cover.size || cover.blob.size)}`, true);
      return;
    }

    if (comic.duckipediaCoverUrl) {
      setFormCoverPreview(comic.duckipediaCoverUrl, "Duckipedia-Vorschau · nicht lokal gespeichert", false);
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

  if (!force && cached && isMetadataFresh(cached)) {
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

function parseStrictPositiveInteger(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 && parsedValue <= 99999
    ? parsedValue
    : null;
}

function createConfiguredDuckipediaUrl(series, volumeNumber, title = "") {
  return buildDuckipediaUrl(series, volumeNumber, title, state.settings);
}

function createStableId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `comic-${Date.now()}-${randomPart}`;
}

async function refreshCollection() {
  try {
    state.comics = await getAllComics();
    populateConfiguration();
    state.missingGroups = calculateMissingBands(
      state.comics,
      state.settings.knownHighestBandBySeries
    );
    renderCollectionHub();
    renderMissingHub();
    renderCollection();
    renderStats();
    renderMissingBands();
    renderFleaMarketHubStatus();
    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
    renderSeriesProgress();
    renderBackupStatus();
  } catch (error) {
    console.error(error);
    showFormMessage(`Lokale Daten konnten nicht geladen werden: ${error.message}`, "error");
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

function syncCollectionSeriesFilter(availableSeries = getAvailableSeries(state.settings, state.comics), preferredValue = elements.filterSeries.value) {
  const mainSeries = "Lustiges Taschenbuch";
  const options = state.collectionScope === "main"
    ? [mainSeries]
    : availableSeries.filter((seriesName) => seriesName !== mainSeries);

  elements.filterSeries.replaceChildren();

  if (state.collectionScope === "main") {
    elements.filterSeries.append(createOption(mainSeries, mainSeries));
    elements.filterSeries.value = mainSeries;
    elements.filterSeriesField.classList.add("hidden");
    return;
  }

  elements.filterSeries.append(createOption("all", "Alle Sonderreihen"));
  options.forEach((seriesName) => elements.filterSeries.append(createOption(seriesName, seriesName)));
  elements.filterSeries.value = options.includes(preferredValue) ? preferredValue : "all";
  elements.filterSeriesField.classList.remove("hidden");
}

function renderCollectionHub() {
  const mainCount = state.comics.filter((comic) => comic.series === "Lustiges Taschenbuch").length;
  const otherCount = state.comics.length - mainCount;
  elements.mainCollectionCount.textContent = String(mainCount);
  elements.otherCollectionCount.textContent = String(otherCount);
  elements.mainCollectionCount.setAttribute("aria-label", formatEntryCount(mainCount));
  elements.otherCollectionCount.setAttribute("aria-label", formatEntryCount(otherCount));
}

function openCollectionPage(scope) {
  state.collectionScope = scope === "other" ? "other" : "main";
  resetFilters({ keepPageOpen: true });
  syncCollectionSeriesFilter(getAvailableSeries(state.settings, state.comics));
  elements.collectionPageTitle.textContent = state.collectionScope === "main"
    ? "Lustige Taschenbücher"
    : "Sonderbände & weitere Reihen";
  renderCollection();
  elements.collectionPage.classList.remove("hidden");
  elements.collectionPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.collectionPage.scrollTop = 0;
  window.setTimeout(() => elements.closeCollection.focus({ preventScroll: true }), 0);
}

function closeCollectionPage({ returnFocus = true } = {}) {
  elements.collectionPage.classList.add("hidden");
  elements.collectionPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  if (returnFocus) {
    window.setTimeout(() => {
      const target = state.collectionScope === "main" ? elements.openMainCollection : elements.openOtherCollection;
      target.focus({ preventScroll: true });
    }, 0);
  }
}

function getScopedMissingGroups() {
  const mainSeries = "Lustiges Taschenbuch";
  return state.missingGroups.filter((group) => (
    state.missingScope === "main"
      ? group.series === mainSeries
      : group.series !== mainSeries
  ));
}

function renderMissingHub() {
  const mainSeries = "Lustiges Taschenbuch";
  const mainMissing = state.missingGroups
    .filter((group) => group.series === mainSeries)
    .reduce((sum, group) => sum + group.missingBands.length, 0);
  const otherMissing = state.missingGroups
    .filter((group) => group.series !== mainSeries)
    .reduce((sum, group) => sum + group.missingBands.length, 0);
  const totalMissing = mainMissing + otherMissing;

  elements.mainMissingCount.textContent = String(mainMissing);
  elements.otherMissingCount.textContent = String(otherMissing);
  elements.mainMissingCount.setAttribute("aria-label", `${mainMissing} fehlende Bände`);
  elements.otherMissingCount.setAttribute("aria-label", `${otherMissing} fehlende Bände`);
  elements.missingCount.textContent = totalMissing === 1 ? "1 fehlt" : `${totalMissing} fehlen`;
}

function openMissingPage(scope) {
  state.missingScope = scope === "other" ? "other" : "main";
  state.openMissingSeries = new Set();
  elements.missingPageTitle.textContent = state.missingScope === "main"
    ? "Lustige Taschenbücher"
    : "Sonderbände & weitere Reihen";
  renderMissingBands();
  elements.missingPage.classList.remove("hidden");
  elements.missingPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.missingPage.scrollTop = 0;
  window.setTimeout(() => elements.closeMissingPage.focus({ preventScroll: true }), 0);
}

function closeMissingPage({ returnFocus = true } = {}) {
  elements.missingPage.classList.add("hidden");
  elements.missingPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  if (returnFocus) {
    window.setTimeout(() => {
      const target = state.missingScope === "main" ? elements.openMainMissing : elements.openOtherMissing;
      target.focus({ preventScroll: true });
    }, 0);
  }
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
        notes: detail.notes || "",
        duckipediaUrl: detail.duckipediaUrl || createConfiguredDuckipediaUrl(group.series, bandNumber, detail.title || "")
      });
    });
  });

  return candidates.sort((first, second) => {
    const firstMain = first.series === "Lustiges Taschenbuch" ? 0 : 1;
    const secondMain = second.series === "Lustiges Taschenbuch" ? 0 : 1;
    return firstMain - secondMain
      || first.series.localeCompare(second.series, "de", { sensitivity: "base" })
      || first.bandNumber - second.bandNumber;
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
  const sessionItems = getFleaMarketSessionItems();
  const allCandidates = getFleaMarketCandidates();
  const candidates = allCandidates.filter((item) => {
    if (scope === "main" && item.series !== "Lustiges Taschenbuch") return false;
    if (scope === "other" && item.series === "Lustiges Taschenbuch") return false;
    if (!searchTerm) return true;
    return normalizeSearchText(`${item.series} ${item.bandNumber} ${item.title}`).includes(searchTerm);
  });

  const selectedCount = allCandidates.filter((item) => sessionItems[item.key]).length;
  elements.fleaMarketMissingCount.textContent = String(allCandidates.length);
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
    const band = document.createElement("strong");
    band.textContent = `Band ${item.bandNumber}`;
    const metadata = document.createElement("span");
    metadata.textContent = [item.title, item.publicationYear].filter(Boolean).join(" · ") || "Noch keine Zusatzdaten";
    copy.append(band, metadata);

    const condition = document.createElement("select");
    condition.dataset.marketCondition = item.key;
    condition.setAttribute("aria-label", `Zustand für ${item.series} Band ${item.bandNumber}`);
    APP_CONFIG.conditions.forEach((entry) => condition.append(createOption(entry.code, entry.code)));
    condition.value = selected?.condition || item.desiredCondition || elements.fleaMarketDefaultCondition.value || "VG";
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
        condition: candidate.desiredCondition || elements.fleaMarketDefaultCondition.value || "VG",
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
    const comics = [];
    const nextDetails = { ...(state.settings.missingBandDetails || {}) };
    const nextSessionItems = { ...sessionItems };

    for (const entry of selected) {
      const { candidate, session, key } = entry;
      const alreadyExists = state.comics.some(
        (comic) => comic.series === candidate.series && comic.numericBandNumber === candidate.bandNumber
      );
      if (alreadyExists) {
        delete nextSessionItems[key];
        continue;
      }

      const metadata = await getMetadataCache(createMetadataCacheKey(candidate.series, candidate.bandNumber));
      comics.push({
        id: createStableId(),
        dataFormatVersion: APP_CONFIG.dataFormatVersion,
        series: candidate.series,
        volumeNumber: String(candidate.bandNumber),
        numericBandNumber: candidate.bandNumber,
        title: candidate.title || metadata?.title || "",
        publicationYear: candidate.publicationYear || metadata?.publicationYear || null,
        condition: APP_CONFIG.conditions.some((condition) => condition.code === session.condition) ? session.condition : "VG",
        duplicateCondition: null,
        isRead: false,
        isDuplicate: false,
        isSealed: false,
        notes: candidate.notes || "",
        duckipediaPageUrl: candidate.duckipediaUrl || metadata?.pageUrl || createConfiguredDuckipediaUrl(candidate.series, candidate.bandNumber),
        duckipediaCoverUrl: metadata?.coverUrl || "",
        metadataStatus: metadata?.found === true ? "found" : "",
        metadataFetchedAt: metadata?.fetchedAt || null,
        createdAt: now,
        updatedAt: now
      });
      delete nextDetails[key];
      delete nextSessionItems[key];
    }

    if (comics.length > 0) await upsertComics(comics);
    await saveMeaningfulSettings({
      missingBandDetails: nextDetails,
      fleaMarketSession: { items: nextSessionItems, updatedAt: new Date().toISOString() }
    }, Math.max(1, comics.length));
    await refreshCollection();
    renderFleaMarket();
    showFleaMarketMessage(
      comics.length === 1 ? "1 gefundener Band wurde in die Sammlung übernommen." : `${comics.length} gefundene Bände wurden in die Sammlung übernommen.`,
      "success"
    );
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
  document.body.classList.remove("app-page-open");
  window.setTimeout(() => elements.openProgress.focus({ preventScroll: true }), 0);
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

    const eligibleCount = state.comics.filter((comic) => comic.numericBandNumber && (
      !comic.title || !comic.publicationYear || !comic.duckipediaCoverUrl || !isMetadataFresh(comic)
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
  const candidates = state.comics.filter((comic) => comic.numericBandNumber);

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
      elements.enrichmentStatus.textContent = `${comic.series}, Band ${comic.volumeNumber} wird geprüft (${index + 1}/${candidates.length}) …`;
      const metadata = await getMetadataForBand(comic.series, comic.numericBandNumber, { force: false });
      const { comic: updatedComic, changed } = mergeComicWithMetadata(comic, metadata);

      if (metadata.found) found += 1; else failed += 1;
      if (changed) updates.push(updatedComic);
      elements.enrichmentProgress.value = index + 1;
      if (!metadata.fromCache) await new Promise((resolve) => window.setTimeout(resolve, 180));
    }

    if (updates.length) {
      await upsertComics(updates);
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
      lastBackupComicCount: state.comics.length
    };
    const content = await createMediaBackup(state.comics, nextSettings, metadataCache, covers);
    const result = await shareOrDownloadBlob({
      blob: new Blob([content], { type: "application/json;charset=utf-8" }),
      filename: createDatedFilename("Sammlerhausen-Medien-Backup", "json"),
      mimeType: "application/json;charset=utf-8",
      title: "Sammlerhausen – vollständiges Medien-Backup",
      text: "Vollständiges Sammlerhausen-Backup inklusive eigener Coverfotos."
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
    const highestPresent = state.comics
      .filter((comic) => comic.series === series && Number.isSafeInteger(comic.numericBandNumber))
      .reduce((maximum, comic) => Math.max(maximum, comic.numericBandNumber), 0);
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
    state.missingGroups = calculateMissingBands(state.comics, nextTargets);
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
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
    state.missingGroups = calculateMissingBands(state.comics, nextTargets);
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
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

  state.comics.forEach((comic) => {
    if (!Number.isSafeInteger(comic.numericBandNumber) || comic.numericBandNumber < 1) return;
    if (!numericBandsBySeries.has(comic.series)) numericBandsBySeries.set(comic.series, new Set());
    numericBandsBySeries.get(comic.series).add(comic.numericBandNumber);
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

function renderCollection() {
  state.filteredComics = getFilteredAndSortedComics();
  clearCardCoverObjectUrls();
  elements.comicList.replaceChildren();

  const scopedComics = getScopedComics();
  const hasComics = scopedComics.length > 0;
  const hasResults = state.filteredComics.length > 0;
  elements.emptyState.classList.toggle("hidden", hasComics);
  elements.noResults.classList.toggle("hidden", !hasComics || hasResults);

  elements.collectionCount.textContent = hasComics
    ? `${state.filteredComics.length} von ${scopedComics.length}`
    : "0 Einträge";
  elements.filterResult.textContent = hasComics
    ? `${formatEntryCount(state.filteredComics.length)} sichtbar.`
    : "";
  elements.filterSummary.textContent = getActiveFilterCount() > 0
    ? `${getActiveFilterCount()} aktiv`
    : "Standardansicht";

  state.filteredComics.forEach((comic) => {
    elements.comicList.append(createComicCard(comic));
  });
}

function getScopedComics() {
  const mainSeries = "Lustiges Taschenbuch";
  return state.collectionScope === "other"
    ? state.comics.filter((comic) => comic.series !== mainSeries)
    : state.comics.filter((comic) => comic.series === mainSeries);
}

function getFilteredAndSortedComics() {
  const searchTerm = normalizeSearchText(elements.search.value);
  const selectedSeries = elements.filterSeries.value;
  const selectedCondition = elements.filterCondition.value;
  const readFilter = elements.filterRead.value;
  const onlySealed = elements.filterSealed.checked;
  const onlyDuplicate = elements.filterDuplicate.checked;

  const filtered = getScopedComics().filter((comic) => {
    if (selectedSeries !== "all" && comic.series !== selectedSeries) {
      return false;
    }

    if (
      selectedCondition !== "all" &&
      comic.condition !== selectedCondition &&
      comic.duplicateCondition !== selectedCondition
    ) {
      return false;
    }

    if (readFilter === "read" && !comic.isRead) {
      return false;
    }

    if (readFilter === "unread" && comic.isRead) {
      return false;
    }

    if (onlySealed && !comic.isSealed) {
      return false;
    }

    if (onlyDuplicate && !comic.isDuplicate) {
      return false;
    }

    if (searchTerm) {
      const searchableText = normalizeSearchText([
        comic.title,
        comic.series,
        comic.volumeNumber,
        comic.notes
      ].join(" "));

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort(getSortComparator(elements.sortBy.value));
}

function getSortComparator(sortBy) {
  if (sortBy === "volume") {
    return (first, second) => compareBandNumbers(first, second) || compareSeries(first, second);
  }

  if (sortBy === "title") {
    return (first, second) => compareOptionalText(first.title, second.title) || compareSeriesAndBand(first, second);
  }

  if (sortBy === "condition") {
    return (first, second) => {
      const rankDifference = getConditionRank(first.condition) - getConditionRank(second.condition);
      return rankDifference || compareSeriesAndBand(first, second);
    };
  }

  return compareSeriesAndBand;
}

function compareSeriesAndBand(first, second) {
  return compareSeries(first, second) || compareBandNumbers(first, second);
}

function compareSeries(first, second) {
  return String(first.series).localeCompare(String(second.series), "de", { sensitivity: "base" });
}

function compareBandNumbers(first, second) {
  const firstNumber = Number.isSafeInteger(first.numericBandNumber)
    ? first.numericBandNumber
    : Number.POSITIVE_INFINITY;
  const secondNumber = Number.isSafeInteger(second.numericBandNumber)
    ? second.numericBandNumber
    : Number.POSITIVE_INFINITY;

  if (firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return String(first.volumeNumber).localeCompare(String(second.volumeNumber), "de", {
    numeric: true,
    sensitivity: "base"
  });
}

function compareOptionalText(firstValue, secondValue) {
  const first = String(firstValue || "").trim();
  const second = String(secondValue || "").trim();

  if (!first && second) {
    return 1;
  }

  if (first && !second) {
    return -1;
  }

  return first.localeCompare(second, "de", { sensitivity: "base", numeric: true });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .trim();
}

function createComicCard(comic) {
  const article = document.createElement("article");
  article.className = "comic-card";
  article.dataset.comicId = comic.id;

  const shell = document.createElement("div");
  shell.className = "comic-card-shell";
  const content = document.createElement("div");
  content.className = "comic-card-content";

  if (state.settings.showCovers !== false) {
    const cover = document.createElement("figure");
    cover.className = "comic-card-cover hidden";
    const image = document.createElement("img");
    image.alt = `Cover von ${comic.series}, Band ${comic.volumeNumber}`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    cover.append(image);
    shell.append(cover);
    hydrateComicCardCover(shell, cover, image, comic);
  }

  const top = document.createElement("div");
  top.className = "comic-card-top";

  const headingGroup = document.createElement("div");
  const series = document.createElement("p");
  series.className = "comic-series";
  series.textContent = comic.series;

  const title = document.createElement("h3");
  title.className = "comic-title";
  title.textContent = comic.title || `Band ${comic.volumeNumber}`;

  const subtitle = document.createElement("p");
  subtitle.className = "comic-subtitle";
  subtitle.textContent = comic.title
    ? `Band ${comic.volumeNumber}${comic.publicationYear ? ` · ${comic.publicationYear}` : ""}`
    : comic.publicationYear
      ? `Erscheinungsjahr ${comic.publicationYear}`
      : "Titel nicht eingetragen";

  headingGroup.append(series, title, subtitle);

  const rightColumn = document.createElement("div");
  rightColumn.className = "card-right-column";

  const conditions = document.createElement("div");
  conditions.className = "condition-badge-list";
  conditions.append(createConditionBadge(comic.condition, comic.isDuplicate ? "Exemplar 1" : "Zustand"));

  if (comic.isDuplicate) {
    conditions.append(createConditionBadge(comic.duplicateCondition || comic.condition, "Exemplar 2"));
  }

  const menu = document.createElement("details");
  menu.className = "card-menu";
  const menuSummary = document.createElement("summary");
  menuSummary.setAttribute("aria-label", `${comic.series}, Band ${comic.volumeNumber} verwalten`);
  menuSummary.append(createSettingsIcon());
  const menuContent = document.createElement("div");
  menuContent.className = "card-menu-content";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "menu-action";
  editButton.dataset.action = "edit";
  editButton.textContent = "Bearbeiten";

  const duplicateButton = document.createElement("button");
  duplicateButton.type = "button";
  duplicateButton.className = "menu-action";
  duplicateButton.dataset.action = "duplicate";
  duplicateButton.textContent = comic.isDuplicate ? "Zweites Exemplar verwalten" : "Zweites Exemplar hinzufügen";

  const enrichButton = document.createElement("button");
  enrichButton.type = "button";
  enrichButton.className = "menu-action";
  enrichButton.dataset.action = "enrich";
  enrichButton.textContent = "Duckipedia aktualisieren";
  enrichButton.disabled = !comic.numericBandNumber;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "menu-action menu-action-danger";
  deleteButton.dataset.action = "delete";
  deleteButton.textContent = "Löschen";

  menuContent.append(editButton, duplicateButton, enrichButton, deleteButton);
  menu.append(menuSummary, menuContent);
  rightColumn.append(conditions, menu);
  top.append(headingGroup, rightColumn);

  const tags = document.createElement("div");
  tags.className = "tag-list";
  tags.append(createTag(comic.isRead ? "Gelesen" : "Ungelesen", comic.isRead));
  if (comic.isSealed) tags.append(createTag("Foliert", true));
  if (comic.isDuplicate) tags.append(createTag("Doppelt", true));

  const duckipediaLink = document.createElement("a");
  duckipediaLink.className = "duckipedia-link";
  duckipediaLink.href = comic.duckipediaPageUrl || createConfiguredDuckipediaUrl(comic.series, comic.volumeNumber, comic.title);
  duckipediaLink.target = "_blank";
  duckipediaLink.rel = "noopener noreferrer";
  duckipediaLink.textContent = "In Duckipedia nachschlagen ↗";

  content.append(top, tags);

  if (comic.notes) {
    const notes = document.createElement("p");
    notes.className = "comic-notes";
    notes.textContent = comic.notes;
    content.append(notes);
  }

  if (comic.metadataFetchedAt) {
    const metadataNote = document.createElement("p");
    metadataNote.className = "metadata-source-note";
    metadataNote.textContent = `Duckipedia zuletzt geprüft: ${formatDateTime(comic.metadataFetchedAt)}`;
    content.append(metadataNote);
  }

  content.append(duckipediaLink);
  shell.append(content);
  article.append(shell);
  return article;
}

async function hydrateComicCardCover(shell, figure, image, comic) {
  try {
    const localCover = await getCoverMedia(comic.id);
    if (!figure.isConnected) return;

    if (localCover?.blob instanceof Blob) {
      const objectUrl = URL.createObjectURL(localCover.blob);
      state.cardCoverObjectUrls.add(objectUrl);
      image.src = objectUrl;
      figure.classList.remove("hidden");
      shell.classList.add("has-cover");
      return;
    }

    if (comic.duckipediaCoverUrl) {
      image.src = comic.duckipediaCoverUrl;
      image.addEventListener("load", () => {
        if (!figure.isConnected) return;
        figure.classList.remove("hidden");
        shell.classList.add("has-cover");
      }, { once: true });
      image.addEventListener("error", () => {
        figure.remove();
        shell.classList.remove("has-cover");
      }, { once: true });
    } else {
      figure.remove();
    }
  } catch (error) {
    console.warn("Cover konnte in der Kartenansicht nicht geladen werden:", error);
    figure.remove();
  }
}

function clearCardCoverObjectUrls() {
  state.cardCoverObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.cardCoverObjectUrls.clear();
}

function createConditionBadge(conditionCode, contextLabel) {
  const badge = document.createElement("span");
  const normalizedCode = String(conditionCode || "").toUpperCase();
  badge.className = `condition-badge condition-${normalizedCode.toLowerCase()}`;
  badge.textContent = normalizedCode || "–";
  badge.title = `${contextLabel}: ${getConditionLabel(normalizedCode)}`;
  badge.setAttribute("aria-label", badge.title);
  return badge;
}

function createSettingsIcon() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("settings-icon");

  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", "M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Zm9 3.75c0-.55-.05-1.08-.15-1.6l-2.08-.48a7.32 7.32 0 0 0-.72-1.74l1.13-1.82a9.1 9.1 0 0 0-2.26-2.26L15.1 5.22a7.32 7.32 0 0 0-1.74-.72L12.88 2.4a9.47 9.47 0 0 0-3.2 0L9.2 4.5c-.62.18-1.2.42-1.75.72L5.64 4.09a9.1 9.1 0 0 0-2.26 2.26L4.5 8.18c-.3.55-.54 1.13-.72 1.74l-2.08.48a9.47 9.47 0 0 0 0 3.2l2.08.48c.18.61.42 1.2.72 1.74l-1.13 1.82a9.1 9.1 0 0 0 2.26 2.26l1.82-1.13c.55.3 1.13.54 1.75.72l.48 2.08a9.47 9.47 0 0 0 3.2 0l.48-2.08a7.32 7.32 0 0 0 1.74-.72l1.82 1.13a9.1 9.1 0 0 0 2.26-2.26l-1.13-1.82c.3-.55.54-1.13.72-1.74l2.08-.48c.1-.52.15-1.05.15-1.6Z");
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function createTag(label, active) {
  const tag = document.createElement("span");
  tag.className = active ? "tag tag-active" : "tag";
  tag.textContent = label;
  return tag;
}

function renderStats() {
  const total = state.comics.length;
  const read = state.comics.filter((comic) => comic.isRead).length;
  const sealed = state.comics.filter((comic) => comic.isSealed).length;
  const duplicate = state.comics.filter((comic) => comic.isDuplicate).length;
  const physicalCopies = total + duplicate;
  const seriesCount = new Set(state.comics.map((comic) => comic.series)).size;
  const missingCount = countMissingBands(state.missingGroups);

  elements.statTotal.textContent = total;
  elements.statSeries.textContent = seriesCount;
  elements.statRead.textContent = read;
  elements.statUnread.textContent = total - read;
  elements.statSealed.textContent = sealed;
  elements.statDuplicate.textContent = duplicate;
  elements.statMissing.textContent = missingCount;
  elements.conditionStatsTotal.textContent = physicalCopies === 1 ? "1 Exemplar" : `${physicalCopies} Exemplare`;

  elements.conditionStats.replaceChildren();
  APP_CONFIG.conditions.forEach((condition) => {
    const primaryCount = state.comics.filter((comic) => comic.condition === condition.code).length;
    const duplicateCount = state.comics.filter(
      (comic) => comic.isDuplicate && (comic.duplicateCondition || comic.condition) === condition.code
    ).length;
    const count = primaryCount + duplicateCount;
    const percentage = physicalCopies > 0 ? (count / physicalCopies) * 100 : 0;

    const row = document.createElement("div");
    row.className = "condition-stat-row";
    const label = document.createElement("span");
    label.className = "condition-stat-label";
    label.textContent = condition.label;
    const bar = document.createElement("span");
    bar.className = "condition-stat-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "condition-stat-fill";
    fill.style.width = `${percentage}%`;
    bar.append(fill);
    const countElement = document.createElement("span");
    countElement.className = "condition-stat-count";
    countElement.textContent = count;
    row.append(label, bar, countElement);
    elements.conditionStats.append(row);
  });
}

function renderMissingBands({ forceOpenSeries = "" } = {}) {
  const currentlyOpen = new Set(state.openMissingSeries || []);
  elements.missingList.querySelectorAll("details[open][data-series]").forEach((details) => {
    currentlyOpen.add(details.dataset.series);
  });
  if (forceOpenSeries) currentlyOpen.add(forceOpenSeries);
  state.openMissingSeries = currentlyOpen;

  const groupsWithMissing = getScopedMissingGroups().filter((group) => group.missingBands.length > 0);
  const totalMissing = countMissingBands(groupsWithMissing);

  elements.missingList.replaceChildren();
  elements.missingEmpty.classList.toggle("hidden", groupsWithMissing.length > 0);
  elements.missingPageCount.textContent = totalMissing === 1 ? "1 fehlt" : `${totalMissing} fehlen`;
  renderMissingHub();

  groupsWithMissing.forEach((group) => {
    const details = document.createElement("details");
    details.className = "missing-card missing-series-details";
    details.dataset.series = group.series;
    details.open = currentlyOpen.has(group.series);
    details.addEventListener("toggle", () => {
      if (details.open) state.openMissingSeries.add(group.series);
      else state.openMissingSeries.delete(group.series);
    });

    const summary = document.createElement("summary");
    const summaryText = document.createElement("span");
    const heading = document.createElement("strong");
    heading.textContent = group.series;
    const meta = document.createElement("small");
    meta.textContent = `${group.missingBands.length} fehlend · geprüft bis Band ${group.highestChecked}`;
    summaryText.append(heading, meta);
    const icon = document.createElement("span");
    icon.className = "disclosure-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌄";
    summary.append(summaryText, icon);

    const list = document.createElement("div");
    list.className = "missing-band-list detailed-missing-list";

    group.missingBands.forEach((bandNumber) => {
      const key = createMissingDetailKey(group.series, bandNumber);
      const detail = state.settings.missingBandDetails?.[key] || {};
      const button = document.createElement("button");
      button.type = "button";
      button.className = detail.title || detail.desiredCondition || detail.notes || detail.publicationYear
        ? "missing-band missing-band-detailed"
        : "missing-band";
      button.dataset.series = group.series;
      button.dataset.bandNumber = String(bandNumber);

      const number = document.createElement("strong");
      number.textContent = `Band ${bandNumber}`;
      button.append(number);

      const detailsText = [
        detail.title,
        detail.publicationYear ? String(detail.publicationYear) : "",
        detail.desiredCondition ? `Wunsch: ${getConditionLabel(detail.desiredCondition)}` : ""
      ].filter(Boolean).join(" · ");

      if (detailsText) {
        const extra = document.createElement("small");
        extra.textContent = detailsText;
        button.append(extra);
      }

      list.append(button);
    });

    details.append(summary, list);
    elements.missingList.append(details);
  });
}

async function handleCardAction(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const card = button.closest("[data-comic-id]");
  const comic = state.comics.find((entry) => entry.id === card?.dataset.comicId);

  if (!comic) {
    showToast("Der Eintrag wurde nicht gefunden.", "error");
    return;
  }

  if (button.dataset.action === "edit") {
    closeCollectionPage({ returnFocus: false });
    startEditing(comic);
    return;
  }

  if (button.dataset.action === "duplicate") {
    openDuplicateModal(comic);
    return;
  }

  if (button.dataset.action === "enrich") {
    await enrichSingleComic(comic, { force: true });
    return;
  }

  if (button.dataset.action === "delete") {
    await confirmAndDelete(comic);
  }
}

function openDuplicateModal(comic) {
  state.selectedDuplicateComicId = comic.id;
  elements.duplicateContext.textContent = `${comic.series} · Band ${comic.volumeNumber}${comic.title ? ` · ${comic.title}` : ""}`;
  elements.duplicateModalCondition.value = comic.duplicateCondition || comic.condition || "VG";
  elements.duplicateSave.textContent = comic.isDuplicate ? "Zustand speichern" : "Zweites Exemplar hinzufügen";
  elements.duplicateRemove.classList.toggle("hidden", !comic.isDuplicate);
  elements.duplicateMessage.textContent = comic.isDuplicate
    ? "Der Band bleibt ein einzelner Sammlungsdatensatz. Nur das zweite physische Exemplar wird verwaltet."
    : "Das zweite Exemplar wird im bestehenden Band gespeichert. Es entsteht kein doppelter Sammlungsdatensatz.";
  elements.duplicateMessage.dataset.type = "info";
  elements.duplicateModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.duplicateModalCondition.focus(), 0);
}

function closeDuplicateModal() {
  elements.duplicateModal.classList.add("hidden");
  state.selectedDuplicateComicId = null;
  elements.duplicateMessage.textContent = "";
  restoreBodyModalState();
}

async function handleSaveDuplicateCopy(event) {
  event.preventDefault();
  const comic = state.comics.find((entry) => entry.id === state.selectedDuplicateComicId);
  if (!comic) return;
  const condition = elements.duplicateModalCondition.value;
  if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
    elements.duplicateMessage.textContent = "Bitte wähle einen gültigen Zustand aus.";
    elements.duplicateMessage.dataset.type = "error";
    return;
  }

  elements.duplicateSave.disabled = true;
  try {
    await saveComic({
      ...comic,
      isDuplicate: true,
      duplicateCondition: condition,
      dataFormatVersion: APP_CONFIG.dataFormatVersion,
      updatedAt: new Date().toISOString()
    });
    await recordDataChange(1);
    closeDuplicateModal();
    await refreshCollection();
    showToast(comic.isDuplicate ? "Zustand des zweiten Exemplars aktualisiert." : "Zweites Exemplar hinzugefügt.", "success");
  } catch (error) {
    elements.duplicateMessage.textContent = `Zweites Exemplar konnte nicht gespeichert werden: ${error.message}`;
    elements.duplicateMessage.dataset.type = "error";
  } finally {
    elements.duplicateSave.disabled = false;
  }
}

async function handleRemoveDuplicateCopy() {
  const comic = state.comics.find((entry) => entry.id === state.selectedDuplicateComicId);
  if (!comic?.isDuplicate) return;
  if (!window.confirm("Das zweite Exemplar dieses Bands entfernen? Der ursprüngliche Band bleibt erhalten.")) return;

  elements.duplicateRemove.disabled = true;
  try {
    await saveComic({
      ...comic,
      isDuplicate: false,
      duplicateCondition: null,
      dataFormatVersion: APP_CONFIG.dataFormatVersion,
      updatedAt: new Date().toISOString()
    });
    await recordDataChange(1);
    closeDuplicateModal();
    await refreshCollection();
    showToast("Zweites Exemplar entfernt.", "success");
  } catch (error) {
    elements.duplicateMessage.textContent = `Zweites Exemplar konnte nicht entfernt werden: ${error.message}`;
    elements.duplicateMessage.dataset.type = "error";
  } finally {
    elements.duplicateRemove.disabled = false;
  }
}

function mergeComicWithMetadata(comic, metadata) {
  const nextValues = {
    title: comic.title || metadata.title || "",
    publicationYear: comic.publicationYear || metadata.publicationYear || null,
    duckipediaPageUrl: metadata.pageUrl || comic.duckipediaPageUrl || createConfiguredDuckipediaUrl(comic.series, comic.volumeNumber, comic.title),
    duckipediaCoverUrl: metadata.coverUrl || comic.duckipediaCoverUrl || "",
    metadataStatus: metadata.found ? "found" : "not-found",
    metadataFetchedAt: metadata.fetchedAt || comic.metadataFetchedAt || new Date().toISOString(),
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  };
  const changed = Object.entries(nextValues).some(([key, value]) => comic[key] !== value);
  return {
    changed,
    comic: changed ? { ...comic, ...nextValues, updatedAt: new Date().toISOString() } : comic
  };
}

async function enrichSingleComic(comic, { force = false, silent = false } = {}) {
  if (!comic.numericBandNumber) {
    if (!silent) showToast("Dieser Eintrag besitzt keine rein numerische Bandnummer.", "error");
    return { changed: false, found: false };
  }

  try {
    const metadata = await getMetadataForBand(comic.series, comic.numericBandNumber, { force });
    const { comic: updatedComic, changed } = mergeComicWithMetadata(comic, metadata);

    if (changed) {
      await saveComic(updatedComic);
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
  state.editingId = comic.id;
  state.editingComic = comic;

  elements.series.value = comic.series;
  elements.volumeNumber.value = comic.volumeNumber;
  elements.publicationYear.value = comic.publicationYear ?? "";
  elements.title.value = comic.title;
  elements.condition.value = comic.condition;
  elements.duplicateCondition.value = comic.duplicateCondition || comic.condition;
  elements.isRead.checked = comic.isRead;
  elements.isDuplicate.checked = comic.isDuplicate;
  elements.isSealed.checked = comic.isSealed;
  elements.notes.value = comic.notes;
  state.formMetadata = {
    series: comic.series,
    bandNumber: comic.numericBandNumber,
    found: comic.metadataStatus === "found",
    pageUrl: comic.duckipediaPageUrl || createConfiguredDuckipediaUrl(comic.series, comic.volumeNumber, comic.title),
    coverUrl: comic.duckipediaCoverUrl || "",
    fetchedAt: comic.metadataFetchedAt || null
  };
  elements.metadataStatus.textContent = comic.metadataFetchedAt
    ? `Duckipedia-Daten zuletzt geprüft: ${formatDateTime(comic.metadataFetchedAt)}.`
    : "Für diesen Eintrag wurden noch keine Duckipedia-Metadaten gespeichert.";
  elements.metadataStatus.dataset.type = "info";
  loadExistingCoverIntoForm(comic);
  updateDuplicateConditionVisibility();

  elements.formTitle.textContent = "Comic bearbeiten";
  elements.cancelEdit.classList.remove("hidden");
  elements.saveNext.classList.add("hidden");
  clearValidationErrors();
  showFormMessage("Du bearbeitest einen vorhandenen Eintrag.");

  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.series.focus({ preventScroll: true });
}

async function confirmAndDelete(comic) {
  const label = comic.title
    ? `${comic.series}, Band ${comic.volumeNumber} „${comic.title}“`
    : `${comic.series}, Band ${comic.volumeNumber}`;

  const confirmed = window.confirm(
    `Möchtest du ${label} wirklich löschen? Ohne aktuelles JSON-Backup kann dieser Schritt nicht rückgängig gemacht werden.`
  );

  if (!confirmed) {
    return;
  }

  try {
    const hadCover = Boolean(await getCoverMedia(comic.id));
    await deleteComic(comic.id);
    await recordDataChange(1);
    if (hadCover) await recordMediaChange(1);

    if (state.editingId === comic.id) {
      resetForm();
    }

    await refreshCollection();
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
  elements.condition.value = "VG";
  elements.duplicateCondition.value = "VG";
  updateDuplicateConditionVisibility();
  state.editingId = null;
  state.editingComic = null;
  elements.formTitle.textContent = "Comic hinzufügen";
  elements.cancelEdit.classList.add("hidden");
  elements.saveNext.classList.remove("hidden");
  clearValidationErrors();
  showFormMessage("");
}

function resetFilters({ keepPageOpen = false } = {}) {
  elements.search.value = "";
  syncCollectionSeriesFilter(getAvailableSeries(state.settings, state.comics));
  elements.filterCondition.value = "all";
  elements.filterRead.value = "all";
  elements.filterSealed.checked = false;
  elements.filterDuplicate.checked = false;
  elements.sortBy.value = "series";
  renderCollection();
  elements.filterPanel.open = false;
  if (!keepPageOpen) elements.search.blur();
}

function getActiveFilterCount() {
  return [
    Boolean(elements.search.value.trim()),
    state.collectionScope === "other" && elements.filterSeries.value !== "all",
    elements.filterCondition.value !== "all",
    elements.filterRead.value !== "all",
    elements.filterSealed.checked,
    elements.filterDuplicate.checked,
    elements.sortBy.value !== "series"
  ].filter(Boolean).length;
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
    elements.duplicateCondition.value = elements.condition.value || "VG";
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

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setFormBusy(isBusy) {
  elements.form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
}

async function openScannerModal() {
  if (state.editingId) {
    showToast("Beende zuerst die Bearbeitung des geöffneten Eintrags.", "error");
    return;
  }

  const availableSeries = getAvailableSeries(state.settings, state.comics);
  if (availableSeries.includes(elements.series.value)) {
    elements.scannerSeries.value = elements.series.value;
  }

  elements.scannerCondition.value = elements.condition.value || "VG";
  elements.scannerDuplicateCondition.value = elements.duplicateCondition.value || elements.scannerCondition.value;
  elements.scannerIsRead.checked = elements.isRead.checked;
  elements.scannerIsDuplicate.checked = elements.isDuplicate.checked;
  elements.scannerIsSealed.checked = elements.isSealed.checked;
  updateScannerDuplicateConditionVisibility();
  clearScannerResult();
  renderScannerQueue();
  elements.scannerModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setScannerStatus("Kamera wird vorbereitet …");

  try {
    await startScannerCamera();
  } catch (error) {
    console.warn("Scanner konnte beim Öffnen nicht automatisch starten:", error);
  }
}

function closeScannerModal() {
  stopScannerCamera();
  abortScannerLookup();
  clearScannerResult();
  elements.scannerPhoto.value = "";
  elements.scannerManualCode.value = "";
  elements.scannerModal.classList.add("hidden");
  restoreBodyModalState();
}

async function startScannerCamera() {
  if (!elements.scannerSeries.value) {
    setScannerStatus("Bitte wähle zuerst eine Reihe aus.", "error");
    elements.scannerSeries.focus();
    return;
  }

  if (!barcodeScanner?.isSupported()) {
    setScannerStatus(
      "Live-Scan ist hier nicht verfügbar. Nutze den Foto-Fallback oder prüfe, ob die App über HTTPS geöffnet wurde.",
      "error"
    );
    return;
  }

  stopScannerCamera();
  clearScannerResult();
  elements.scannerStart.disabled = true;
  elements.scannerCameraPlaceholder.classList.add("hidden");
  elements.scannerStart.classList.add("hidden");
  elements.scannerStop.classList.remove("hidden");
  setScannerStatus("Kamera aktiv: Richte die gesamte weiße Barcodefläche waagerecht im Rahmen aus.");

  try {
    await barcodeScanner.start({
      onDetected: handleScannerDetected,
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

  if (!file) {
    return;
  }

  if (!elements.scannerSeries.value) {
    setScannerStatus("Bitte wähle vor der Fotoauswertung eine Reihe aus.", "error");
    return;
  }

  stopScannerCamera();
  clearScannerResult();
  setScannerStatus("Foto wird lokal auf dem iPhone ausgewertet …");
  elements.scannerStart.disabled = true;

  try {
    const payload = await barcodeScanner.decodeImageFile(file);
    handleScannerDetected(payload);
  } catch (error) {
    console.error("Barcodefoto konnte nicht ausgewertet werden:", error);
    setScannerStatus(error.message, "error");
  } finally {
    elements.scannerStart.disabled = false;
  }
}

function handleScannerManualCode() {
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
  handleScannerDetected({ extension, bandNumber, mainBarcode: "", format: null });
}

function handleScannerDetected(payload) {
  const series = elements.scannerSeries.value;
  const token = `${series}::${payload.bandNumber}::${Date.now()}::${Math.random()}`;
  const pageUrl = createConfiguredDuckipediaUrl(series, payload.bandNumber);

  stopScannerCamera();
  abortScannerLookup();
  state.scannerResult = {
    ...payload,
    series,
    pageUrl,
    token
  };

  elements.scannerBandNumber.textContent = String(payload.bandNumber);
  elements.scannerExtension.textContent = `Code ${payload.extension}`;
  elements.scannerResultName.value = "";
  elements.scannerResultYear.value = "";
  elements.scannerDuckipediaLink.href = pageUrl;
  elements.scannerResult.classList.remove("hidden");
  setScannerStatus(`Band ${payload.bandNumber} wurde erkannt. Prüfe die Angaben und speichere den Band.` , "success");

  const existingCount = state.comics.filter((comic) => (
    comic.series === series && comic.numericBandNumber === payload.bandNumber
  )).length;
  elements.scannerExistingWarning.classList.toggle("hidden", existingCount === 0);
  elements.scannerExistingWarning.textContent = existingCount === 0
    ? ""
    : existingCount === 1
      ? "Dieser Band ist bereits einmal in deiner Sammlung eingetragen."
      : `Dieser Band ist bereits ${existingCount}-mal in deiner Sammlung eingetragen.`;

  lookupScannerMetadata(token);
}

async function lookupScannerMetadata(token) {
  if (!state.scannerResult || state.scannerResult.token !== token) {
    return;
  }

  if (!navigator.onLine) {
    elements.scannerLookupStatus.textContent = "Offline: Titel und Erscheinungsjahr können gerade nicht automatisch ergänzt werden.";
    return;
  }

  const controller = new AbortController();
  state.scannerLookupController = controller;
  elements.scannerLookupStatus.textContent = "Duckipedia wird nach Titel und Erscheinungsjahr durchsucht …";

  const result = await getMetadataForBand(
    state.scannerResult.series,
    state.scannerResult.bandNumber,
    { signal: controller.signal }
  );

  if (!state.scannerResult || state.scannerResult.token !== token || controller.signal.aborted) {
    return;
  }

  state.scannerResult.pageUrl = result.pageUrl;
  state.scannerResult.coverUrl = result.coverUrl || "";
  state.scannerResult.metadataFetchedAt = result.fetchedAt || new Date().toISOString();
  state.scannerResult.metadataStatus = result.found ? "found" : "not-found";
  elements.scannerDuckipediaLink.href = result.pageUrl;

  if (result.title) {
    elements.scannerResultName.value = result.title;
  }

  if (result.publicationYear) {
    elements.scannerResultYear.value = String(result.publicationYear);
  }

  if (result.found && (result.title || result.publicationYear)) {
    const foundParts = [result.title ? "Titel" : "", result.publicationYear ? "Jahr" : ""].filter(Boolean);
    elements.scannerLookupStatus.textContent = `${foundParts.join(" und ")} wurden aus Duckipedia ergänzt.`;
  } else if (result.found) {
    elements.scannerLookupStatus.textContent = "Die Bandseite wurde gefunden, enthält aber keine automatisch auswertbaren Titel- oder Jahresangaben.";
  } else {
    elements.scannerLookupStatus.textContent = result.reason || "Titel und Jahr konnten nicht automatisch ergänzt werden.";
  }
}

function abortScannerLookup() {
  state.scannerLookupController?.abort();
  state.scannerLookupController = null;
}

async function handleScannerSave() {
  if (!state.scannerResult) {
    setScannerStatus("Scanne zuerst einen Band.", "error");
    return;
  }

  try {
    const comic = buildComicFromScanner();
    const alreadyQueued = state.scannerQueue.some((item) => (
      item.series === comic.series && item.numericBandNumber === comic.numericBandNumber
    ));

    if (alreadyQueued) {
      setScannerStatus(`${comic.series}, Band ${comic.volumeNumber} befindet sich bereits in der Warteschlange.`, "error");
      return;
    }

    const existingComic = state.comics.find((entry) => (
      entry.series === comic.series && entry.numericBandNumber === comic.numericBandNumber
    ));

    state.scannerQueue.push({
      ...comic,
      queueId: createStableId(),
      extension: state.scannerResult.extension,
      pageUrl: state.scannerResult.pageUrl,
      existingComicId: existingComic?.id || null,
      action: existingComic ? "skip" : "add"
    });

    renderScannerQueue();
    clearScannerResult();
    setScannerStatus(`${comic.series}, Band ${comic.volumeNumber} wurde vorgemerkt. Bereit für den nächsten Scan.`, "success");
    await startScannerCamera();
  } catch (error) {
    console.error("Gescannter Band konnte nicht vorgemerkt werden:", error);
    setScannerStatus(`Übernahme fehlgeschlagen: ${error.message}`, "error");
  }
}

function renderScannerQueue() {
  elements.scannerQueueList.replaceChildren();
  const queue = state.scannerQueue;
  elements.scannerQueueCount.textContent = queue.length === 1 ? "1 Band" : `${queue.length} Bände`;
  elements.scannerSaveQueue.disabled = queue.length === 0;
  elements.scannerApplyDefaults.disabled = queue.length === 0;
  elements.scannerClearQueue.disabled = queue.length === 0;

  if (queue.length === 0) {
    const empty = document.createElement("p");
    empty.className = "scanner-queue-empty";
    empty.textContent = "Noch keine Bände vorgemerkt.";
    elements.scannerQueueList.append(empty);
    return;
  }

  queue.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "scanner-queue-card";
    card.dataset.queueId = item.queueId;

    const heading = document.createElement("div");
    heading.className = "scanner-queue-card-heading";
    const titleWrap = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.className = "stat-label";
    kicker.textContent = `Position ${index + 1}`;
    const title = document.createElement("h4");
    title.textContent = `${item.series} · Band ${item.volumeNumber}`;
    titleWrap.append(kicker, title);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button small-icon-button scanner-queue-remove";
    remove.dataset.queueAction = "remove";
    remove.setAttribute("aria-label", `${item.series}, Band ${item.volumeNumber} aus der Warteschlange entfernen`);
    remove.textContent = "×";
    heading.append(titleWrap, remove);

    const grid = document.createElement("div");
    grid.className = "field-grid compact-field-grid scanner-queue-fields";
    grid.append(
      createQueueInput("Titel", "title", item.title, "text", 200, "field-full"),
      createQueueInput("Erscheinungsjahr", "publicationYear", item.publicationYear ?? "", "number", 4),
      createQueueConditionSelect("Zustand", "condition", item.condition)
    );

    if (item.existingComicId) {
      const actionField = document.createElement("label");
      actionField.className = "field field-full";
      const actionLabel = document.createElement("span");
      actionLabel.textContent = "Bereits vorhanden";
      const actionSelect = document.createElement("select");
      actionSelect.dataset.queueField = "action";
      actionSelect.append(
        createOption("skip", "Überspringen"),
        createOption("second-copy", "Als zweites Exemplar übernehmen")
      );
      const existing = state.comics.find((comic) => comic.id === item.existingComicId);
      if (existing?.isDuplicate) {
        actionSelect.value = "skip";
        actionSelect.disabled = true;
        const hint = document.createElement("small");
        hint.className = "field-help";
        hint.textContent = "Dieser Band ist bereits als doppelt markiert.";
        actionField.append(actionLabel, actionSelect, hint);
      } else {
        actionSelect.value = item.action;
        actionField.append(actionLabel, actionSelect);
      }
      grid.append(actionField);
    }

    const toggles = document.createElement("div");
    toggles.className = "scanner-queue-toggles";
    toggles.append(
      createQueueCheckbox("Gelesen", "isRead", item.isRead),
      createQueueCheckbox("Foliert", "isSealed", item.isSealed),
      createQueueCheckbox("Doppelt", "isDuplicate", item.isDuplicate)
    );

    const duplicateField = createQueueConditionSelect("Zustand Exemplar 2", "duplicateCondition", item.duplicateCondition || item.condition);
    duplicateField.classList.toggle("hidden", !item.isDuplicate || Boolean(item.existingComicId));
    duplicateField.dataset.duplicateField = "true";
    grid.append(duplicateField);

    const link = document.createElement("a");
    link.className = "text-link scanner-queue-link";
    link.href = item.pageUrl || createConfiguredDuckipediaUrl(item.series, item.volumeNumber, item.title);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Duckipedia öffnen";

    card.append(heading, grid, toggles, link);
    elements.scannerQueueList.append(card);
  });
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

function createQueueConditionSelect(labelText, fieldName, value) {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const select = document.createElement("select");
  select.dataset.queueField = fieldName;
  APP_CONFIG.conditions.forEach((condition) => {
    select.append(createOption(condition.code, `${condition.label} – ${condition.code}`));
  });
  select.value = value;
  label.append(span, select);
  return label;
}

function createQueueCheckbox(labelText, fieldName, checked) {
  const label = document.createElement("label");
  label.className = "check-row compact-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.queueField = fieldName;
  input.checked = Boolean(checked);
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(input, span);
  return label;
}

function handleScannerQueueInput(event) {
  const control = event.target.closest("[data-queue-field]");
  const card = event.target.closest("[data-queue-id]");
  if (!control || !card) return;
  const item = state.scannerQueue.find((entry) => entry.queueId === card.dataset.queueId);
  if (!item) return;

  const field = control.dataset.queueField;
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    item[field] = control.checked;
  } else if (field === "publicationYear") {
    item.publicationYear = control.value ? Number(control.value) : null;
  } else {
    item[field] = control.value;
  }

  if (field === "isDuplicate") {
    if (item.isDuplicate && !item.duplicateCondition) item.duplicateCondition = item.condition;
    renderScannerQueue();
  }
}

function handleScannerQueueClick(event) {
  const button = event.target.closest("button[data-queue-action]");
  const card = event.target.closest("[data-queue-id]");
  if (!button || !card) return;
  if (button.dataset.queueAction === "remove") {
    state.scannerQueue = state.scannerQueue.filter((entry) => entry.queueId !== card.dataset.queueId);
    renderScannerQueue();
  }
}

function applyScannerDefaultsToQueue() {
  if (state.scannerQueue.length === 0) return;
  const condition = elements.scannerCondition.value;
  const isDuplicate = elements.scannerIsDuplicate.checked;
  state.scannerQueue.forEach((item) => {
    item.condition = condition;
    item.isRead = elements.scannerIsRead.checked;
    item.isSealed = elements.scannerIsSealed.checked;
    if (!item.existingComicId) {
      item.isDuplicate = isDuplicate;
      item.duplicateCondition = isDuplicate
        ? (elements.scannerDuplicateCondition.value || condition)
        : null;
    }
  });
  renderScannerQueue();
  elements.scannerQueueMessage.textContent = "Die aktuellen Scanner-Einstellungen wurden auf alle vorgemerkten Bände angewendet.";
  elements.scannerQueueMessage.dataset.type = "success";
}

function clearScannerQueue() {
  if (state.scannerQueue.length === 0) return;
  if (!window.confirm("Die gesamte Scanner-Warteschlange verwerfen? Noch nicht gespeicherte Bände gehen dabei verloren.")) return;
  state.scannerQueue = [];
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

  try {
    state.scannerQueue.forEach((item) => {
      validateQueuedComic(item);
      if (item.action === "skip") {
        skipped += 1;
        return;
      }

      if (item.action === "second-copy" && item.existingComicId) {
        const existing = state.comics.find((comic) => comic.id === item.existingComicId);
        if (!existing || existing.isDuplicate) {
          skipped += 1;
          return;
        }
        records.push({
          ...existing,
          title: existing.title || item.title,
          publicationYear: existing.publicationYear || item.publicationYear,
          isRead: existing.isRead || item.isRead,
          isSealed: existing.isSealed || item.isSealed,
          isDuplicate: true,
          duplicateCondition: item.condition,
          updatedAt: new Date().toISOString()
        });
        return;
      }

      const { queueId, extension, pageUrl, existingComicId, action, ...comic } = item;
      records.push({
        ...comic,
        duplicateCondition: comic.isDuplicate ? (comic.duplicateCondition || comic.condition) : null,
        updatedAt: new Date().toISOString()
      });
    });
  } catch (error) {
    elements.scannerQueueMessage.textContent = error.message;
    elements.scannerQueueMessage.dataset.type = "error";
    return;
  }

  if (records.length === 0) {
    elements.scannerQueueMessage.textContent = "Alle vorgemerkten Bände sind auf Überspringen gestellt.";
    elements.scannerQueueMessage.dataset.type = "info";
    return;
  }

  setScannerControlsBusy(true);
  try {
    await upsertComics(records);
    await recordDataChange(records.length);
    state.scannerQueue = [];
    renderScannerQueue();
    await refreshCollection();
    elements.scannerQueueMessage.textContent = `${records.length} Bände gespeichert${skipped ? `, ${skipped} übersprungen` : ""}.`;
    elements.scannerQueueMessage.dataset.type = "success";
    showToast(`${records.length} Bände aus der Warteschlange gespeichert.`);
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
  if (!APP_CONFIG.conditions.some((entry) => entry.code === item.condition)) {
    throw new Error(`${item.series}, Band ${item.volumeNumber}: Ungültiger Zustand.`);
  }
  if (item.isDuplicate && !APP_CONFIG.conditions.some((entry) => entry.code === item.duplicateCondition)) {
    throw new Error(`${item.series}, Band ${item.volumeNumber}: Zustand des zweiten Exemplars fehlt.`);
  }
  if (item.title.length > 200) {
    throw new Error(`${item.series}, Band ${item.volumeNumber}: Der Titel ist zu lang.`);
  }
  if (
    item.publicationYear !== null &&
    (!Number.isInteger(item.publicationYear) || item.publicationYear < 1800 || item.publicationYear > APP_CONFIG.publicationYearMaximum)
  ) {
    throw new Error(`${item.series}, Band ${item.volumeNumber}: Ungültiges Erscheinungsjahr.`);
  }
}

function buildComicFromScanner() {
  const scan = state.scannerResult;
  const series = elements.scannerSeries.value;
  const condition = elements.scannerCondition.value;
  const isDuplicate = elements.scannerIsDuplicate.checked;
  const duplicateCondition = isDuplicate ? elements.scannerDuplicateCondition.value : null;
  const title = elements.scannerResultName.value.trim();
  const yearRaw = elements.scannerResultYear.value.trim();
  const publicationYear = yearRaw ? Number(yearRaw) : null;

  if (!scan || !series || scan.series !== series) {
    throw new Error("Die Reihe wurde nach dem Scan geändert. Bitte scanne den Band erneut.");
  }

  if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
    throw new Error("Bitte wähle einen gültigen Zustand aus.");
  }

  if (isDuplicate && !APP_CONFIG.conditions.some((entry) => entry.code === duplicateCondition)) {
    throw new Error("Bitte wähle den Zustand des zweiten Exemplars aus.");
  }

  if (title.length > 200) {
    throw new Error("Der Titel darf höchstens 200 Zeichen enthalten.");
  }

  if (
    publicationYear !== null &&
    (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > APP_CONFIG.publicationYearMaximum)
  ) {
    throw new Error(`Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`);
  }

  const now = new Date().toISOString();

  return {
    id: createStableId(),
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    series,
    volumeNumber: String(scan.bandNumber),
    numericBandNumber: scan.bandNumber,
    title,
    publicationYear,
    condition,
    duplicateCondition,
    isRead: elements.scannerIsRead.checked,
    isDuplicate,
    isSealed: elements.scannerIsSealed.checked,
    notes: "",
    duckipediaPageUrl: scan.pageUrl || createConfiguredDuckipediaUrl(series, scan.bandNumber, title),
    duckipediaCoverUrl: scan.coverUrl || "",
    metadataStatus: scan.metadataStatus || "",
    metadataFetchedAt: scan.metadataFetchedAt || null,
    createdAt: now,
    updatedAt: now
  };
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
    elements.scannerDuplicateCondition.value = elements.scannerCondition.value || "VG";
  }
}

function setScannerControlsBusy(isBusy) {
  [
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
  const allSeries = getAvailableSeries(state.settings, state.comics)
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
    const nextConfig = { name, duckipediaPattern: pattern };
    let nextConfigs;
    let nextHighest = { ...(state.settings.knownHighestBandBySeries || {}) };
    let nextDetails = { ...(state.settings.missingBandDetails || {}) };
    let nextFleaItems = { ...(state.settings.fleaMarketSession?.items || {}) };

    if (originalName) {
      nextConfigs = currentConfigs.map((entry) => entry.name === originalName ? nextConfig : entry);
      if (name !== originalName) {
        const usedCount = state.comics.filter((comic) => comic.series === originalName).length;
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
    const configuredComics = state.comics
      .filter((comic) => comic.series === sourceSeriesName)
      .map((comic) => {
        const pageUrl = comic.numericBandNumber
          ? buildDuckipediaUrl(name, comic.volumeNumber, comic.title, temporarySettings)
          : comic.duckipediaPageUrl;
        const changed = comic.series !== name || comic.duckipediaPageUrl !== pageUrl;
        return changed
          ? {
              ...comic,
              series: name,
              duckipediaPageUrl: pageUrl,
              dataFormatVersion: APP_CONFIG.dataFormatVersion,
              updatedAt: new Date().toISOString()
            }
          : null;
      })
      .filter(Boolean);

    if (configuredComics.length > 0) await upsertComics(configuredComics);
    await saveMeaningfulSettings({
      customSeries: nextConfigs.map((entry) => entry.name),
      customSeriesConfigs: nextConfigs,
      knownHighestBandBySeries: nextHighest,
      missingBandDetails: nextDetails,
      fleaMarketSession: {
        items: nextFleaItems,
        updatedAt: state.settings.fleaMarketSession?.updatedAt || null
      }
    }, Math.max(1, configuredComics.length));

    if (configuredComics.length > 0) await refreshCollection();
    else populateConfiguration();
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
      copy.append(label, path);

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
  const isUsed = state.comics.some((comic) => comic.series === seriesName);
  const prompt = isUsed
    ? `„${seriesName}“ wird von gespeicherten Comics verwendet. Nur aus der persönlichen Auswahlliste entfernen? Bestehende Comics bleiben erhalten.`
    : `„${seriesName}“ aus der persönlichen Auswahlliste entfernen?`;
  if (!window.confirm(prompt)) return;

  const nextConfigs = (state.settings.customSeriesConfigs || []).filter((entry) => entry.name !== seriesName);
  await saveMeaningfulSettings({
    customSeries: nextConfigs.map((entry) => entry.name),
    customSeriesConfigs: nextConfigs
  });
  populateConfiguration();
  renderCustomSeriesList();
  if (state.editingCustomSeriesName === seriesName) resetCustomSeriesForm();
  elements.seriesMessage.textContent = `„${seriesName}“ wurde aus der persönlichen Liste entfernt.`;
  elements.seriesMessage.dataset.type = "success";
}

function handleMissingBandClick(event) {
  const button = event.target.closest("button[data-series][data-band-number]");
  if (!button) return;
  openMissingDetailModal(button.dataset.series, Number(button.dataset.bandNumber));
}

async function openMissingDetailModal(series, bandNumber) {
  const key = createMissingDetailKey(series, bandNumber);
  const detail = state.settings.missingBandDetails?.[key] || {};
  const lookupSequence = ++state.missingLookupSequence;
  state.selectedMissingBand = { series, bandNumber, key };
  state.openMissingSeries.add(series);
  elements.missingDetailContext.textContent = `${series} · Band ${bandNumber}`;
  elements.missingDetailName.value = detail.title || "";
  elements.missingDetailYear.value = detail.publicationYear ?? "";
  elements.missingDetailCondition.value = detail.desiredCondition || "";
  elements.missingDetailUrl.value = detail.duckipediaUrl || "";
  elements.missingDetailNotes.value = detail.notes || "";
  elements.missingDuckipediaLink.href = detail.duckipediaUrl || createConfiguredDuckipediaUrl(series, bandNumber, detail.title || "");
  elements.missingDuckipediaLink.textContent = "Duckipedia öffnen";
  elements.deleteMissingDetail.classList.toggle("hidden", !hasMissingDetailContent(detail));
  elements.missingDetailMessage.textContent = "Duckipedia-Daten werden geladen …";
  elements.missingDetailMessage.dataset.type = "info";
  elements.missingDetailModal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  try {
    const metadata = await getMetadataForBand(series, bandNumber, { force: false });
    if (lookupSequence !== state.missingLookupSequence || state.selectedMissingBand?.key !== key) return;

    const currentDetail = state.settings.missingBandDetails?.[key] || {};
    const typedTitle = elements.missingDetailName.value.trim();
    const typedYear = Number(elements.missingDetailYear.value) || null;
    const typedUrl = normalizeHttpUrl(elements.missingDetailUrl.value);
    const enrichedDetail = {
      ...currentDetail,
      title: currentDetail.title || typedTitle || metadata.title || "",
      publicationYear: currentDetail.publicationYear || typedYear || metadata.publicationYear || null,
      duckipediaUrl: currentDetail.duckipediaUrl || typedUrl || metadata.pageUrl || createConfiguredDuckipediaUrl(series, bandNumber),
      metadataFetchedAt: metadata.fetchedAt || new Date().toISOString()
    };

    elements.missingDetailName.value = enrichedDetail.title || "";
    elements.missingDetailYear.value = enrichedDetail.publicationYear ?? "";
    elements.missingDetailUrl.value = enrichedDetail.duckipediaUrl || "";
    elements.missingDuckipediaLink.href = enrichedDetail.duckipediaUrl || createConfiguredDuckipediaUrl(series, bandNumber);

    const changed = enrichedDetail.title !== (currentDetail.title || "")
      || enrichedDetail.publicationYear !== (currentDetail.publicationYear || null)
      || enrichedDetail.duckipediaUrl !== (currentDetail.duckipediaUrl || "");

    if (metadata.found && changed) {
      const nextDetails = { ...(state.settings.missingBandDetails || {}), [key]: enrichedDetail };
      await saveMeaningfulSettings({ missingBandDetails: nextDetails });
      renderMissingBands({ forceOpenSeries: series });
      elements.deleteMissingDetail.classList.remove("hidden");
    }

    elements.missingDetailMessage.textContent = metadata.found
      ? "Titel und Erscheinungsjahr wurden automatisch aus Duckipedia ergänzt, soweit verfügbar."
      : (metadata.reason || "Für diesen Band wurden keine Zusatzdaten gefunden.");
    elements.missingDetailMessage.dataset.type = metadata.found ? "success" : "info";
  } catch (error) {
    if (lookupSequence !== state.missingLookupSequence) return;
    elements.missingDetailMessage.textContent = `Duckipedia-Daten konnten nicht geladen werden: ${error.message}`;
    elements.missingDetailMessage.dataset.type = "error";
  } finally {
    if (lookupSequence === state.missingLookupSequence) {
      window.setTimeout(() => elements.missingDetailName.focus(), 0);
    }
  }
}

function closeMissingDetailModal() {
  state.missingLookupSequence += 1;
  elements.missingDetailModal.classList.add("hidden");
  state.selectedMissingBand = null;
  elements.missingDetailForm.reset();
  elements.missingDetailMessage.textContent = "";
  restoreBodyModalState();
}

async function handleSaveMissingDetail(event) {
  event.preventDefault();
  if (!state.selectedMissingBand) return;

  const title = elements.missingDetailName.value.trim();
  const yearRaw = elements.missingDetailYear.value.trim();
  const desiredCondition = elements.missingDetailCondition.value;
  const notes = elements.missingDetailNotes.value.trim();
  const duckipediaUrl = normalizeHttpUrl(elements.missingDetailUrl.value);

  if (elements.missingDetailUrl.value.trim() && !duckipediaUrl) {
    elements.missingDetailMessage.textContent = "Der Duckipedia-Link muss mit http:// oder https:// beginnen.";
    elements.missingDetailMessage.dataset.type = "error";
    return;
  }

  let publicationYear = null;
  if (yearRaw) {
    publicationYear = Number(yearRaw);
    if (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > APP_CONFIG.publicationYearMaximum) {
      elements.missingDetailMessage.textContent = `Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`;
      elements.missingDetailMessage.dataset.type = "error";
      return;
    }
  }

  const nextDetails = { ...(state.settings.missingBandDetails || {}) };
  nextDetails[state.selectedMissingBand.key] = {
    title,
    publicationYear,
    desiredCondition,
    notes,
    duckipediaUrl,
    updatedAt: new Date().toISOString()
  };

  const openSeries = state.selectedMissingBand.series;
  await saveMeaningfulSettings({ missingBandDetails: nextDetails });
  renderMissingBands({ forceOpenSeries: openSeries });
  closeMissingDetailModal();
  showToast("Details zum fehlenden Band gespeichert.");
}

async function handleMarkMissingBandOwned() {
  if (!state.selectedMissingBand) return;

  const selected = { ...state.selectedMissingBand };
  const condition = elements.missingDetailCondition.value;
  if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
    elements.missingDetailMessage.textContent = "Bitte wähle zuerst den Zustand des gefundenen Bands aus.";
    elements.missingDetailMessage.dataset.type = "error";
    elements.missingDetailCondition.focus();
    return;
  }

  const yearRaw = elements.missingDetailYear.value.trim();
  let publicationYear = null;
  if (yearRaw) {
    publicationYear = Number(yearRaw);
    if (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > APP_CONFIG.publicationYearMaximum) {
      elements.missingDetailMessage.textContent = `Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`;
      elements.missingDetailMessage.dataset.type = "error";
      elements.missingDetailYear.focus();
      return;
    }
  }

  const typedUrl = elements.missingDetailUrl.value.trim();
  const duckipediaUrl = normalizeHttpUrl(typedUrl);
  if (typedUrl && !duckipediaUrl) {
    elements.missingDetailMessage.textContent = "Der Duckipedia-Link muss mit http:// oder https:// beginnen.";
    elements.missingDetailMessage.dataset.type = "error";
    return;
  }

  elements.missingMarkOwned.disabled = true;
  elements.missingDetailMessage.textContent = "Band wird in die Sammlung übernommen …";
  elements.missingDetailMessage.dataset.type = "info";

  try {
    const metadata = await getMetadataCache(createMetadataCacheKey(selected.series, selected.bandNumber));
    const now = new Date().toISOString();
    const comic = {
      id: createStableId(),
      dataFormatVersion: APP_CONFIG.dataFormatVersion,
      series: selected.series,
      volumeNumber: String(selected.bandNumber),
      numericBandNumber: selected.bandNumber,
      title: elements.missingDetailName.value.trim(),
      publicationYear,
      condition,
      duplicateCondition: null,
      isRead: false,
      isDuplicate: false,
      isSealed: false,
      notes: elements.missingDetailNotes.value.trim(),
      duckipediaPageUrl: duckipediaUrl || metadata?.pageUrl || createConfiguredDuckipediaUrl(selected.series, selected.bandNumber),
      duckipediaCoverUrl: metadata?.coverUrl || "",
      metadataStatus: metadata?.found === true ? "found" : "",
      metadataFetchedAt: metadata?.fetchedAt || null,
      createdAt: now,
      updatedAt: now
    };

    await saveComic(comic);
    const nextDetails = { ...(state.settings.missingBandDetails || {}) };
    delete nextDetails[selected.key];
    const nextFleaItems = { ...(state.settings.fleaMarketSession?.items || {}) };
    delete nextFleaItems[selected.key];
    await saveMeaningfulSettings({
      missingBandDetails: nextDetails,
      fleaMarketSession: { items: nextFleaItems, updatedAt: state.settings.fleaMarketSession?.updatedAt || null }
    });
    state.openMissingSeries.add(selected.series);
    closeMissingDetailModal();
    await refreshCollection();
    showToast(`${selected.series} Band ${selected.bandNumber} wurde als vorhanden eingetragen.`);
  } catch (error) {
    console.error(error);
    elements.missingDetailMessage.textContent = `Band konnte nicht übernommen werden: ${error.message}`;
    elements.missingDetailMessage.dataset.type = "error";
  } finally {
    elements.missingMarkOwned.disabled = false;
  }
}

async function handleDeleteMissingDetail() {
  if (!state.selectedMissingBand) return;
  const nextDetails = { ...(state.settings.missingBandDetails || {}) };
  delete nextDetails[state.selectedMissingBand.key];
  const openSeries = state.selectedMissingBand.series;
  await saveMeaningfulSettings({ missingBandDetails: nextDetails });
  renderMissingBands({ forceOpenSeries: openSeries });
  closeMissingDetailModal();
  showToast("Ergänzende Details gelöscht.");
}

function hasMissingDetailContent(detail) {
  return Boolean(detail && (detail.title || detail.publicationYear || detail.desiredCondition || detail.notes || detail.duckipediaUrl));
}

function normalizeHttpUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

function restoreBodyModalState() {
  const anyModalOpen = [elements.importModal, elements.seriesModal, elements.missingDetailModal, elements.duplicateModal, elements.scannerModal]
    .some((modal) => !modal.classList.contains("hidden"));
  document.body.classList.toggle("modal-open", anyModalOpen);
}

async function handleCollectionCsvExport() {
  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const result = await shareOrDownloadText({
      content: createCollectionCsv(state.comics, state.settings),
      filename: createDatedFilename("Sammlerhausen-Sammlung", "csv"),
      mimeType: "text/csv;charset=utf-8",
      title: "Sammlerhausen – Sammlung",
      text: "Meine Sammlerhausen-Sammlung als CSV-Datei."
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
      filename: createDatedFilename("Sammlerhausen-Fehlende-Baende", "csv"),
      mimeType: "text/csv;charset=utf-8",
      title: "Sammlerhausen – Fehlende Bände",
      text: "Meine Such- und Wunschliste aus Sammlerhausen."
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
    const pdfBlob = createMissingPdfBlob(state.missingGroups, state.settings);
    const result = await shareOrDownloadBlob({
      blob: pdfBlob,
      filename: createDatedFilename("Sammlerhausen-Flohmarkt-Suchliste", "pdf"),
      mimeType: "application/pdf",
      title: "Sammlerhausen - Flohmarkt-Suchliste",
      text: "Meine übersichtliche Liste fehlender Bände für Flohmärkte und Comicbörsen."
    });
    reportExportResult(result, "Die Flohmarkt-Suchliste");
  } catch (error) {
    console.error(error);
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
      lastBackupComicCount: state.comics.length
    };
    const metadataCache = await getAllMetadataCache();
    const result = await shareOrDownloadText({
      content: createJsonBackup(state.comics, nextSettings, metadataCache),
      filename: createDatedFilename("Sammlerhausen-Backup", "json"),
      mimeType: "application/json;charset=utf-8",
      title: "Sammlerhausen – JSON-Backup",
      text: "Vollständiges Backup meiner Sammlerhausen-Daten."
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
  if (importInProgress || elements.importModal.classList.contains("hidden")) {
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
  countLine.textContent = `Enthaltene Comics: ${backup.comics.length}`;

  const cacheLine = document.createElement("p");
  cacheLine.textContent = `Duckipedia-Cache: ${backup.metadataCache.length} Einträge`;

  const versionLine = document.createElement("p");
  versionLine.textContent = `Datenformat: Version ${backup.dataFormatVersion}`;

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
    ? `Die aktuelle Sammlung mit ${state.comics.length} Einträgen wird vollständig ersetzt. Fortfahren?`
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

    if (mode === "replace") {
      await replaceAllComics(state.importBackup.comics);
      resultMessage = `${state.importBackup.comics.length} Einträge wurden wiederhergestellt.`;
    } else {
      const mergeResult = mergeCollections(state.comics, state.importBackup.comics);
      await replaceAllComics(mergeResult.comics);
      importedChangeAmount = mergeResult.added + mergeResult.updated;
      resultMessage = `${mergeResult.added} hinzugefügt, ${mergeResult.updated} aktualisiert, ${mergeResult.skipped} übersprungen.`;
    }

    if (state.importBackup.hasMetadataCache) {
      if (mode === "replace") {
        await replaceMetadataCache(state.importBackup.metadataCache);
      } else {
        await upsertMetadataCache(state.importBackup.metadataCache);
      }
    }

    if (mode === "replace" && !state.importBackup.hasMedia) {
      const validComicIds = new Set(state.importBackup.comics.map((comic) => comic.id));
      const existingCovers = await getAllCoverMedia();
      await replaceAllCoverMedia(existingCovers.filter((cover) => validComicIds.has(cover.comicId)));
    }

    if (state.importBackup.hasMedia) {
      const importedComicIds = new Set((mode === "replace" ? state.importBackup.comics : (await getAllComics())).map((comic) => comic.id));
      const coverRecords = state.importBackup.covers
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
    customSeries: mergedCustomSeriesConfigs.length > 0
      ? mergedCustomSeriesConfigs.map((entry) => entry.name)
      : [...new Set([...(state.settings.customSeries || []), ...(importedSettings.customSeries || [])])],
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
  const hasCollectionData = state.comics.length > 0;
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
      elements.backupReminderText.textContent = `Deine Sammlung enthält ${formatEntryCount(state.comics.length)}, aber noch kein JSON-Backup.`;
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
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

function formatEntryCount(count) {
  return count === 1 ? "1 Eintrag" : `${count} Einträge`;
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

function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  elements.connectionStatus.textContent = isOnline ? "Online" : "Offline";
  elements.connectionStatus.dataset.status = isOnline ? "online" : "offline";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", {
        updateViaCache: "none"
      });

      if (registration.waiting) {
        showAvailableUpdate(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;

        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            showAvailableUpdate(installingWorker);
          }
        });
      });

      let hasReloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloaded) {
          return;
        }

        hasReloaded = true;
        window.location.reload();
      });

      await registration.update();
    } catch (error) {
      console.error("Service Worker konnte nicht registriert werden:", error);
    }
  });
}

function showAvailableUpdate(worker) {
  state.waitingServiceWorker = worker;
  elements.updateApp.classList.remove("hidden");
  elements.updateApp.textContent = "Jetzt aktualisieren";
  elements.updateApp.disabled = false;
  showToast("Eine neue Sammlerhausen-Version ist verfügbar.");
}

async function handleUpdateButtonClick() {
  if (state.waitingServiceWorker) {
    elements.updateApp.disabled = true;
    elements.updateApp.textContent = "Aktualisiere …";
    state.waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    return;
  }

  elements.updateApp.disabled = true;
  elements.updateApp.textContent = "Prüfe …";

  try {
    if (!navigator.onLine) {
      showToast("Für die Updateprüfung wird kurz eine Internetverbindung benötigt.", "error");
      return;
    }

    // navigator.serviceWorker.ready ist auf iOS zuverlässiger als getRegistration mit relativer Scope-URL.
    const registration = await navigator.serviceWorker.ready;
    await registration.update();

    // Safari aktualisiert registration.waiting teilweise erst im nächsten Task.
    await new Promise((resolve) => window.setTimeout(resolve, 250));

    if (registration.waiting) {
      showAvailableUpdate(registration.waiting);
      return;
    }

    showToast(`Sammlerhausen v${APP_CONFIG.appVersion} ist aktuell.`);
  } catch (error) {
    console.error("Updateprüfung fehlgeschlagen:", error);

    // Die App bleibt nutzbar; Safari prüft den Service Worker zusätzlich bei jedem Start automatisch.
    showToast("Manuelle Prüfung nicht möglich. Beim nächsten App-Start wird automatisch erneut geprüft.");
  } finally {
    if (!state.waitingServiceWorker) {
      elements.updateApp.disabled = false;
      elements.updateApp.textContent = "Updates prüfen";
    }
  }
}
