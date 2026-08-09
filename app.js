import {
  APP_CONFIG,
  DEFAULT_CONDITION_CODE,
  DEFAULT_SETTINGS,
  STANDARD_SERIES_DEFINITIONS,
  STANDARD_DUCKIPEDIA_PATTERNS,
  createDuckipediaUrl as buildDuckipediaUrl,
  createMetadataCacheKey,
  createMissingDetailKey,
  getAvailableSeries,
  getConditionDetails,
  getConditionLabel,
  getConditionRank,
  normalizeConditionCode,
  normalizeDuckipediaPattern
} from "./config.js";
import {
  clearAllCoverMedia,
  clearMetadataCache,
  deleteComic,
  deleteCoverMedia,
  getAllComics,
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
  replaceAllComics,
  replaceAllCoverMedia,
  replaceMetadataCache,
  removeSeriesDefinition,
  saveSeriesDefinition,
  saveAppSettings,
  saveComic,
  saveCoverMedia,
  saveMetadataCache,
  upsertComics,
  upsertCoverMedia,
  upsertMetadataCache
} from "./storage.js";
import { calculateMissingBands, countMissingBands } from "./missing.js";
import { DUCKIPEDIA_LOOKUP_VERSION, lookupDuckipediaMetadata } from "./duckipedia.js";
import { MagazineBarcodeScanner, parseSupplementToBandNumber } from "./scanner.js";
import {
  SCANNER_MODES,
  classifyScannerResult,
  createScannerQueueKey,
  mergeScannerQueueItem,
  normalizeScannerMode,
  summarizeScannerQueue
} from "./scanner-pro.js";
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
import { ensurePdfLibrary, ensureScannerLibrary, getOptionalAssetStatus } from "./asset-loader.js";
import {
  clearDiagnosticLog,
  collectDiagnosticReport,
  downloadDiagnosticReport,
  formatDiagnosticBytes,
  getDiagnosticLog,
  recordDiagnosticError
} from "./diagnostics.js";
import { createLazyDomManager } from "./lazy-dom.js";
import {
  CALENDAR_CATALOG_URL,
  buildCalendarIcs,
  compareCalendarEvents,
  createCalendarCatalogSignature,
  createCalendarEventId,
  filterCalendarEvents,
  formatCalendarDate,
  getEventsForMonth,
  getEventsForYear,
  getMonthName,
  getUpcomingEvents,
  isToday,
  mergePublisherCalendarEvents,
  normalizeCalendarCatalog,
  normalizeCalendarEvent,
  parseIcsCalendar,
  removePublisherCalendarYear
} from "./calendar.js";
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
import { createShelfUI } from "./shelf-ui.js";
import { matchesSmartList, sortSmartList } from "./shelf.js";
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
  RELEASE_RADAR_FILTERS,
  buildReleaseRadarItems as createReleaseRadarItems,
  createReleaseEventSignature,
  filterReleaseRadarItems,
  getReleaseRadarBadgeCount,
  getReleaseTimingLabel,
  mergeKnownReleaseSignatures,
  normalizeKnownReleaseSignatures,
  normalizeReleaseDecisionMap,
  normalizeReleaseEventLinks,
  normalizeReleaseSeriesAliases,
  normalizeReleaseSeriesCatalog,
  resolveReleaseIdentity,
  suggestReleaseSeriesDetails,
  summarizeReleaseRadar
} from "./release-radar.js";

const THEME_STORAGE_KEY = "comicarchiv-theme";
const IS_TEST_MODE = new URLSearchParams(window.location.search).get("testmode") === "1";
const SMART_LIST_DEFINITIONS_LOOKUP = Object.freeze({
  recent: { title: "Neu im Archiv", description: "Zuletzt hinzugefügte oder aktualisierte Bände" },
  unread: { title: "Noch ungelesen", description: "Bände, von denen noch kein Exemplar gelesen wurde" },
  duplicates: { title: "Mehrfach vorhanden", description: "Ausgaben mit mindestens zwei physischen Exemplaren" },
  sealed: { title: "Folierte Exemplare", description: "Ausgaben mit mindestens einem folierten Exemplar" },
  "needs-care": { title: "Zustand 3 oder schwächer", description: "Bände, die genauer geprüft oder ersetzt werden könnten" },
  metadata: { title: "Daten ergänzen", description: "Titel, Jahr oder Duckipedia-Verknüpfung fehlen" },
  "no-cover": { title: "Ohne Cover", description: "Noch ohne eigenes oder geladenes Coverbild" },
  "current-year": { title: "Aktueller Jahrgang", description: "Bände aus dem laufenden Kalenderjahr" }
});

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
  scannerMode: SCANNER_MODES.FAST,
  scannerSessionScans: 0,
  scannerQueueLookups: new Map(),
  scannerFlashTimer: null,
  formMetadata: null,
  pendingCover: null,
  removeCoverRequested: false,
  formCoverObjectUrl: null,
  formHasLocalCover: false,
  cardCoverObjectUrls: new Set(),
  metadataLookupTimer: null,
  enrichmentRunning: false,
  collectionScope: "main",
  collectionPreset: {},
  collectionReturnTarget: "home",
  localCoverIds: new Set(),
  missingScope: "main",
  missingReturnTarget: "home",
  openMissingSeries: new Set(),
  missingLookupSequence: 0,
  fleaMarketScope: "all",
  selectedCopyComicId: null,
  copyManagerDraft: [],
  archiveCoreStatus: null,
  dataStackStatus: null,
  conditionGuideReturnTarget: null,
  conditionAssistantStep: 1,
  conditionAssistantAssessment: createConditionAssessment(),
  conditionAssistantTarget: null,
  editingCustomSeriesName: "",
  selectedCalendarEventId: null,
  calendarImporting: false,
  calendarCatalog: [],
  calendarCatalogUpdatedAt: "",
  calendarCatalogLoading: false,
  calendarFilter: "all",
  calendarSearch: "",
  latestDiagnosticReport: null,
  diagnosticsRunning: false,
  shelfCoverResolutionPromises: new Map(),
  releaseRadarFilter: "open",
  releaseRadarReturnTarget: "home",
  releaseLinkEventId: null,
  collectorMission: null,
  currentMilestones: [],
  milestoneSyncPending: false,
  milestoneCelebrationTimer: null,
  shareCardRendering: false
};

const elements = {
  html: document.documentElement,
  addPage: document.querySelector("#add-page"),
  closeAddPage: document.querySelector("#close-add-page"),
  navAdd: document.querySelector("#nav-add"),
  navStatistics: document.querySelector("#nav-statistics"),
  statisticsPage: document.querySelector("#statistics-page"),
  closeStatistics: document.querySelector("#close-statistics"),
  statisticsSummary: document.querySelector("#statistics-summary"),
  statisticsHighlights: document.querySelector("#statistics-highlights"),
  dnaSummary: document.querySelector("#dna-summary"),
  dnaInsights: document.querySelector("#dna-insights"),
  nearCompleteList: document.querySelector("#near-complete-list"),
  nearCompleteSummary: document.querySelector("#near-complete-summary"),
  qualityMap: document.querySelector("#quality-map"),
  qualityMapLegend: document.querySelector("#quality-map-legend"),
  yearChart: document.querySelector("#year-chart"),
  yearChartTotal: document.querySelector("#year-chart-total"),
  qualityChart: document.querySelector("#quality-chart"),
  seriesChart: document.querySelector("#series-chart"),
  milestonePanel: document.querySelector("#milestone-panel"),
  milestoneCount: document.querySelector("#milestone-count"),
  milestoneList: document.querySelector("#milestone-list"),
  collectorMission: document.querySelector("#collector-mission"),
  collectorMissionEyebrow: document.querySelector("#collector-mission-eyebrow"),
  collectorMissionTitle: document.querySelector("#collector-mission-title"),
  collectorMissionText: document.querySelector("#collector-mission-text"),
  openShareCard: document.querySelector("#open-share-card"),
  shareCardModal: document.querySelector("#share-card-modal"),
  closeShareCard: document.querySelector("#close-share-card"),
  shareCardTemplate: document.querySelector("#share-card-template"),
  shareCardCanvas: document.querySelector("#share-card-canvas"),
  shareCardShare: document.querySelector("#share-card-share"),
  shareCardMessage: document.querySelector("#share-card-message"),
  milestoneCelebration: document.querySelector("#milestone-celebration"),
  milestoneCelebrationMark: document.querySelector("#milestone-celebration .milestone-celebration-mark"),
  milestoneCelebrationTitle: document.querySelector("#milestone-celebration-title"),
  milestoneCelebrationCopy: document.querySelector("#milestone-celebration-copy"),
  milestoneCelebrationClose: document.querySelector("#milestone-celebration-close"),
  dashboardStats: document.querySelector(".stats-grid"),
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
  smartListBanner: document.querySelector("#smart-list-banner"),
  smartListTitle: document.querySelector("#smart-list-title"),
  smartListDescription: document.querySelector("#smart-list-description"),
  clearSmartList: document.querySelector("#clear-smart-list"),
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
  fleaMarketPriorityFilter: document.querySelector("#flea-market-priority-filter"),
  fleaMarketDefaultCondition: document.querySelector("#flea-market-default-condition"),
  fleaMarketApplyCondition: document.querySelector("#flea-market-apply-condition"),
  fleaMarketEmpty: document.querySelector("#flea-market-empty"),
  fleaMarketList: document.querySelector("#flea-market-list"),
  fleaMarketSave: document.querySelector("#flea-market-save"),
  fleaMarketClear: document.querySelector("#flea-market-clear"),
  fleaMarketMessage: document.querySelector("#flea-market-message"),
  openCalendar: document.querySelector("#nav-calendar"),
  calendarPage: document.querySelector("#calendar-page"),
  closeCalendar: document.querySelector("#close-calendar"),
  calendarPageSummary: document.querySelector("#calendar-page-summary"),
  calendarPrevYear: document.querySelector("#calendar-prev-year"),
  calendarNextYear: document.querySelector("#calendar-next-year"),
  calendarYearSelect: document.querySelector("#calendar-year-select"),
  calendarToday: document.querySelector("#calendar-today"),
  calendarSearch: document.querySelector("#calendar-search"),
  calendarCategoryFilter: document.querySelector("#calendar-category-filter"),
  calendarMonthTabs: document.querySelector("#calendar-month-tabs"),
  calendarMonthTitle: document.querySelector("#calendar-month-title"),
  calendarMonthCount: document.querySelector("#calendar-month-count"),
  calendarGrid: document.querySelector("#calendar-grid"),
  calendarEventList: document.querySelector("#calendar-event-list"),
  calendarEmpty: document.querySelector("#calendar-empty"),
  calendarFile: document.querySelector("#calendar-file"),
  calendarImportSummary: document.querySelector("#calendar-import-summary"),
  calendarImportMessage: document.querySelector("#calendar-import-message"),
  calendarCatalogStatus: document.querySelector("#calendar-catalog-status"),
  calendarCatalogList: document.querySelector("#calendar-catalog-list"),
  calendarRefreshCatalog: document.querySelector("#calendar-refresh-catalog"),
  calendarAutoSync: document.querySelector("#calendar-auto-sync"),
  calendarAddEvent: document.querySelector("#calendar-add-event"),
  calendarExportReminders: document.querySelector("#calendar-export-reminders"),
  calendarReminderTime: document.querySelector("#calendar-reminder-time"),
  calendarEventModal: document.querySelector("#calendar-event-modal"),
  closeCalendarEvent: document.querySelector("#close-calendar-event"),
  calendarEventForm: document.querySelector("#calendar-event-form"),
  calendarEventModalTitle: document.querySelector("#calendar-event-modal-title"),
  calendarEventId: document.querySelector("#calendar-event-id"),
  calendarEventName: document.querySelector("#calendar-event-name"),
  calendarEventDate: document.querySelector("#calendar-event-date"),
  calendarEventCategory: document.querySelector("#calendar-event-category"),
  calendarEventAllDay: document.querySelector("#calendar-event-all-day"),
  calendarEventTimeField: document.querySelector("#calendar-event-time-field"),
  calendarEventTime: document.querySelector("#calendar-event-time"),
  calendarEventLocation: document.querySelector("#calendar-event-location"),
  calendarEventUrl: document.querySelector("#calendar-event-url"),
  calendarEventNotes: document.querySelector("#calendar-event-notes"),
  calendarEventReminder: document.querySelector("#calendar-event-reminder"),
  calendarEventDelete: document.querySelector("#calendar-event-delete"),
  calendarEventMessage: document.querySelector("#calendar-event-message"),
  openReleaseRadarHome: document.querySelector("#open-release-radar-home"),
  openReleaseRadarCalendar: document.querySelector("#open-release-radar-calendar"),
  releaseRadarHomeTitle: document.querySelector("#release-radar-home-title"),
  releaseRadarHomeNext: document.querySelector("#release-radar-home-next"),
  releaseRadarHomeDate: document.querySelector("#release-radar-home-date"),
  releaseRadarHomeCount: document.querySelector("#release-radar-home-count"),
  releaseRadarHomeMeta: document.querySelector("#release-radar-home-meta"),
  calendarRadarTitle: document.querySelector("#calendar-radar-title"),
  calendarRadarNext: document.querySelector("#calendar-radar-next"),
  calendarRadarCount: document.querySelector("#calendar-radar-count"),
  calendarNavBadge: document.querySelector("#calendar-nav-badge"),
  releaseRadarPage: document.querySelector("#release-radar-page"),
  closeReleaseRadar: document.querySelector("#close-release-radar"),
  releaseRadarSummary: document.querySelector("#release-radar-summary"),
  releaseRadarNextTitle: document.querySelector("#release-radar-next-title"),
  releaseRadarNextCopy: document.querySelector("#release-radar-next-copy"),
  releaseRadarNewCount: document.querySelector("#release-radar-new-count"),
  releaseRadarTodayCount: document.querySelector("#release-radar-today-count"),
  releaseRadarWatchCount: document.querySelector("#release-radar-watch-count"),
  releaseRadarOrderedCount: document.querySelector("#release-radar-ordered-count"),
  releaseRadarFilterTabs: document.querySelector("#release-radar-filter-tabs"),
  releaseRadarMarkSeen: document.querySelector("#release-radar-mark-seen"),
  releaseRadarExport: document.querySelector("#release-radar-export"),
  releaseRadarList: document.querySelector("#release-radar-list"),
  releaseRadarEmpty: document.querySelector("#release-radar-empty"),
  releaseRadarBadgeSummary: document.querySelector("#release-radar-badge-summary"),
  releaseRadarBadgeEnabled: document.querySelector("#release-radar-badge-enabled"),
  releaseRadarMessage: document.querySelector("#release-radar-message"),
  releaseLinkModal: document.querySelector("#release-link-modal"),
  releaseLinkForm: document.querySelector("#release-link-form"),
  releaseLinkContext: document.querySelector("#release-link-context"),
  releaseLinkModeExisting: document.querySelector("#release-link-mode-existing"),
  releaseLinkModeNew: document.querySelector("#release-link-mode-new"),
  releaseLinkExistingFields: document.querySelector("#release-link-existing-fields"),
  releaseLinkNewFields: document.querySelector("#release-link-new-fields"),
  releaseLinkExistingSeries: document.querySelector("#release-link-existing-series"),
  releaseLinkNewName: document.querySelector("#release-link-new-name"),
  releaseLinkNewPattern: document.querySelector("#release-link-new-pattern"),
  releaseLinkAlias: document.querySelector("#release-link-alias"),
  releaseLinkBand: document.querySelector("#release-link-band"),
  releaseLinkMessage: document.querySelector("#release-link-message"),
  closeReleaseLink: document.querySelector("#close-release-link"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  appVersion: document.querySelector("#app-version"),
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
  archiveCoreSummary: document.querySelector("#archive-core-summary"),
  dataStackSummary: document.querySelector("#data-stack-summary"),
  openArchiveMigration: document.querySelector("#open-archive-migration"),
  requestPersistence: document.querySelector("#request-persistence"),
  openDiagnostics: document.querySelector("#open-diagnostics"),
  diagnosticsModal: document.querySelector("#diagnostics-modal"),
  closeDiagnostics: document.querySelector("#close-diagnostics"),
  diagnosticsOverview: document.querySelector("#diagnostics-overview"),
  diagnosticsCheckList: document.querySelector("#diagnostics-check-list"),
  diagnosticsErrorList: document.querySelector("#diagnostics-error-list"),
  diagnosticsMessage: document.querySelector("#diagnostics-message"),
  runDiagnostics: document.querySelector("#run-diagnostics"),
  exportDiagnostics: document.querySelector("#export-diagnostics"),
  clearDiagnostics: document.querySelector("#clear-diagnostics"),
  openRecovery: document.querySelector("#open-recovery"),
  openTestMode: document.querySelector("#open-test-mode"),
  testModeBanner: document.querySelector("#test-mode-banner"),
  leaveTestMode: document.querySelector("#leave-test-mode"),
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
  missingDetailPriority: document.querySelector("#missing-detail-priority"),
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
  copyManagerList: document.querySelector("#copy-manager-list"),
  copyManagerAdd: document.querySelector("#copy-manager-add"),
  duplicateSave: document.querySelector("#duplicate-save"),
  duplicateMessage: document.querySelector("#duplicate-message"),
  archiveMigrationModal: document.querySelector("#archive-migration-modal"),
  closeArchiveMigration: document.querySelector("#close-archive-migration"),
  archiveMigrationSummary: document.querySelector("#archive-migration-summary"),
  archiveMigrationConfirm: document.querySelector("#archive-migration-confirm"),
  archiveMigrationExport: document.querySelector("#archive-migration-export"),
  archiveMigrationRestore: document.querySelector("#archive-migration-restore"),
  archiveMigrationMessage: document.querySelector("#archive-migration-message"),
  conditionGuideModal: document.querySelector("#condition-guide-modal"),
  closeConditionGuide: document.querySelector("#close-condition-guide"),
  conditionGuideList: document.querySelector("#condition-guide-list"),
  conditionAssistantModal: document.querySelector("#condition-assistant-modal"),
  closeConditionAssistant: document.querySelector("#close-condition-assistant"),
  conditionAssistantTargetLabel: document.querySelector("#condition-assistant-target-label"),
  conditionAssistantProgressFill: document.querySelector("#condition-assistant-progress-fill"),
  conditionAssistantImpressions: document.querySelector("#condition-assistant-impressions"),
  conditionAssistantDefects: document.querySelector("#condition-assistant-defects"),
  conditionAssistantResult: document.querySelector("#condition-assistant-result"),
  conditionAssistantAddNote: document.querySelector("#condition-assistant-add-note"),
  conditionAssistantBack: document.querySelector("#condition-assistant-back"),
  conditionAssistantNext: document.querySelector("#condition-assistant-next"),
  conditionAssistantApply: document.querySelector("#condition-assistant-apply"),
  openScanner: document.querySelector("#open-scanner"),
  scannerModal: document.querySelector("#scanner-modal"),
  closeScanner: document.querySelector("#close-scanner"),
  scannerModeFast: document.querySelector("#scanner-mode-fast"),
  scannerModeReview: document.querySelector("#scanner-mode-review"),
  scannerModeDescription: document.querySelector("#scanner-mode-description"),
  scannerStatScanned: document.querySelector("#scanner-stat-scanned"),
  scannerStatNew: document.querySelector("#scanner-stat-new"),
  scannerStatExisting: document.querySelector("#scanner-stat-existing"),
  scannerStatReview: document.querySelector("#scanner-stat-review"),
  scannerSeries: document.querySelector("#scanner-series"),
  scannerCondition: document.querySelector("#scanner-condition"),
  scannerDuplicateCondition: document.querySelector("#scanner-duplicate-condition"),
  scannerDuplicateConditionField: document.querySelector("#scanner-duplicate-condition-field"),
  scannerIsRead: document.querySelector("#scanner-is-read"),
  scannerIsDuplicate: document.querySelector("#scanner-is-duplicate"),
  scannerIsSealed: document.querySelector("#scanner-is-sealed"),
  scannerCameraTarget: document.querySelector("#scanner-camera-target"),
  scannerCameraPlaceholder: document.querySelector("#scanner-camera-placeholder"),
  scannerDetectedFlash: document.querySelector("#scanner-detected-flash"),
  scannerDetectedKicker: document.querySelector("#scanner-detected-kicker"),
  scannerDetectedBand: document.querySelector("#scanner-detected-band"),
  scannerDetectedNote: document.querySelector("#scanner-detected-note"),
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

  if (target.closest("#close-diagnostics, [data-close-diagnostics]")) return closeDiagnosticsModal();
  if (target.closest("#run-diagnostics")) return runDiagnostics();
  if (target.closest("#export-diagnostics")) return handleDiagnosticExport();
  if (target.closest("#clear-diagnostics")) return handleClearDiagnostics();
  if (target.closest("#open-test-mode")) return toggleTestMode();
  if (target.closest("#open-recovery")) {
    closeDiagnosticsModal();
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

let toastTimer;
let importInProgress = false;
let barcodeScanner;
let shelfUI;

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
      comics: state.comics,
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
    state.scannerMode = normalizeScannerMode(state.settings.scannerMode);
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
  updateScannerModeUI();
  renderScannerQueue();
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
    if (status.ready && status.hasRollbackSnapshot && status.parity?.valid !== false) {
      elements.dataStackSummary.textContent = `Bereit · Schema ${status.databaseVersion} · Sicherung vorhanden`;
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
  const availableSeries = getAvailableSeries(state.settings, state.comics);
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
  elements.comicList.addEventListener("click", handleCardAction);
  elements.missingList.addEventListener("click", handleMissingBandClick);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.backupReminderAction.addEventListener("click", handleJsonExport);
  elements.progressTargetForm.addEventListener("submit", handleProgressTargetSubmit);
  elements.progressSeries.addEventListener("change", syncProgressTargetInput);
  elements.progressRemove.addEventListener("click", handleRemoveProgressTarget);
  elements.openMainCollection.addEventListener("click", () => shelfUI?.openSeries("ltb-main", { returnTarget: "home" }));
  elements.openOtherCollection.addEventListener("click", () => shelfUI?.openLibrary("other"));
  elements.closeCollection.addEventListener("click", closeCollectionPage);
  elements.openMainMissing.addEventListener("click", () => openMissingPage("main"));
  elements.openOtherMissing.addEventListener("click", () => openMissingPage("other"));
  elements.closeMissingPage.addEventListener("click", closeMissingPage);
  elements.openFleaMarket.addEventListener("click", openFleaMarketPage);
  elements.closeFleaMarket.addEventListener("click", closeFleaMarketPage);
  elements.fleaMarketSearch.addEventListener("input", renderFleaMarket);
  elements.fleaMarketScope.addEventListener("change", renderFleaMarket);
  elements.fleaMarketPriorityFilter.addEventListener("change", renderFleaMarket);
  elements.fleaMarketList.addEventListener("change", handleFleaMarketListChange);
  elements.fleaMarketApplyCondition.addEventListener("click", applyFleaMarketDefaultCondition);
  elements.fleaMarketSave.addEventListener("click", saveFleaMarketFinds);
  elements.fleaMarketClear.addEventListener("click", clearFleaMarketFinds);
  elements.openCalendar.addEventListener("click", openCalendarPage);
  elements.closeCalendar.addEventListener("click", closeCalendarPage);
  elements.openReleaseRadarHome.addEventListener("click", () => openReleaseRadarPage({ returnTarget: "home" }));
  elements.openReleaseRadarCalendar.addEventListener("click", () => openReleaseRadarPage({ returnTarget: "calendar" }));
  elements.closeReleaseRadar.addEventListener("click", closeReleaseRadarPage);
  elements.releaseRadarPage.addEventListener("click", handleReleaseRadarPageClick);
  elements.releaseRadarList.addEventListener("change", handleReleaseRadarPriorityChange);
  elements.releaseRadarMarkSeen.addEventListener("click", markVisibleReleaseRadarItemsSeen);
  elements.releaseRadarExport.addEventListener("click", exportWatchedReleaseReminders);
  elements.releaseRadarBadgeEnabled.addEventListener("change", handleReleaseRadarBadgeToggle);
  elements.releaseLinkForm.addEventListener("submit", handleReleaseLinkSubmit);
  elements.releaseLinkModeExisting.addEventListener("change", syncReleaseLinkMode);
  elements.releaseLinkModeNew.addEventListener("change", syncReleaseLinkMode);
  elements.closeReleaseLink.addEventListener("click", closeReleaseLinkModal);
  elements.releaseLinkModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-release-link]")) closeReleaseLinkModal();
  });
  elements.calendarPrevYear.addEventListener("click", () => changeCalendarYear(-1));
  elements.calendarNextYear.addEventListener("click", () => changeCalendarYear(1));
  elements.calendarYearSelect.addEventListener("change", () => setCalendarYear(Number(elements.calendarYearSelect.value)));
  elements.calendarToday.addEventListener("click", jumpCalendarToToday);
  elements.calendarSearch.addEventListener("input", () => {
    state.calendarSearch = elements.calendarSearch.value;
    renderCalendarPage();
  });
  elements.calendarCategoryFilter.addEventListener("change", () => {
    state.calendarFilter = elements.calendarCategoryFilter.value;
    renderCalendarPage();
  });
  elements.calendarMonthTabs.addEventListener("click", handleCalendarMonthTabClick);
  elements.calendarGrid.addEventListener("click", handleCalendarDayClick);
  elements.calendarEventList.addEventListener("click", handleCalendarEventListClick);
  elements.calendarFile.addEventListener("change", handleCalendarFileImport);
  elements.calendarRefreshCatalog.addEventListener("click", () => refreshCalendarCatalog({ silent: false, autoImport: true }));
  elements.calendarAutoSync.addEventListener("change", handleCalendarAutoSyncChange);
  elements.calendarCatalogList.addEventListener("click", handleCalendarCatalogClick);
  elements.calendarAddEvent.addEventListener("click", () => openCalendarEventModal());
  elements.calendarExportReminders.addEventListener("click", exportCalendarWithReminders);
  elements.calendarReminderTime.addEventListener("change", handleCalendarReminderTimeChange);
  elements.calendarEventForm.addEventListener("submit", handleCalendarEventSubmit);
  elements.calendarEventAllDay.addEventListener("change", syncCalendarEventTimeVisibility);
  elements.calendarEventDelete.addEventListener("click", deleteSelectedCalendarEvent);
  elements.closeCalendarEvent.addEventListener("click", closeCalendarEventModal);
  elements.calendarEventModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-calendar-event]")) closeCalendarEventModal();
  });
  elements.openProgress.addEventListener("click", openProgressPage);
  elements.closeProgress.addEventListener("click", closeProgressPage);
  elements.openScanner.addEventListener("click", openScannerModal);
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
  elements.clearSmartList.addEventListener("click", () => {
    state.collectionPreset = {};
    resetFilters({ keepPageOpen: true, clearPreset: false });
  });
  elements.exportJson.addEventListener("click", handleJsonExport);
  elements.exportCsv.addEventListener("click", handleCollectionCsvExport);
  elements.exportMissingCsv.addEventListener("click", handleMissingCsvExport);
  elements.exportMissingPdf.addEventListener("click", handleMissingPdfExport);
  elements.requestPersistence.addEventListener("click", handlePersistenceRequest);
  elements.openDiagnostics.addEventListener("click", openDiagnosticsModal);
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
  elements.closeMissingDetail.addEventListener("click", closeMissingDetailModal);
  elements.missingDetailForm.addEventListener("submit", handleSaveMissingDetail);
  elements.deleteMissingDetail.addEventListener("click", handleDeleteMissingDetail);
  elements.missingMarkOwned.addEventListener("click", handleMarkMissingBandOwned);
  elements.missingDetailModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-missing-detail]")) closeMissingDetailModal();
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
    if (elements.diagnosticsModal && !elements.diagnosticsModal.classList.contains("hidden")) return closeDiagnosticsModal();
    if (elements.shareCardModal && !elements.shareCardModal.classList.contains("hidden")) return closeShareCardModal();
    if (elements.importModal && !elements.importModal.classList.contains("hidden")) return closeImportModal();
    if (!elements.releaseLinkModal.classList.contains("hidden")) return closeReleaseLinkModal();
    if (!elements.seriesModal.classList.contains("hidden")) return closeSeriesModal();
    if (!elements.missingDetailModal.classList.contains("hidden")) return closeMissingDetailModal();
    if (!elements.duplicateModal.classList.contains("hidden")) return closeDuplicateModal();
    if (!elements.scannerModal.classList.contains("hidden")) return closeScannerModal();
    if (!elements.addPage.classList.contains("hidden")) return closeAddPage();
    if (!elements.statisticsPage.classList.contains("hidden")) return closeStatisticsPage();
    if (!elements.collectionPage.classList.contains("hidden")) return closeCollectionPage();
    if (!elements.missingPage.classList.contains("hidden")) return closeMissingPage();
    if (!elements.fleaMarketPage.classList.contains("hidden")) return closeFleaMarketPage();
    if (!elements.calendarEventModal.classList.contains("hidden")) return closeCalendarEventModal();
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
        syncScannerQueueLegacyFields(item);
        renderScannerQueue();
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
          `${existing.series}, Band ${existing.volumeNumber} ist bereits vorhanden. ` +
          `Die neue Eingabe wird als weiteres physisches Exemplar gespeichert, ohne einen doppelten Bandeintrag anzulegen. Fortfahren?`
        );
        if (!confirmed) return;
        comicToSave = appendFormCopiesToExistingComic(existing, formComic);
        addedToExisting = true;
      }
    }

    const savedComic = await saveComic(comicToSave);
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

  return state.comics.find((comic) => {
    const comicSeriesId = comic.seriesId || resolveConfiguredSeriesId(comic.series);
    if (identityKey && comicSeriesId) {
      return createIssueIdentityKey(comicSeriesId, comic.volumeNumber) === identityKey;
    }
    const comicRawVolume = String(comic.volumeNumber || "").trim().normalize("NFC");
    const comicVolumeKey = /^[0-9]+$/.test(comicRawVolume) && Number(comicRawVolume) > 0
      ? String(Number(comicRawVolume))
      : comicRawVolume;
    return normalizeSeriesLookup(comic.series) === seriesKey && comicVolumeKey === volumeKey;
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
  const existingCopies = getComicCopies(existing);
  const incomingCopies = getComicCopies(formComic).map((copy, index) => normalizeCopy({
    ...copy,
    id: createEntityId("copy"),
    issueId: existing.id,
    displayOrder: existingCopies.length + index + 1,
    source: "manual-additional",
    createdAt: now,
    updatedAt: now
  }, { issueId: existing.id, position: existingCopies.length + index + 1, now }));
  const copies = [...existingCopies, ...incomingCopies].map((copy, index) => ({
    ...copy,
    issueId: existing.id,
    displayOrder: index + 1
  }));
  const primary = copies[0];
  const secondary = copies[1] || null;

  return {
    ...existing,
    seriesId: existing.seriesId || formComic.seriesId || null,
    title: existing.title || formComic.title || "",
    publicationYear: existing.publicationYear || formComic.publicationYear || null,
    duckipediaPageUrl: existing.duckipediaPageUrl || formComic.duckipediaPageUrl || "",
    duckipediaCoverUrl: existing.duckipediaCoverUrl || formComic.duckipediaCoverUrl || "",
    metadataStatus: existing.metadataStatus || formComic.metadataStatus || "",
    metadataFetchedAt: existing.metadataFetchedAt || formComic.metadataFetchedAt || null,
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

function migrateLegacyComicConditions(comics) {
  let migratedRatings = 0;
  let migratedComics = 0;

  const normalizedComics = comics.map((comic) => {
    const originalCopies = getComicCopies(comic);
    const copies = originalCopies.map((copy, index) => {
      const condition = normalizeConditionCode(copy.condition, DEFAULT_CONDITION_CODE);
      if (condition !== copy.condition) migratedRatings += 1;
      return normalizeCopy({
        ...copy,
        issueId: comic.id,
        condition,
        displayOrder: index + 1
      }, { issueId: comic.id, position: index + 1 });
    });
    const primary = copies[0];
    const secondary = copies[1] || null;
    const copiesChanged = copies.some((copy, index) => copy.condition !== originalCopies[index]?.condition);
    const versionChanged = Number(comic.dataFormatVersion) !== APP_CONFIG.dataFormatVersion;
    const modelChanged = !Array.isArray(comic.copies) || Number(comic.copyCount) !== copies.length;

    if (!copiesChanged && !versionChanged && !modelChanged) return comic;
    migratedComics += 1;
    return {
      ...comic,
      dataFormatVersion: APP_CONFIG.dataFormatVersion,
      copies,
      copyCount: copies.length,
      condition: primary.condition,
      duplicateCondition: secondary?.condition || null,
      isRead: primary.isRead,
      isSealed: primary.isSealed,
      isDuplicate: copies.length > 1
    };
  });

  return { comics: normalizedComics, migratedRatings, migratedComics };
}

async function refreshCollection() {
  try {
    const [storedComics, coverKeys] = await Promise.all([
      getAllComics(),
      getAllCoverMediaKeys().catch((error) => {
        console.warn("Cover-IDs konnten nicht geladen werden:", error);
        return [];
      })
    ]);
    state.localCoverIds = new Set(coverKeys);
    const migration = migrateLegacyComicConditions(storedComics);
    state.comics = migration.comics;

    if (migration.migratedComics > 0) {
      await upsertComics(migration.comics.filter((comic, index) => comic !== storedComics[index]));
    }

    populateConfiguration();
    state.missingGroups = calculateMissingBands(
      state.comics,
      state.settings.knownHighestBandBySeries
    );
    renderCollectionHub();
    renderMissingHub();
    shelfUI?.refresh({ comics: state.comics, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
    if (!elements.collectionPage.classList.contains("hidden")) renderCollection();
    renderStats();
    if (!elements.missingPage.classList.contains("hidden")) renderMissingBands();
    renderFleaMarketHubStatus();
    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
    if (!elements.progressPage.classList.contains("hidden")) renderSeriesProgress();
    renderBackupStatus();
    renderCalendarOverview();
    if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();

    if (migration.migratedRatings > 0) {
      showToast(`${migration.migratedRatings} gespeicherte Zustandswertungen wurden automatisch in das deutsche 0–5-System übertragen.`, "success");
    }
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

async function saveShelfBulkComics(updatedComics, { action = "bulk" } = {}) {
  const entries = Array.isArray(updatedComics) ? updatedComics : [];
  if (!entries.length) return;
  await upsertComics(entries);
  await recordDataChange(entries.length);
  await refreshCollection();
  await refreshArchiveCoreStatus({ showReport: false });
  if (action !== "undo") await refreshMediaStatus().catch(() => {});
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


function syncCollectionSeriesFilter(availableSeries = getAvailableSeries(state.settings, state.comics), preferredValue = elements.filterSeries.value) {
  const mainSeries = "Lustiges Taschenbuch";
  const options = state.collectionScope === "main"
    ? [mainSeries]
    : state.collectionScope === "other"
      ? availableSeries.filter((seriesName) => seriesName !== mainSeries)
      : availableSeries;

  elements.filterSeries.replaceChildren();

  if (state.collectionScope === "main") {
    elements.filterSeries.append(createOption(mainSeries, mainSeries));
    elements.filterSeries.value = mainSeries;
    elements.filterSeriesField.classList.add("hidden");
    return;
  }

  elements.filterSeries.append(createOption("all", state.collectionScope === "other" ? "Alle Sonderreihen" : "Alle Reihen"));
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

function openCollectionPage(scope, presets = {}) {
  state.collectionScope = scope === "other" ? "other" : scope === "all" ? "all" : "main";
  state.collectionReturnTarget = presets.returnTarget || (
    shelfUI?.isSeriesOpen() ? "series" : shelfUI?.isLibraryOpen() ? "library" : "home"
  );
  state.collectionPreset = { ...presets };
  resetFilters({ keepPageOpen: true, clearPreset: false });
  syncCollectionSeriesFilter(getAvailableSeries(state.settings, state.comics));

  if (presets.series && [...elements.filterSeries.options].some((option) => option.value === presets.series)) {
    elements.filterSeries.value = presets.series;
  }
  if (presets.read) elements.filterRead.value = presets.read;
  if (presets.sealed) elements.filterSealed.checked = true;
  if (presets.duplicate) elements.filterDuplicate.checked = true;
  if (presets.search) elements.search.value = String(presets.search);
  if (presets.smartList === "recent") elements.sortBy.value = "recent";

  elements.collectionPageTitle.textContent = presets.title || (
    state.collectionScope === "main"
      ? "Lustige Taschenbücher"
      : state.collectionScope === "other"
        ? "Sonderbände & weitere Reihen"
        : "Alle Comics"
  );
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
  const anotherPageOpen = [...document.querySelectorAll(".app-page")]
    .some((page) => !page.classList.contains("hidden"));
  document.body.classList.toggle("app-page-open", anotherPageOpen);

  if (!returnFocus) return;
  window.setTimeout(() => {
    if (state.collectionReturnTarget === "series" && shelfUI?.isSeriesOpen()) {
      document.querySelector("#close-series-page")?.focus({ preventScroll: true });
      return;
    }
    if (state.collectionReturnTarget === "library" && shelfUI?.isLibraryOpen()) {
      document.querySelector("#close-library")?.focus({ preventScroll: true });
      return;
    }
    if (state.collectionReturnTarget === "statistics" && !elements.statisticsPage.classList.contains("hidden")) {
      elements.closeStatistics?.focus({ preventScroll: true });
      return;
    }
    const target = state.collectionScope === "main"
      ? elements.openMainCollection
      : state.collectionScope === "other"
        ? elements.openOtherCollection
        : elements.dashboardStats;
    target?.focus({ preventScroll: true });
  }, 0);
}

function getScopedMissingGroups() {
  const mainSeries = "Lustiges Taschenbuch";
  return state.missingGroups.filter((group) => (
    state.missingScope === "main"
      ? group.series === mainSeries
      : state.missingScope === "other"
        ? group.series !== mainSeries
        : true
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

function openMissingPage(scope, { returnTarget = "home" } = {}) {
  state.missingScope = scope === "other" ? "other" : scope === "all" ? "all" : "main";
  state.missingReturnTarget = returnTarget;
  state.openMissingSeries = new Set();
  elements.missingPageTitle.textContent = state.missingScope === "main"
    ? "Lustige Taschenbücher"
    : state.missingScope === "other"
      ? "Sonderbände & weitere Reihen"
      : "Alle fehlenden Bände";
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
      if (state.missingReturnTarget === "statistics" && !elements.statisticsPage.classList.contains("hidden")) {
        elements.closeStatistics.focus({ preventScroll: true });
        state.missingReturnTarget = "home";
        return;
      }
      const target = state.missingScope === "main"
        ? elements.openMainMissing
        : state.missingScope === "other"
          ? elements.openOtherMissing
          : elements.dashboardStats;
      target.focus({ preventScroll: true });
      state.missingReturnTarget = "home";
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
      const existing = state.comics.find((comic) => (
        normalizeSeriesLookup(comic.series) === normalizeSeriesLookup(candidate.series)
        && comic.numericBandNumber === candidate.bandNumber
      ));

      if (existing) {
        const existingCopies = getComicCopies(existing);
        const copies = [
          ...existingCopies,
          normalizeCopy({
            id: createEntityId(`${existing.id}-copy`),
            issueId: existing.id,
            condition,
            isRead: false,
            isSealed: false,
            notes: candidate.notes || "",
            source: "flea-market",
            createdAt: now,
            updatedAt: now
          }, { issueId: existing.id, position: existingCopies.length + 1, now })
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

    if (records.length > 0) await upsertComics(records);
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
    shelfUI?.refresh({ comics: state.comics, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
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
    shelfUI?.refresh({ comics: state.comics, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
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
  const smartDefinition = state.collectionPreset.smartList
    ? SMART_LIST_DEFINITIONS_LOOKUP[state.collectionPreset.smartList]
    : null;
  const presetBanner = smartDefinition || (state.collectionPreset.bannerTitle ? {
    title: state.collectionPreset.bannerTitle,
    description: state.collectionPreset.bannerDescription || "Statistische Auswahl aus deiner Sammlung"
  } : null);
  elements.smartListBanner.classList.toggle("hidden", !presetBanner);
  if (presetBanner) {
    elements.smartListTitle.textContent = presetBanner.title;
    elements.smartListDescription.textContent = presetBanner.description;
  }
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
  if (state.collectionScope === "all") return [...state.comics];
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
    if (state.collectionPreset.smartList && !matchesSmartList(comic, state.collectionPreset.smartList, {
      localCoverIds: state.localCoverIds
    })) {
      return false;
    }
    if (state.collectionPreset.publicationYear && Number(comic.publicationYear) !== Number(state.collectionPreset.publicationYear)) {
      return false;
    }
    if (state.collectionPreset.series && comic.series !== state.collectionPreset.series) {
      return false;
    }
    if (Array.isArray(state.collectionPreset.conditionCodes) && state.collectionPreset.conditionCodes.length) {
      const allowedConditions = new Set(state.collectionPreset.conditionCodes);
      if (!getComicCopies(comic).some((copy) => allowedConditions.has(copy.condition))) return false;
    }
    if (selectedSeries !== "all" && comic.series !== selectedSeries) {
      return false;
    }

    const copies = getComicCopies(comic);
    if (selectedCondition !== "all" && !copies.some((copy) => copy.condition === selectedCondition)) return false;
    if (readFilter === "read" && !copies.some((copy) => copy.isRead)) return false;
    if (readFilter === "unread" && copies.some((copy) => copy.isRead)) return false;
    if (onlySealed && !copies.some((copy) => copy.isSealed)) return false;
    if (onlyDuplicate && copies.length < 2) return false;

    if (searchTerm) {
      const searchableText = normalizeSearchText([
        comic.title,
        comic.series,
        comic.volumeNumber,
        comic.publicationYear,
        comic.notes,
        ...copies.map((copy) => copy.notes)
      ].join(" "));
      if (!searchableText.includes(searchTerm)) return false;
    }

    return true;
  });

  if (state.collectionPreset.smartList) {
    return sortSmartList(filtered, state.collectionPreset.smartList).sort(
      elements.sortBy.value === "recent" ? getSortComparator("recent") : getSortComparator(elements.sortBy.value)
    );
  }
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
      const firstWorst = Math.max(...getComicCopies(first).map((copy) => getConditionRank(copy.condition)), 0);
      const secondWorst = Math.max(...getComicCopies(second).map((copy) => getConditionRank(copy.condition)), 0);
      return firstWorst - secondWorst || compareSeriesAndBand(first, second);
    };
  }

  if (sortBy === "recent") {
    return (first, second) => (
      (Date.parse(second.updatedAt || second.createdAt || "") || 0)
      - (Date.parse(first.updatedAt || first.createdAt || "") || 0)
    ) || compareSeriesAndBand(first, second);
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

  const comicCopies = getComicCopies(comic);
  const conditions = document.createElement("div");
  conditions.className = "condition-badge-list";
  comicCopies.slice(0, 3).forEach((copy, index) => {
    conditions.append(createConditionBadge(copy.condition, comicCopies.length > 1 ? `Exemplar ${index + 1}` : "Zustand"));
  });
  if (comicCopies.length > 3) {
    const more = document.createElement("span");
    more.className = "condition-badge condition-more";
    more.textContent = `+${comicCopies.length - 3}`;
    more.title = `${comicCopies.length - 3} weitere Exemplare`;
    conditions.append(more);
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
  duplicateButton.textContent = `Exemplare verwalten (${comicCopies.length})`;

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
  const anyRead = comicCopies.some((copy) => copy.isRead);
  const anySealed = comicCopies.some((copy) => copy.isSealed);
  tags.append(createTag(anyRead ? "Gelesen" : "Ungelesen", anyRead));
  if (anySealed) tags.append(createTag("Foliert", true));
  if (comicCopies.length > 1) tags.append(createTag(`${comicCopies.length} Exemplare`, true));

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
  const classToken = normalizedCode.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  badge.className = `condition-badge condition-${classToken}`;
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
  const read = state.comics.filter((comic) => getComicCopies(comic).some((copy) => copy.isRead)).length;
  const sealed = state.comics.filter((comic) => getComicCopies(comic).some((copy) => copy.isSealed)).length;
  const duplicate = state.comics.filter((comic) => getComicCopies(comic).length > 1).length;
  const physicalCopies = countPhysicalCopies(state.comics);
  const seriesCount = new Set(state.comics.map((comic) => comic.seriesId || comic.series)).size;
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

  const allCopies = state.comics.flatMap((comic) => getComicCopies(comic));
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
  const dna = buildStatisticsDNA({ comics: state.comics, progressData, missingGroups: state.missingGroups });
  return {
    dna,
    mainProgress: progressData.find((entry) => entry.series === "Lustiges Taschenbuch") || null,
    milestone: state.currentMilestones[0] || buildMilestones({ comics: state.comics, progressData })[0] || null,
    totalSeries: new Set(state.comics.map((comic) => comic.seriesId || comic.series)).size,
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
    comics: state.comics,
    progressData,
    missingGroups: state.missingGroups
  });
  const readRate = dna.uniqueIssues ? Math.round((dna.readIssues / dna.uniqueIssues) * 100) : 0;
  const extraCopyRate = dna.uniqueIssues ? Math.round((dna.extraCopies / dna.uniqueIssues) * 100) : 0;
  elements.statisticsSummary.textContent = dna.physicalCopies === 1 ? "1 Buch" : `${dna.physicalCopies} Bücher`;
  elements.dnaSummary.textContent = `${dna.uniqueIssues} Ausgaben · ${dna.physicalCopies} Exemplare`;

  renderDnaInsights(dna);
  const milestones = buildMilestones({ comics: state.comics, progressData });
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
      const priorityId = normalizeWishlistPriority(detail.priority);
      button.className = detail.title || detail.desiredCondition || detail.notes || detail.publicationYear || priorityId
        ? "missing-band missing-band-detailed"
        : "missing-band";
      if (priorityId) button.classList.add(`missing-priority-${priorityId}`);
      button.dataset.series = group.series;
      button.dataset.bandNumber = String(bandNumber);

      const number = document.createElement("strong");
      number.textContent = `Band ${bandNumber}`;
      button.append(number);
      const priorityDefinition = getWishlistPriorityDefinition(priorityId);
      if (priorityDefinition) {
        const priority = document.createElement("span");
        priority.className = `wishlist-priority wishlist-priority-${priorityId}`;
        priority.textContent = priorityDefinition.shortLabel;
        button.append(priority);
      }

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
  state.selectedCopyComicId = comic.id;
  state.copyManagerDraft = getComicCopies(comic).map((copy, index) => normalizeCopy({ ...copy }, {
    issueId: comic.id,
    position: index + 1,
    createdAt: comic.createdAt,
    updatedAt: comic.updatedAt
  }));
  if (state.copyManagerDraft.length === 0) {
    state.copyManagerDraft = [normalizeCopy({
      id: createEntityId(`${comic.id}-copy`),
      issueId: comic.id,
      condition: comic.condition || DEFAULT_CONDITION_CODE,
      isRead: comic.isRead,
      isSealed: comic.isSealed
    }, { issueId: comic.id, position: 1 })];
  }
  elements.duplicateContext.textContent = `${comic.series} · Band ${comic.volumeNumber}${comic.title ? ` · ${comic.title}` : ""}`;
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
  const comic = state.comics.find((entry) => entry.id === state.selectedCopyComicId);
  if (!comic) return;
  const now = new Date().toISOString();
  const reference = state.copyManagerDraft[0];
  state.copyManagerDraft.push(normalizeCopy({
    id: createEntityId(`${comic.id}-copy`),
    issueId: comic.id,
    condition: reference?.condition || DEFAULT_CONDITION_CODE,
    isRead: false,
    isSealed: false,
    notes: "",
    createdAt: now,
    updatedAt: now
  }, { issueId: comic.id, position: state.copyManagerDraft.length + 1 }));
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
  const comic = state.comics.find((entry) => entry.id === state.selectedCopyComicId);
  if (!comic) return;
  if (state.copyManagerDraft.length === 0) {
    elements.duplicateMessage.textContent = "Mindestens ein Exemplar ist erforderlich.";
    elements.duplicateMessage.dataset.type = "error";
    return;
  }

  const now = new Date().toISOString();
  const copies = state.copyManagerDraft.map((copy, index) => normalizeCopy({
    ...copy,
    issueId: comic.id,
    updatedAt: now
  }, { issueId: comic.id, position: index + 1, createdAt: comic.createdAt }));
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
    await saveComic({
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
    : String(metadata?.coverUrl || comic.duckipediaCoverUrl || "");

  const nextValues = {
    title: comic.title || metadata.title || "",
    publicationYear: comic.publicationYear || metadata.publicationYear || null,
    duckipediaPageUrl: metadata.pageUrl || comic.duckipediaPageUrl || createConfiguredDuckipediaUrl(comic.series, comic.volumeNumber, comic.title),
    duckipediaCoverUrl: nextCoverUrl,
    duckipediaCoverFileName: hasAuthoritativeCoverResult ? String(metadata.coverFileName || "") : String(comic.duckipediaCoverFileName || ""),
    duckipediaCoverSource: hasAuthoritativeCoverResult ? String(metadata.coverSource || "") : String(comic.duckipediaCoverSource || ""),
    duckipediaCoverLookupVersion: hasAuthoritativeCoverResult ? lookupVersion : Number(comic.duckipediaCoverLookupVersion || 0),
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

async function resolveShelfCoverUrl(comic, { force = false } = {}) {
  if (!comic || !comic.id || !comic.numericBandNumber) return "";

  // Only a cover produced by the current infobox lookup may skip validation.
  // Older URLs can originate from PageImages and are repaired automatically.
  const storedLookupVersion = Number(comic.duckipediaCoverLookupVersion || 0);
  if (!force && storedLookupVersion >= DUCKIPEDIA_LOOKUP_VERSION) {
    return comic.duckipediaCoverUrl || "";
  }

  // A previously stored URL is still useful while offline or when automatic
  // enrichment is disabled. It is not marked as validated, so the next online
  // session can replace it with the cover declared by the Duckipedia infobox.
  if (state.settings.duckipediaAutoEnrich === false || !navigator.onLine) {
    return comic.duckipediaCoverUrl || "";
  }

  const existingPromise = state.shelfCoverResolutionPromises.get(comic.id);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const metadata = await getMetadataForBand(comic.series, comic.numericBandNumber, { force });
      const currentComic = state.comics.find((entry) => entry.id === comic.id) || comic;
      const { comic: updatedComic, changed } = mergeComicWithMetadata(currentComic, metadata);
      if (changed) {
        await saveComic(updatedComic);
        replaceComicInMemory(updatedComic);
      }
      return updatedComic.duckipediaCoverUrl || "";
    } catch (error) {
      console.warn(`Cover für ${comic.series}, Band ${comic.volumeNumber} konnte nicht automatisch geladen werden:`, error);
      return comic.duckipediaCoverUrl || "";
    } finally {
      state.shelfCoverResolutionPromises.delete(comic.id);
    }
  })();

  state.shelfCoverResolutionPromises.set(comic.id, promise);
  return promise;
}

function replaceComicInMemory(updatedComic) {
  const replace = (items) => {
    const index = items.findIndex((entry) => entry.id === updatedComic.id);
    if (index >= 0) items[index] = updatedComic;
  };
  replace(state.comics);
  replace(state.filteredComics);
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
    coverFileName: comic.duckipediaCoverFileName || "",
    coverSource: comic.duckipediaCoverSource || "",
    lookupVersion: Number(comic.duckipediaCoverLookupVersion || 0),
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

  openAddPage();
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

function resetFilters({ keepPageOpen = false, clearPreset = true } = {}) {
  elements.search.value = "";
  syncCollectionSeriesFilter(getAvailableSeries(state.settings, state.comics));
  elements.filterCondition.value = "all";
  elements.filterRead.value = "all";
  elements.filterSealed.checked = false;
  elements.filterDuplicate.checked = false;
  elements.sortBy.value = "series";
  if (clearPreset) state.collectionPreset = {};
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
    elements.sortBy.value !== "series",
    Boolean(state.collectionPreset.smartList),
    Boolean(state.collectionPreset.publicationYear),
    Boolean(state.collectionPreset.series)
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

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setFormBusy(isBusy) {
  elements.form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
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

  const availableSeries = getAvailableSeries(state.settings, state.comics);
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
  const existingCopyCount = existingIssue ? getComicCopies(existingIssue).length : 0;
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
  return state.comics.find((comic) => (
    normalizeSeriesLookup(comic.series) === normalizeSeriesLookup(series)
    && comic.numericBandNumber === Number(bandNumber)
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
      const existing = state.comics.find((comic) => comic.id === item.existingComicId);
      const hint = document.createElement("small");
      hint.className = "field-help";
      const count = existing ? getComicCopies(existing).length : 0;
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
        ? state.comics.find((comic) => comic.id === item.existingComicId)
        : findComicBySeriesAndVolume(item.series, item.volumeNumber);

      if (existing) {
        const existingCopies = getComicCopies(existing);
        const incomingCopies = drafts.map((draft, index) => normalizeCopy({
          id: createEntityId("copy"),
          issueId: existing.id,
          condition: draft.condition,
          isRead: draft.isRead,
          isSealed: draft.isSealed,
          notes: draft.notes,
          source: "scanner-pro",
          createdAt: now,
          updatedAt: now
        }, { issueId: existing.id, position: existingCopies.length + index + 1, now }));
        const copies = [...existingCopies, ...incomingCopies].map((copy, index) => ({
          ...copy,
          issueId: existing.id,
          displayOrder: index + 1
        }));
        const primary = copies[0];
        records.push({
          ...existing,
          seriesId: existing.seriesId || resolveConfiguredSeriesId(item.series),
          title: existing.title || item.title || "",
          publicationYear: existing.publicationYear || item.publicationYear || null,
          duckipediaPageUrl: existing.duckipediaPageUrl || item.pageUrl || "",
          duckipediaCoverUrl: existing.duckipediaCoverUrl || item.coverUrl || "",
          duckipediaCoverFileName: existing.duckipediaCoverFileName || item.coverFileName || "",
          duckipediaCoverSource: existing.duckipediaCoverSource || item.coverSource || "",
          duckipediaCoverLookupVersion: Number(existing.duckipediaCoverLookupVersion || item.lookupVersion || 0),
          metadataStatus: existing.metadataStatus || item.metadataStatus || "",
          metadataFetchedAt: existing.metadataFetchedAt || item.metadataFetchedAt || null,
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
    await upsertComics(records);
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
      customSeries: nextConfigs.map((entry) => entry.name),
      customSeriesConfigs: nextConfigs,
      knownHighestBandBySeries: nextHighest,
      missingBandDetails: nextDetails,
      fleaMarketSession: {
        items: nextFleaItems,
        updatedAt: state.settings.fleaMarketSession?.updatedAt || null
      }
    }, Math.max(1, configuredComics.length));
    await saveSeriesDefinition(nextConfig);
    if (configuredComics.length > 0) await upsertComics(configuredComics);

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
  const isUsed = state.comics.some((comic) => comic.series === seriesName);
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
      customSeries: nextConfigs.map((entry) => entry.name),
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
    state.missingGroups = calculateMissingBands(state.comics, nextHighest);

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
  elements.missingDetailPriority.value = normalizeWishlistPriority(detail.priority);
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
  const priority = normalizeWishlistPriority(elements.missingDetailPriority.value);
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
    priority,
    notes,
    duckipediaUrl,
    updatedAt: new Date().toISOString()
  };

  const openSeries = state.selectedMissingBand.series;
  await saveMeaningfulSettings({ missingBandDetails: nextDetails });
  renderMissingBands({ forceOpenSeries: openSeries });
  renderStats();
  renderFleaMarketHubStatus();
  if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
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
      duckipediaCoverFileName: metadata?.coverFileName || "",
      duckipediaCoverSource: metadata?.coverSource || "",
      duckipediaCoverLookupVersion: Number(metadata?.lookupVersion || 0),
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
    await refreshArchiveCoreStatus({ showReport: false });
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
  renderStats();
  renderFleaMarketHubStatus();
  if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
  closeMissingDetailModal();
  showToast("Ergänzende Details gelöscht.");
}

function hasMissingDetailContent(detail) {
  return Boolean(detail && (detail.title || detail.publicationYear || detail.desiredCondition || normalizeWishlistPriority(detail.priority) || detail.notes || detail.duckipediaUrl));
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

async function openDiagnosticsModal() {
  lazyDom.ensure("diagnostics");
  elements.diagnosticsModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.diagnosticsMessage.textContent = "";
  window.setTimeout(() => elements.closeDiagnostics.focus(), 0);
  await runDiagnostics();
}

function closeDiagnosticsModal() {
  if (!elements.diagnosticsModal) return;
  elements.diagnosticsModal.classList.add("hidden");
  restoreBodyModalState();
}

async function runDiagnostics() {
  if (state.diagnosticsRunning) return state.latestDiagnosticReport;
  state.diagnosticsRunning = true;
  setDiagnosticsBusy(true);
  elements.diagnosticsMessage.textContent = "Technische Prüfung läuft …";
  elements.diagnosticsMessage.dataset.type = "info";

  try {
    const report = await collectDiagnosticReport({
      appVersion: APP_CONFIG.appVersion,
      dataFormatVersion: APP_CONFIG.dataFormatVersion,
      archiveModelVersion: APP_CONFIG.archiveModelVersion,
      optionalAssets: getOptionalAssetStatus()
    });
    state.latestDiagnosticReport = report;
    renderDiagnosticReport(report);
    const warningCount = report.checks.filter((check) => check.status !== "ok").length;
    elements.diagnosticsMessage.textContent = warningCount === 0
      ? "Alle Kernprüfungen wurden ohne Warnung abgeschlossen."
      : `${warningCount} Hinweis${warningCount === 1 ? "" : "e"} gefunden. Deine Sammlung wurde dabei nicht verändert.`;
    elements.diagnosticsMessage.dataset.type = warningCount === 0 ? "success" : "warning";
    return report;
  } catch (error) {
    console.error("Diagnose konnte nicht ausgeführt werden:", error);
    recordDiagnosticError(error, "Diagnose ausführen", "error");
    elements.diagnosticsMessage.textContent = `Diagnose fehlgeschlagen: ${error.message}`;
    elements.diagnosticsMessage.dataset.type = "error";
    renderDiagnosticErrorLog();
    return null;
  } finally {
    state.diagnosticsRunning = false;
    setDiagnosticsBusy(false);
  }
}

function renderDiagnosticReport(report) {
  elements.diagnosticsOverview.replaceChildren();

  const comicCount = report.database?.archiveGraph?.counts?.issues ?? report.database?.stores?.comics?.count;
  const physicalCopyCount = report.database?.archiveGraph?.counts?.copies;
  const coverCount = report.database?.stores?.coverMedia?.count;
  const metadataCount = report.database?.stores?.metadataCache?.count;
  const storageLabel = report.storage?.usage === null
    ? "Nicht gemeldet"
    : `${formatDiagnosticBytes(report.storage.usage)} belegt`;
  const offlineLabel = report.serviceWorker?.controlled
    ? `Aktiv${report.serviceWorker.workerStatus?.cacheName ? ` · ${report.serviceWorker.workerStatus.cacheName}` : ""}`
    : "Noch nicht aktiv";

  [
    ["App", `v${report.appVersion}`, `${report.environment?.testMode ? "Testmodus · " : ""}Datenformat ${report.dataFormatVersion} · Archivmodell ${report.archiveModelVersion ?? "?"}`],
    ["Lokale Sammlung", Number.isFinite(comicCount) ? `${comicCount} Ausgaben` : "Nicht lesbar", Number.isFinite(physicalCopyCount) ? `${physicalCopyCount} physische Exemplare` : (Number.isFinite(coverCount) ? `${coverCount} eigene Cover` : "")],
    ["Lokaler Speicher", storageLabel, report.storage?.quota === null ? "Kontingent unbekannt" : `${formatDiagnosticBytes(report.storage.quota)} gemeldet`],
    ["Offline-Modus", offlineLabel, Number.isFinite(metadataCount) ? `${metadataCount} Metadatensätze` : ""]
  ].forEach(([label, value, detail]) => {
    const card = document.createElement("div");
    card.className = "diagnostics-summary-card";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value;
    const detailNode = document.createElement("small");
    detailNode.textContent = detail;
    card.append(labelNode, valueNode, detailNode);
    elements.diagnosticsOverview.append(card);
  });

  elements.diagnosticsCheckList.replaceChildren();
  report.checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = "diagnostics-check";
    row.dataset.status = check.status;
    const icon = document.createElement("span");
    icon.className = "diagnostics-check-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = check.status === "ok" ? "✓" : "!";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = check.label;
    const detail = document.createElement("small");
    detail.textContent = check.detail;
    copy.append(title, detail);
    row.append(icon, copy);
    elements.diagnosticsCheckList.append(row);
  });

  renderDiagnosticErrorLog(report.recentErrors);
}

function renderDiagnosticErrorLog(entries = getDiagnosticLog()) {
  elements.diagnosticsErrorList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "diagnostics-empty";
    empty.textContent = "Keine technischen Fehlermeldungen gespeichert.";
    elements.diagnosticsErrorList.append(empty);
    return;
  }

  entries.slice(0, 12).forEach((entry) => {
    const item = document.createElement("article");
    item.className = "diagnostics-error-item";
    const context = document.createElement("strong");
    context.textContent = entry.context || "Technische Meldung";
    const message = document.createElement("span");
    message.textContent = entry.message || "Unbekannter Fehler";
    const time = document.createElement("time");
    time.dateTime = entry.timestamp || "";
    time.textContent = formatDiagnosticDate(entry.timestamp);
    item.append(context, message, time);
    elements.diagnosticsErrorList.append(item);
  });
}

async function handleDiagnosticExport() {
  const report = state.latestDiagnosticReport || await runDiagnostics();
  if (!report) return;
  try {
    downloadDiagnosticReport(report, createAppFilename("Entenarchiv-Diagnose", "json"));
    elements.diagnosticsMessage.textContent = "Diagnosebericht wurde als JSON-Datei erstellt.";
    elements.diagnosticsMessage.dataset.type = "success";
  } catch (error) {
    recordDiagnosticError(error, "Diagnose exportieren", "error");
    elements.diagnosticsMessage.textContent = `Export fehlgeschlagen: ${error.message}`;
    elements.diagnosticsMessage.dataset.type = "error";
  }
}

function handleClearDiagnostics() {
  clearDiagnosticLog();
  if (state.latestDiagnosticReport) state.latestDiagnosticReport.recentErrors = [];
  renderDiagnosticErrorLog([]);
  elements.diagnosticsMessage.textContent = "Gespeicherte technische Meldungen wurden gelöscht.";
  elements.diagnosticsMessage.dataset.type = "success";
}

function setDiagnosticsBusy(isBusy) {
  [elements.runDiagnostics, elements.exportDiagnostics, elements.clearDiagnostics, elements.openRecovery]
    .forEach((button) => { button.disabled = Boolean(isBusy); });
}

function formatDiagnosticDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Zeitpunkt unbekannt"
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
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
      content: createCollectionCsv(state.comics, state.settings),
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
      lastBackupComicCount: state.comics.length
    };
    const metadataCache = await getAllMetadataCache();
    const result = await shareOrDownloadText({
      content: createJsonBackup(state.comics, nextSettings, metadataCache),
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
    let mergeResult = null;

    if (mode === "replace") {
      await replaceAllComics(state.importBackup.comics);
      resultMessage = `${state.importBackup.comics.length} Einträge wurden wiederhergestellt.`;
    } else {
      mergeResult = mergeCollections(state.comics, state.importBackup.comics);
      await replaceAllComics(mergeResult.comics);
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
      ? await getAllComics()
      : null;

    if (mode === "replace" && !state.importBackup.hasMedia) {
      const validComicIds = new Set((storedComicsAfterImport || []).map((comic) => comic.id));
      const existingCovers = await getAllCoverMedia();
      await replaceAllCoverMedia(existingCovers.filter((cover) => validComicIds.has(cover.comicId)));
    }

    if (state.importBackup.hasMedia) {
      const importedComicIds = new Set((storedComicsAfterImport || await getAllComics()).map((comic) => comic.id));
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

function getSafeCalendarYear(value = state.settings.calendarSelectedYear) {
  const year = Number(value);
  return Number.isSafeInteger(year) && year >= 1900 && year <= 2100
    ? year
    : new Date().getFullYear();
}

function getSafeCalendarMonth(value = state.settings.calendarSelectedMonth) {
  const month = Number(value);
  return Number.isSafeInteger(month) && month >= 0 && month <= 11
    ? month
    : new Date().getMonth();
}

function getCalendarEvents() {
  return Array.isArray(state.settings.calendarEvents)
    ? state.settings.calendarEvents.map(normalizeCalendarEvent).filter(Boolean).sort(compareCalendarEvents)
    : [];
}

function getCalendarImportedSources() {
  return state.settings.calendarImportedSources && typeof state.settings.calendarImportedSources === "object"
    ? { ...state.settings.calendarImportedSources }
    : {};
}

function renderCalendarOverview() {
  renderReleaseRadarIndicators();
}

async function openCalendarPage() {
  elements.calendarReminderTime.value = state.settings.calendarReminderTime || "09:00";
  elements.calendarAutoSync.checked = state.settings.calendarAutoSync !== false;
  elements.calendarSearch.value = state.calendarSearch;
  elements.calendarCategoryFilter.value = state.calendarFilter;
  elements.calendarPage.classList.remove("hidden");
  elements.calendarPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.calendarPage.scrollTop = 0;
  renderCalendarPage();
  window.setTimeout(() => elements.closeCalendar.focus({ preventScroll: true }), 0);
  await refreshCalendarCatalog({ silent: true, autoImport: true });
}

function closeCalendarPage({ returnFocus = true } = {}) {
  elements.calendarPage.classList.add("hidden");
  elements.calendarPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  if (returnFocus) window.setTimeout(() => elements.openCalendar.focus({ preventScroll: true }), 0);
}

function renderCalendarPage() {
  const year = getSafeCalendarYear();
  const month = getSafeCalendarMonth();
  const allYearEvents = getEventsForYear(getCalendarEvents(), year);
  const yearEvents = filterCalendarEvents(allYearEvents, {
    category: state.calendarFilter,
    query: state.calendarSearch
  });
  const monthEvents = getEventsForMonth(yearEvents, year, month);

  renderCalendarYearOptions(year);
  elements.calendarPageSummary.textContent = allYearEvents.length === 1 ? "1 Termin" : `${allYearEvents.length} Termine`;
  elements.calendarMonthTitle.textContent = `${getMonthName(month)} ${year}`;
  elements.calendarMonthCount.textContent = monthEvents.length === 1 ? "1 Termin" : `${monthEvents.length} Termine`;

  const importedCount = Object.keys(getCalendarImportedSources()).length;
  const availableCount = state.calendarCatalog.filter((entry) => entry.active).length;
  elements.calendarImportSummary.textContent = availableCount
    ? `${availableCount} Jahr${availableCount === 1 ? "" : "e"} verfügbar · ${importedCount} importiert`
    : state.settings.calendarCatalogLastCheckAt
      ? "Keine Jahrespläne gefunden"
      : "Kalenderindex wird geprüft";

  renderCalendarCatalog();
  renderCalendarMonthTabs(year, month, yearEvents);
  renderCalendarGrid(year, month, monthEvents);
  renderCalendarEventList(monthEvents);
  renderReleaseRadarIndicators();
}

function renderCalendarYearOptions(selectedYear) {
  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear - 1, currentYear, currentYear + 1, Number(selectedYear)]);
  state.calendarCatalog.forEach((entry) => years.add(entry.year));
  getCalendarEvents().forEach((event) => years.add(Number(event.startDate.slice(0, 4))));

  elements.calendarYearSelect.replaceChildren();
  [...years].filter((year) => Number.isSafeInteger(year) && year >= 1900 && year <= 2100).sort((a, b) => a - b).forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    const available = state.calendarCatalog.some((entry) => entry.year === year && entry.active);
    option.textContent = available ? `${year} · Jahresplan` : String(year);
    elements.calendarYearSelect.append(option);
  });
  elements.calendarYearSelect.value = String(selectedYear);
}

function renderCalendarCatalog() {
  const importedSources = getCalendarImportedSources();
  const activeEntries = state.calendarCatalog.filter((entry) => entry.active);
  const lastCheck = state.settings.calendarCatalogLastCheckAt;
  elements.calendarCatalogStatus.textContent = state.calendarCatalogLoading
    ? "Kalenderindex wird geprüft …"
    : lastCheck
      ? `${activeEntries.length} Jahr${activeEntries.length === 1 ? "" : "e"} verfügbar · geprüft ${formatDateTime(lastCheck)}`
      : "Noch nicht geprüft";
  elements.calendarRefreshCatalog.disabled = state.calendarCatalogLoading;
  elements.calendarAutoSync.checked = state.settings.calendarAutoSync !== false;
  elements.calendarCatalogList.replaceChildren();

  if (!activeEntries.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy calendar-catalog-empty";
    empty.textContent = state.calendarCatalogLoading
      ? "Verfügbare Jahre werden geladen."
      : "Noch keine Jahrespläne im Kalenderindex gefunden.";
    elements.calendarCatalogList.append(empty);
    return;
  }

  activeEntries.forEach((entry) => {
    const record = importedSources[String(entry.year)];
    const publisherCount = getEventsForYear(getCalendarEvents(), entry.year).filter((event) => event.source === "publisher").length;
    const signatureMatches = record && `${record.id}|${record.version}|${record.file}` === createCalendarCatalogSignature(entry);

    const card = document.createElement("article");
    card.className = "calendar-catalog-card";

    const heading = document.createElement("div");
    heading.className = "calendar-catalog-heading";
    const copy = document.createElement("div");
    const year = document.createElement("strong");
    year.textContent = String(entry.year);
    const label = document.createElement("span");
    label.textContent = entry.label;
    copy.append(year, label);
    const badge = document.createElement("span");
    badge.className = `calendar-catalog-badge ${publisherCount ? "is-imported" : ""}`;
    badge.textContent = publisherCount ? `${publisherCount} Termine` : "Nicht geladen";
    heading.append(copy, badge);

    const metadata = document.createElement("p");
    metadata.className = "muted-copy";
    metadata.textContent = record?.importedAt
      ? `${signatureMatches ? "Aktuell" : "Update verfügbar"} · importiert ${formatDateTime(record.importedAt)}`
      : entry.notes || `Version ${entry.version}`;

    const actions = document.createElement("div");
    actions.className = "calendar-catalog-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.className = publisherCount && signatureMatches ? "secondary-button compact-button" : "primary-button compact-button";
    load.dataset.calendarCatalogImport = String(entry.year);
    load.textContent = publisherCount ? (signatureMatches ? "Neu laden" : "Aktualisieren") : "Laden";
    actions.append(load);

    if (entry.sourceUrl) {
      const source = document.createElement("a");
      source.className = "text-button calendar-source-link";
      source.href = entry.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "Verlagsquelle ↗";
      actions.append(source);
    }

    if (publisherCount || record) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button danger-text-button";
      remove.dataset.calendarCatalogRemove = String(entry.year);
      remove.textContent = "Jahr entfernen";
      actions.append(remove);
    }

    card.append(heading, metadata, actions);
    elements.calendarCatalogList.append(card);
  });
}

function renderCalendarMonthTabs(year, selectedMonth, yearEvents) {
  elements.calendarMonthTabs.replaceChildren();
  for (let month = 0; month < 12; month += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.calendarMonth = String(month);
    button.className = "calendar-month-tab";
    if (month === selectedMonth) button.classList.add("active");
    const count = getEventsForMonth(yearEvents, year, month).length;
    button.textContent = `${getMonthName(month).slice(0, 3)}${count ? ` · ${count}` : ""}`;
    elements.calendarMonthTabs.append(button);
  }
}

function renderCalendarGrid(year, month, monthEvents) {
  elements.calendarGrid.replaceChildren();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  for (let index = 0; index < offset; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day calendar-day-empty";
    spacer.setAttribute("aria-hidden", "true");
    elements.calendarGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = monthEvents.filter((event) => event.startDate === date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.calendarDate = date;
    if (isToday(date)) button.classList.add("calendar-day-today");
    if (dayEvents.length) button.classList.add("calendar-day-has-events");
    button.setAttribute("aria-label", `${day}. ${getMonthName(month)}${dayEvents.length ? `, ${dayEvents.length} Termine` : ""}`);
    const number = document.createElement("span");
    number.textContent = String(day);
    button.append(number);
    if (dayEvents.length) {
      const dots = document.createElement("span");
      dots.className = "calendar-day-dots";
      [...new Set(dayEvents.map((event) => event.category))].slice(0, 3).forEach((category) => {
        const dot = document.createElement("i");
        dot.className = `calendar-dot calendar-dot-${category}`;
        dots.append(dot);
      });
      button.append(dots);
    }
    elements.calendarGrid.append(button);
  }
}

function renderCalendarEventList(events) {
  elements.calendarEventList.replaceChildren();
  elements.calendarEmpty.classList.toggle("hidden", events.length > 0);
  if (!events.length) return;
  const radarItemsByEventId = new Map(getReleaseRadarItems().map((item) => [item.event.id, item]));

  events.forEach((event) => {
    const article = document.createElement("article");
    article.className = `calendar-event-card calendar-event-${event.category}`;
    article.dataset.calendarEventId = event.id;
    const dateBlock = document.createElement("div");
    dateBlock.className = "calendar-event-date";
    const dateNumber = document.createElement("strong");
    dateNumber.textContent = String(Number(event.startDate.slice(8, 10)));
    const weekday = document.createElement("span");
    weekday.textContent = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${event.startDate}T12:00:00`));
    dateBlock.append(dateNumber, weekday);

    const copy = document.createElement("div");
    copy.className = "calendar-event-copy";
    const badgeRow = document.createElement("div");
    badgeRow.className = "calendar-event-badge-row";
    const badge = document.createElement("span");
    badge.className = "calendar-event-badge";
    badge.textContent = event.source === "publisher" ? "Neuerscheinung" : event.category === "flea-market" ? "Flohmarkt" : event.category === "comic-fair" ? "Comicbörse" : "Eigener Termin";
    badgeRow.append(badge);

    const releaseLink = resolveCalendarRelease(event);
    if (releaseLink) {
      const status = getCalendarCollectionStatus(releaseLink);
      const statusBadge = document.createElement("span");
      statusBadge.className = `calendar-collection-status calendar-collection-${status.type}`;
      statusBadge.textContent = status.label;
      badgeRow.append(statusBadge);
    }
    const radarItem = radarItemsByEventId.get(event.id);
    if (radarItem?.isNew) {
      const radarBadge = document.createElement("span");
      radarBadge.className = "calendar-radar-status is-new";
      radarBadge.textContent = "Neu";
      badgeRow.append(radarBadge);
    } else if (radarItem && ["watch", "ordered", "ignored"].includes(radarItem.effectiveStatus)) {
      const radarBadge = document.createElement("span");
      radarBadge.className = `calendar-radar-status is-${radarItem.effectiveStatus}`;
      radarBadge.textContent = radarItem.effectiveStatus === "watch" ? "Vorgemerkt" : radarItem.effectiveStatus === "ordered" ? "Bestellt" : "Ignoriert";
      badgeRow.append(radarBadge);
    }

    const title = document.createElement("h4");
    title.textContent = event.title;
    const metadata = document.createElement("p");
    metadata.textContent = [event.startTime, event.location].filter(Boolean).join(" · ") || (event.source === "publisher" ? event.sourceName : "Ganztägig");
    copy.append(badgeRow, title, metadata);

    const actions = document.createElement("div");
    actions.className = "calendar-event-actions";
    const url = event.url || inferDuckipediaUrlFromCalendarTitle(event.title);
    if (url) {
      const link = document.createElement("a");
      link.className = "calendar-event-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Details ↗";
      actions.append(link);
    }
    if (releaseLink) {
      const status = getCalendarCollectionStatus(releaseLink);
      const action = document.createElement("button");
      action.type = "button";
      action.className = status.type === "owned" ? "success-button compact-button" : "secondary-button compact-button";
      action.dataset.calendarCollectionAction = status.type === "owned" ? "owned" : status.type === "missing" ? "missing" : "watch";
      action.dataset.series = releaseLink.series;
      action.dataset.bandNumber = String(releaseLink.bandNumber);
      action.textContent = status.type === "owned" ? "In Sammlung" : status.type === "missing" ? "Fehlband öffnen" : "Auf Wunschliste";
      actions.append(action);
    } else if (event.source === "publisher" && event.category === "release") {
      const linkAction = document.createElement("button");
      linkAction.type = "button";
      linkAction.className = "secondary-button compact-button";
      linkAction.dataset.calendarReleaseLink = event.id;
      linkAction.textContent = "Reihe zuordnen";
      actions.append(linkAction);
    }
    if (event.source === "custom") {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.dataset.calendarEdit = event.id;
      edit.textContent = "Bearbeiten";
      actions.append(edit);
    }
    article.append(dateBlock, copy, actions);
    elements.calendarEventList.append(article);
  });
}

function getReleaseSeriesCatalog() {
  const calendarAliases = normalizeReleaseSeriesAliases(state.settings.releaseSeriesAliases);
  const withCalendarAliases = (entry) => ({
    ...entry,
    aliases: [...new Set([...(Array.isArray(entry.aliases) ? entry.aliases : []), ...(calendarAliases[entry.id] || [])])]
  });
  const customDefinitions = Array.isArray(state.settings.customSeriesConfigs)
    ? state.settings.customSeriesConfigs.map((entry) => withCalendarAliases({
        id: entry.id || createCustomSeriesId(entry.name),
        name: entry.name,
        aliases: entry.aliases || []
      }))
    : [];
  const configuredNames = new Set([
    ...STANDARD_SERIES_DEFINITIONS.map((entry) => entry.name),
    ...customDefinitions.map((entry) => entry.name)
  ]);
  const usedDefinitions = state.comics
    .filter((comic) => comic?.series && !configuredNames.has(comic.series))
    .map((comic) => ({
      id: comic.seriesId || createCustomSeriesId(comic.series),
      name: comic.series,
      aliases: []
    }));
  return normalizeReleaseSeriesCatalog([
    ...STANDARD_SERIES_DEFINITIONS.map(withCalendarAliases),
    ...customDefinitions,
    ...usedDefinitions.map(withCalendarAliases)
  ]);
}

function resolveCalendarRelease(event) {
  return resolveReleaseIdentity(event, getReleaseSeriesCatalog(), state.settings.releaseEventLinks);
}

function getCalendarCollectionStatus({ seriesId, series, bandNumber }) {
  const normalizedSeriesId = String(seriesId || "").trim();
  const owned = state.comics.some((comic) => {
    const sameSeries = normalizedSeriesId
      ? comic.seriesId === normalizedSeriesId
      : comic.series === series;
    return sameSeries && comic.numericBandNumber === bandNumber;
  });
  if (owned) return { type: "owned", label: "Im Besitz" };
  const missing = state.missingGroups.some((group) => {
    const sameSeries = normalizedSeriesId && group.seriesId
      ? group.seriesId === normalizedSeriesId
      : group.series === series;
    return sameSeries && group.missingBands.includes(bandNumber);
  });
  if (missing) return { type: "missing", label: "Fehlt" };
  return { type: "planned", label: "Noch nicht vorgemerkt" };
}

function inferDuckipediaUrlFromCalendarTitle(title) {
  const pseudoEvent = { source: "publisher", category: "release", title };
  const release = resolveCalendarRelease(pseudoEvent);
  return release ? createConfiguredDuckipediaUrl(release.series, release.bandNumber, title) : "";
}

async function handleCalendarCollectionAction(button) {
  const series = button.dataset.series;
  const bandNumber = Number(button.dataset.bandNumber);
  if (!series || !Number.isSafeInteger(bandNumber)) return;
  const action = button.dataset.calendarCollectionAction;

  if (action === "owned") {
    closeCalendarPage({ returnFocus: false });
    openCollectionPage("all", { series, search: bandNumber });
    return;
  }

  if (action === "watch") {
    const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };
    const currentTarget = Number(nextTargets[series]) || 0;
    if (bandNumber > currentTarget) nextTargets[series] = bandNumber;
    await saveMeaningfulSettings({ knownHighestBandBySeries: nextTargets });
    state.missingGroups = calculateMissingBands(state.comics, nextTargets);
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
  }
  await openMissingDetailModal(series, bandNumber);
}

function getReleaseRadarItems() {
  return createReleaseRadarItems(getCalendarEvents(), {
    seriesCatalog: getReleaseSeriesCatalog(),
    comics: state.comics,
    missingGroups: state.missingGroups,
    decisions: state.settings.releaseRadarDecisions,
    knownSignatures: state.settings.releaseRadarKnownSignatures,
    eventLinks: state.settings.releaseEventLinks
  });
}

async function initializeReleaseRadarIfNeeded() {
  if (state.settings.releaseRadarInitializedAt) return false;
  const releaseEvents = getCalendarEvents().filter((event) => event.source === "publisher" && event.category === "release");
  if (!releaseEvents.length) return false;

  const today = getLocalDateKey();
  const pastEvents = releaseEvents.filter((event) => event.startDate < today);
  state.settings = await saveAppSettings({
    ...state.settings,
    releaseRadarKnownSignatures: mergeKnownReleaseSignatures([], pastEvents),
    releaseRadarInitializedAt: new Date().toISOString(),
    releaseRadarFilter: RELEASE_RADAR_FILTERS.includes(state.releaseRadarFilter) ? state.releaseRadarFilter : "open"
  });
  return true;
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderReleaseRadarIndicators() {
  if (!elements.releaseRadarHomeCount) return;
  const items = getReleaseRadarItems();
  const summary = summarizeReleaseRadar(items);
  const badgeCount = getReleaseRadarBadgeCount(items);
  const badgeLabel = badgeCount === 1 ? "1 neu" : `${badgeCount} neu`;

  elements.releaseRadarHomeCount.textContent = String(badgeCount);
  elements.releaseRadarHomeCount.classList.toggle("is-clear", badgeCount === 0);
  elements.releaseRadarHomeMeta.textContent = badgeCount > 0
    ? (summary.todayCount > 0 ? `${summary.todayCount} heute` : "neu")
    : `${summary.upcoming} geplant`;

  if (summary.next) {
    elements.releaseRadarHomeTitle.textContent = "Nächste Neuerscheinung";
    elements.releaseRadarHomeNext.textContent = summary.next.event.title;
    elements.releaseRadarHomeDate.textContent = `${getReleaseTimingLabel(summary.next)} · ${formatCalendarDate(summary.next.event.startDate, { includeYear: true })}`;
    elements.calendarRadarTitle.textContent = badgeCount > 0
      ? `${badgeCount} Veröffentlichung${badgeCount === 1 ? "" : "en"} prüfen`
      : "Alles im Blick";
    elements.calendarRadarNext.textContent = `${summary.next.event.title} · ${getReleaseTimingLabel(summary.next)}`;
  } else {
    elements.releaseRadarHomeTitle.textContent = "Erscheinungsradar";
    elements.releaseRadarHomeNext.textContent = "Keine kommende Veröffentlichung im geladenen Kalender";
    elements.releaseRadarHomeDate.textContent = "Neue Jahrespläne werden automatisch einsortiert.";
    elements.calendarRadarTitle.textContent = "Keine offenen Neuerscheinungen";
    elements.calendarRadarNext.textContent = "Sobald ein neuer Jahresplan erscheint, wird er hier angezeigt.";
  }

  elements.calendarRadarCount.textContent = badgeCount > 0 ? badgeLabel : "aktuell";
  elements.calendarRadarCount.classList.toggle("is-clear", badgeCount === 0);
  elements.calendarNavBadge.textContent = String(badgeCount);
  elements.calendarNavBadge.classList.toggle("hidden", badgeCount === 0);
  elements.calendarNavBadge.setAttribute("aria-label", `${badgeCount} neue oder heute fällige Veröffentlichungen`);

  updateReleaseRadarBadge(badgeCount).catch((error) => {
    console.warn("App-Badge konnte nicht aktualisiert werden:", error);
  });
}

function openReleaseRadarPage({ returnTarget = "home" } = {}) {
  state.releaseRadarReturnTarget = returnTarget;
  elements.releaseRadarPage.classList.remove("hidden");
  elements.releaseRadarPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.releaseRadarPage.scrollTop = 0;
  renderReleaseRadarPage();

  saveAppSettings({
    ...state.settings,
    releaseRadarLastOpenedAt: new Date().toISOString()
  }).then((settings) => {
    state.settings = settings;
  }).catch((error) => console.warn("Radar-Zeitpunkt konnte nicht gespeichert werden:", error));

  window.setTimeout(() => elements.closeReleaseRadar.focus({ preventScroll: true }), 0);
}

function closeReleaseRadarPage({ returnFocus = true } = {}) {
  if (elements.releaseRadarPage.classList.contains("hidden")) return;
  elements.releaseRadarPage.classList.add("hidden");
  elements.releaseRadarPage.setAttribute("aria-hidden", "true");
  const anotherPageOpen = [...document.querySelectorAll(".app-page")]
    .some((page) => !page.classList.contains("hidden"));
  document.body.classList.toggle("app-page-open", anotherPageOpen);
  if (!returnFocus) return;
  const target = state.releaseRadarReturnTarget === "calendar" && !elements.calendarPage.classList.contains("hidden")
    ? elements.openReleaseRadarCalendar
    : elements.openReleaseRadarHome;
  window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
}

function renderReleaseRadarPage() {
  const items = getReleaseRadarItems();
  const summary = summarizeReleaseRadar(items);
  const visibleItems = filterReleaseRadarItems(items, state.releaseRadarFilter);

  elements.releaseRadarSummary.textContent = `${summary.upcoming} offen`;
  elements.releaseRadarNewCount.textContent = String(summary.newCount);
  elements.releaseRadarTodayCount.textContent = String(summary.todayCount);
  elements.releaseRadarWatchCount.textContent = String(summary.watchedCount);
  elements.releaseRadarOrderedCount.textContent = String(summary.orderedCount);

  if (summary.next) {
    elements.releaseRadarNextTitle.textContent = summary.next.event.title;
    elements.releaseRadarNextCopy.textContent = `${getReleaseTimingLabel(summary.next)} · ${formatCalendarDate(summary.next.event.startDate, { includeYear: true })}`;
  } else {
    elements.releaseRadarNextTitle.textContent = "Keine offene Neuerscheinung";
    elements.releaseRadarNextCopy.textContent = "Alle bekannten Termine sind erledigt oder es wurde noch kein Jahresplan geladen.";
  }

  elements.releaseRadarFilterTabs.querySelectorAll("button[data-radar-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.radarFilter === state.releaseRadarFilter);
  });
  elements.releaseRadarList.replaceChildren();
  elements.releaseRadarEmpty.classList.toggle("hidden", visibleItems.length > 0);
  elements.releaseRadarMarkSeen.disabled = !visibleItems.some((item) => item.isNew);
  elements.releaseRadarExport.disabled = !items.some((item) => ["watch", "ordered"].includes(item.effectiveStatus) && item.timing !== "past");

  visibleItems.forEach((item) => elements.releaseRadarList.append(createReleaseRadarCard(item)));
  renderReleaseRadarBadgeStatus(getReleaseRadarBadgeCount(items));
  renderReleaseRadarIndicators();
}

function createReleaseRadarCard(item) {
  const article = document.createElement("article");
  article.className = `release-radar-card is-${item.effectiveStatus}${item.isNew ? " is-new" : ""}`;
  article.dataset.radarKey = item.key;

  const date = document.createElement("div");
  date.className = "release-radar-date";
  const day = document.createElement("strong");
  day.textContent = String(Number(item.event.startDate.slice(8, 10)));
  const month = document.createElement("span");
  month.textContent = getMonthName(Number(item.event.startDate.slice(5, 7)) - 1).slice(0, 3);
  const year = document.createElement("small");
  year.textContent = item.event.startDate.slice(0, 4);
  date.append(day, month, year);

  const content = document.createElement("div");
  content.className = "release-radar-card-content";
  const badges = document.createElement("div");
  badges.className = "release-radar-card-badges";
  if (item.isNew) badges.append(createRadarBadge("Neu", "is-new"));
  badges.append(createRadarBadge(getReleaseRadarStatusLabel(item), `is-${item.effectiveStatus}`));
  badges.append(createRadarBadge(item.collection.label, `is-${item.collection.type}`));

  const title = document.createElement("h3");
  title.textContent = item.event.title;
  const timing = document.createElement("p");
  timing.className = "release-radar-timing";
  timing.textContent = `${getReleaseTimingLabel(item)} · ${formatCalendarDate(item.event.startDate, { includeYear: true })}`;
  const source = document.createElement("p");
  source.className = "muted-copy";
  source.textContent = item.identity
    ? `${item.identity.series} · Band ${item.identity.bandNumber}`
    : `${item.event.sourceName || "LTB Jahresplan"} · noch keiner Archivreihe zugeordnet`;
  content.append(badges, title, timing, source);
  if (item.identity && item.collection.type !== "owned") {
    content.append(createReleaseRadarPriorityControl(item));
  }

  const actions = document.createElement("div");
  actions.className = "release-radar-card-actions";

  if (item.collection.type === "owned" && item.identity) {
    actions.append(createReleaseRadarAction("owned", "In Sammlung", item.key, "success-button compact-button"));
  } else if (!item.identity) {
    actions.append(createReleaseRadarAction("link", "Reihe zuordnen", item.key, "primary-button compact-button"));
  } else if (item.identity) {
    actions.append(
      createReleaseRadarAction("watch", item.effectiveStatus === "watch" ? "Vorgemerkt ✓" : "Vormerken", item.key, item.effectiveStatus === "watch" ? "primary-button compact-button" : "secondary-button compact-button"),
      createReleaseRadarAction("ordered", item.effectiveStatus === "ordered" ? "Bestellt ✓" : "Bestellt", item.key, item.effectiveStatus === "ordered" ? "primary-button compact-button" : "secondary-button compact-button")
    );
    if (item.timing !== "upcoming") {
      actions.append(createReleaseRadarAction("add", "Als vorhanden eintragen", item.key, "success-button compact-button"));
    }
  }

  if (item.isNew) actions.append(createReleaseRadarAction("seen", "Gesehen", item.key, "text-button"));
  if (item.decision) actions.append(createReleaseRadarAction("reset", "Status zurücksetzen", item.key, "text-button"));
  if (item.effectiveStatus !== "ignored" && item.collection.type !== "owned") {
    actions.append(createReleaseRadarAction("ignored", "Ignorieren", item.key, "text-button danger-text-button"));
  }

  const url = item.event.url || inferDuckipediaUrlFromCalendarTitle(item.event.title);
  if (url) {
    const link = document.createElement("a");
    link.className = "text-button release-radar-details-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Details ↗";
    actions.append(link);
  }

  article.append(date, content, actions);
  return article;
}

function createReleaseRadarPriorityControl(item) {
  const label = document.createElement("label");
  label.className = "release-radar-priority";
  const text = document.createElement("span");
  text.textContent = "Suchprio";
  const select = document.createElement("select");
  select.dataset.radarPriority = item.key;
  select.setAttribute("aria-label", `Suchpriorität für ${item.event.title}`);

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Keine";
  select.append(empty);
  WISHLIST_PRIORITIES.forEach((priority) => {
    const option = document.createElement("option");
    option.value = priority.id;
    option.textContent = priority.label;
    select.append(option);
  });

  const detailKey = createMissingDetailKey(item.identity.series, item.identity.bandNumber);
  select.value = normalizeWishlistPriority(state.settings.missingBandDetails?.[detailKey]?.priority);
  label.append(text, select);
  return label;
}

async function handleReleaseRadarPriorityChange(event) {
  const select = event.target.closest("select[data-radar-priority]");
  if (!select) return;
  const item = getReleaseRadarItems().find((entry) => entry.key === select.dataset.radarPriority);
  if (!item?.identity || item.collection.type === "owned") return;

  const priority = normalizeWishlistPriority(select.value);
  const detailKey = createMissingDetailKey(item.identity.series, item.identity.bandNumber);
  const nextDetails = { ...(state.settings.missingBandDetails || {}) };
  const existingDetail = nextDetails[detailKey] || {};
  const nextDetail = { ...existingDetail, priority, updatedAt: new Date().toISOString() };
  if (hasMissingDetailContent(nextDetail)) nextDetails[detailKey] = nextDetail;
  else delete nextDetails[detailKey];

  const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };
  if (priority && priority !== "ignore") {
    const currentTarget = Number(nextTargets[item.identity.series]) || 0;
    if (item.identity.bandNumber > currentTarget) nextTargets[item.identity.series] = item.identity.bandNumber;
  }

  const decisions = normalizeReleaseDecisionMap(state.settings.releaseRadarDecisions);
  if (priority === "ignore") {
    decisions[item.key] = { status: "ignored", updatedAt: new Date().toISOString() };
  } else if (priority && decisions[item.key]?.status === "ignored") {
    delete decisions[item.key];
  }

  try {
    await saveMeaningfulSettings({
      missingBandDetails: nextDetails,
      knownHighestBandBySeries: nextTargets,
      releaseRadarDecisions: decisions
    }, 1);
    state.missingGroups = calculateMissingBands(state.comics, nextTargets);
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderFleaMarketHubStatus();
    renderReleaseRadarPage();
    if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
    showReleaseRadarMessage(priority ? `Suchpriorität „${getWishlistPriorityDefinition(priority)?.label}“ gespeichert.` : "Suchpriorität entfernt.", "success");
  } catch (error) {
    select.value = normalizeWishlistPriority(state.settings.missingBandDetails?.[detailKey]?.priority);
    showReleaseRadarMessage(`Suchpriorität konnte nicht gespeichert werden: ${error.message}`, "error");
  }
}

function createRadarBadge(label, variant) {
  const badge = document.createElement("span");
  badge.className = `release-radar-status-badge ${variant}`;
  badge.textContent = label;
  return badge;
}

function getReleaseRadarStatusLabel(item) {
  if (item.effectiveStatus === "owned") return "Im Besitz";
  if (item.effectiveStatus === "watch") return "Vorgemerkt";
  if (item.effectiveStatus === "ordered") return "Bestellt";
  if (item.effectiveStatus === "ignored") return "Ignoriert";
  return item.timing === "today" ? "Heute" : item.timing === "past" ? "Erschienen" : "Offen";
}

function createReleaseRadarAction(action, label, key, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.radarAction = action;
  button.dataset.radarKey = key;
  button.textContent = label;
  return button;
}

function handleReleaseRadarPageClick(event) {
  const filterButton = event.target.closest("button[data-radar-filter]");
  if (filterButton) {
    state.releaseRadarFilter = RELEASE_RADAR_FILTERS.includes(filterButton.dataset.radarFilter)
      ? filterButton.dataset.radarFilter
      : "open";
    saveAppSettings({ ...state.settings, releaseRadarFilter: state.releaseRadarFilter })
      .then((settings) => { state.settings = settings; })
      .catch((error) => console.warn("Radarfilter konnte nicht gespeichert werden:", error));
    renderReleaseRadarPage();
    return;
  }

  const actionButton = event.target.closest("button[data-radar-action]");
  if (!actionButton) return;
  handleReleaseRadarAction(actionButton).catch((error) => {
    console.error("Erscheinungsstatus konnte nicht geändert werden:", error);
    showReleaseRadarMessage(`Erscheinungsstatus konnte nicht geändert werden: ${error.message}`, "error");
  });
}

async function handleReleaseRadarAction(button) {
  const item = getReleaseRadarItems().find((entry) => entry.key === button.dataset.radarKey);
  if (!item) return;
  const action = button.dataset.radarAction;

  if (action === "link") {
    openReleaseLinkModal(item.event);
    return;
  }
  if (action === "owned" && item.identity) {
    closeReleaseRadarPage({ returnFocus: false });
    if (!elements.calendarPage.classList.contains("hidden")) closeCalendarPage({ returnFocus: false });
    openCollectionPage("all", { series: item.identity.series, search: item.identity.bandNumber });
    return;
  }
  if (action === "add" && item.identity) {
    prepareReleaseForAdd(item);
    return;
  }
  if (action === "seen") {
    await markReleaseItemsSeen([item]);
    return;
  }
  if (["watch", "ordered"].includes(action) && item.identity) {
    await ensureReleaseOnWishlist(item.identity);
  }
  await saveReleaseRadarDecision(item, action === "reset" ? "" : action);
}

async function saveReleaseRadarDecision(item, status) {
  const decisions = normalizeReleaseDecisionMap(state.settings.releaseRadarDecisions);
  if (!status) delete decisions[item.key];
  else decisions[item.key] = { status, updatedAt: new Date().toISOString() };
  const knownSignatures = status
    ? mergeKnownReleaseSignatures(state.settings.releaseRadarKnownSignatures, [item])
    : state.settings.releaseRadarKnownSignatures;
  await saveMeaningfulSettings({
    releaseRadarDecisions: decisions,
    releaseRadarKnownSignatures: knownSignatures
  }, 1);
  renderReleaseRadarPage();
  if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
  showReleaseRadarMessage(status ? "Erscheinungsstatus gespeichert." : "Erscheinungsstatus zurückgesetzt.", "success");
}

async function markVisibleReleaseRadarItemsSeen() {
  const items = filterReleaseRadarItems(getReleaseRadarItems(), state.releaseRadarFilter).filter((item) => item.isNew);
  if (!items.length) {
    showReleaseRadarMessage("In dieser Ansicht gibt es keine neuen Termine.", "info");
    return;
  }
  await markReleaseItemsSeen(items);
}

async function markReleaseItemsSeen(items) {
  const known = mergeKnownReleaseSignatures(state.settings.releaseRadarKnownSignatures, items);
  await saveMeaningfulSettings({ releaseRadarKnownSignatures: known }, 1);
  renderReleaseRadarPage();
  if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
  showReleaseRadarMessage(`${items.length} Termin${items.length === 1 ? "" : "e"} als gesehen markiert.`, "success");
}

function openReleaseLinkModal(calendarEvent) {
  if (!calendarEvent) return;
  state.releaseLinkEventId = calendarEvent.id;
  const suggestion = suggestReleaseSeriesDetails(calendarEvent);
  const catalog = getReleaseSeriesCatalog().filter((entry) => entry.id !== "other");
  elements.releaseLinkExistingSeries.replaceChildren();
  catalog
    .slice()
    .sort((first, second) => {
      if (first.id === "ltb-main") return -1;
      if (second.id === "ltb-main") return 1;
      return first.name.localeCompare(second.name, "de", { sensitivity: "base" });
    })
    .forEach((series) => {
      const option = document.createElement("option");
      option.value = series.id;
      option.textContent = series.name;
      elements.releaseLinkExistingSeries.append(option);
    });

  const suggestedExisting = catalog.find((series) => {
    const lookup = normalizeSeriesLookup(suggestion.seriesName);
    return normalizeSeriesLookup(series.name) === lookup
      || series.aliases.some((alias) => normalizeSeriesLookup(alias) === lookup);
  });
  if (suggestedExisting) elements.releaseLinkExistingSeries.value = suggestedExisting.id;

  const shouldCreateNew = !suggestedExisting && Boolean(suggestion.seriesName);
  elements.releaseLinkModeNew.checked = shouldCreateNew;
  elements.releaseLinkModeExisting.checked = !shouldCreateNew;
  elements.releaseLinkNewName.value = suggestion.seriesName || "";
  elements.releaseLinkNewPattern.value = "";
  elements.releaseLinkAlias.value = suggestion.alias || "";
  elements.releaseLinkBand.value = suggestion.bandNumber ? String(suggestion.bandNumber) : "";
  elements.releaseLinkContext.textContent = `${calendarEvent.title} · ${formatCalendarDate(calendarEvent.startDate, { includeYear: true })}`;
  elements.releaseLinkMessage.textContent = "";
  syncReleaseLinkMode();
  elements.releaseLinkModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => {
    (shouldCreateNew ? elements.releaseLinkNewName : elements.releaseLinkExistingSeries).focus();
  }, 0);
}

function closeReleaseLinkModal() {
  elements.releaseLinkModal.classList.add("hidden");
  state.releaseLinkEventId = null;
  elements.releaseLinkMessage.textContent = "";
  restoreBodyModalState();
}

function syncReleaseLinkMode() {
  const createNew = elements.releaseLinkModeNew.checked;
  elements.releaseLinkExistingFields.classList.toggle("hidden", createNew);
  elements.releaseLinkNewFields.classList.toggle("hidden", !createNew);
  elements.releaseLinkExistingSeries.required = !createNew;
  elements.releaseLinkNewName.required = createNew;
}

async function handleReleaseLinkSubmit(event) {
  event.preventDefault();
  const calendarEvent = getCalendarEvents().find((entry) => entry.id === state.releaseLinkEventId);
  if (!calendarEvent) {
    elements.releaseLinkMessage.textContent = "Der Kalendertermin ist nicht mehr verfügbar.";
    elements.releaseLinkMessage.dataset.type = "error";
    return;
  }

  const bandNumber = Number(elements.releaseLinkBand.value);
  if (!Number.isSafeInteger(bandNumber) || bandNumber < 1 || bandNumber > 99999) {
    elements.releaseLinkMessage.textContent = "Bitte gib eine gültige Bandnummer zwischen 1 und 99999 ein.";
    elements.releaseLinkMessage.dataset.type = "error";
    return;
  }

  const alias = elements.releaseLinkAlias.value.trim().slice(0, 160);
  const signature = createReleaseEventSignature(calendarEvent);
  const existingAliases = normalizeReleaseSeriesAliases(state.settings.releaseSeriesAliases);
  const existingLinks = normalizeReleaseEventLinks(state.settings.releaseEventLinks);
  let seriesId = "";
  let seriesName = "";
  let nextConfigs = Array.isArray(state.settings.customSeriesConfigs) ? [...state.settings.customSeriesConfigs] : [];
  let definitionToSave = null;

  if (elements.releaseLinkModeNew.checked) {
    const name = elements.releaseLinkNewName.value.trim();
    const rawPattern = elements.releaseLinkNewPattern.value.trim();
    const pattern = normalizeDuckipediaPattern(rawPattern);
    if (!name || name.length > 100) {
      elements.releaseLinkMessage.textContent = "Bitte gib einen Reihennamen mit höchstens 100 Zeichen ein.";
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    if (rawPattern && !pattern) {
      elements.releaseLinkMessage.textContent = "Der Duckipedia-Pfad ist ungültig. Verwende einen Pfad oder eine URL von de.duckipedia.org.";
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    const duplicate = getReleaseSeriesCatalog().find((entry) => normalizeSeriesLookup(entry.name) === normalizeSeriesLookup(name));
    if (duplicate) {
      elements.releaseLinkMessage.textContent = `„${duplicate.name}“ gibt es bereits. Wähle bitte „Bestehender Reihe zuordnen“.`;
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    seriesId = createCustomSeriesId(name);
    seriesName = name;
    definitionToSave = {
      id: seriesId,
      name,
      duckipediaPattern: pattern,
      category: "special",
      aliases: alias ? [alias] : [],
      isArchived: false
    };
    nextConfigs = [...nextConfigs, definitionToSave];
  } else {
    seriesId = elements.releaseLinkExistingSeries.value;
    const selected = getReleaseSeriesCatalog().find((entry) => entry.id === seriesId);
    if (!selected) {
      elements.releaseLinkMessage.textContent = "Bitte wähle eine vorhandene Reihe aus.";
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    seriesName = selected.name;
    const customIndex = nextConfigs.findIndex((entry) => (entry.id || createCustomSeriesId(entry.name)) === seriesId);
    if (customIndex >= 0 && alias) {
      const current = nextConfigs[customIndex];
      const aliases = [...new Set([...(current.aliases || []), alias])];
      definitionToSave = { ...current, id: seriesId, aliases };
      nextConfigs[customIndex] = definitionToSave;
    }
  }

  const nextAliases = { ...existingAliases };
  if (alias) nextAliases[seriesId] = [...new Set([...(nextAliases[seriesId] || []), alias])];
  const nextLinks = {
    ...existingLinks,
    [signature]: { seriesId, bandNumber, updatedAt: new Date().toISOString() }
  };

  try {
    await saveMeaningfulSettings({
      customSeries: nextConfigs.map((entry) => entry.name),
      customSeriesConfigs: nextConfigs,
      releaseSeriesAliases: nextAliases,
      releaseEventLinks: nextLinks
    }, 1);
    if (definitionToSave) await saveSeriesDefinition(definitionToSave);
    populateConfiguration();
    renderCustomSeriesList();
    await refreshArchiveCoreStatus({ showReport: false });
    closeReleaseLinkModal();
    renderReleaseRadarPage();
    if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
    renderReleaseRadarIndicators();
    showReleaseRadarMessage(`${calendarEvent.title} ist jetzt mit „${seriesName}“, Band ${bandNumber}, verknüpft.`, "success");
  } catch (error) {
    elements.releaseLinkMessage.textContent = `Zuordnung konnte nicht gespeichert werden: ${error.message}`;
    elements.releaseLinkMessage.dataset.type = "error";
  }
}

async function ensureReleaseOnWishlist(identity) {
  const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };
  const currentTarget = Number(nextTargets[identity.series]) || 0;
  if (identity.bandNumber <= currentTarget) return;
  nextTargets[identity.series] = identity.bandNumber;
  await saveMeaningfulSettings({ knownHighestBandBySeries: nextTargets }, 1);
  state.missingGroups = calculateMissingBands(state.comics, nextTargets);
  renderMissingHub();
  renderMissingBands();
  renderStats();
  renderSeriesProgress();
  shelfUI?.refresh({ comics: state.comics, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
}

function prepareReleaseForAdd(item) {
  if (!item.identity) return;
  closeReleaseRadarPage({ returnFocus: false });
  if (!elements.calendarPage.classList.contains("hidden")) closeCalendarPage({ returnFocus: false });
  resetForm();
  elements.series.value = item.identity.series;
  elements.volumeNumber.value = String(item.identity.bandNumber);
  elements.publicationYear.value = item.event.startDate.slice(0, 4);
  openAddPage();
  showFormMessage(`${item.event.title} wurde vorbereitet. Prüfe nur noch Zustand und Eigenschaften.`, "success");
  window.setTimeout(() => {
    lookupFormMetadata({ force: false }).catch((error) => console.warn("Metadaten konnten nicht vorgeladen werden:", error));
  }, 0);
}

async function exportWatchedReleaseReminders() {
  const items = getReleaseRadarItems().filter((item) => ["watch", "ordered"].includes(item.effectiveStatus) && item.timing !== "past");
  if (!items.length) {
    showReleaseRadarMessage("Es gibt keine kommenden vorgemerkten oder bestellten Ausgaben.", "info");
    return;
  }

  const reminderTime = state.settings.calendarReminderTime || "09:00";
  const events = items.map((item) => ({ ...item.event, reminderEnabled: true }));
  const content = buildCalendarIcs(events, {
    calendarName: "Entenarchiv Erscheinungsradar",
    reminderTime,
    timedReleaseReminders: true
  });
  const result = await shareOrDownloadText({
    content,
    filename: createAppFilename("Entenarchiv-Erscheinungsradar", "ics"),
    mimeType: "text/calendar;charset=utf-8",
    title: "Entenarchiv Erscheinungsradar",
    text: `${items.length} vorgemerkte oder bestellte Neuerscheinungen`
  });
  if (result.method !== "cancelled") showReleaseRadarMessage("Kalenderdatei wurde erstellt. Öffne sie mit Apple Kalender, um Erinnerungen zu aktivieren.", "success");
}

function showReleaseRadarMessage(message, type = "info") {
  elements.releaseRadarMessage.textContent = message;
  elements.releaseRadarMessage.dataset.type = type;
}

async function handleReleaseRadarBadgeToggle() {
  elements.releaseRadarMessage.textContent = "";
  if (!elements.releaseRadarBadgeEnabled.checked) {
    state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: false });
    if (typeof navigator.clearAppBadge === "function") await navigator.clearAppBadge().catch(() => {});
    renderReleaseRadarBadgeStatus(getReleaseRadarBadgeCount(getReleaseRadarItems()));
    showReleaseRadarMessage("Das App-Badge wurde ausgeschaltet.", "info");
    return;
  }

  if (typeof navigator.setAppBadge !== "function") {
    elements.releaseRadarBadgeEnabled.checked = false;
    state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: false });
    showReleaseRadarMessage("Dieses Gerät unterstützt kein App-Badge für die Web-App.", "info");
    renderReleaseRadarBadgeStatus(0);
    return;
  }

  if ("Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      elements.releaseRadarBadgeEnabled.checked = false;
      state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: false });
      showReleaseRadarMessage(permission === "denied" ? "Die Berechtigung wurde abgelehnt. Du kannst sie in den iOS-Einstellungen ändern." : "Die Berechtigung wurde nicht erteilt.", "error");
      renderReleaseRadarBadgeStatus(0);
      return;
    }
  }

  state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: true });
  await updateReleaseRadarBadge(getReleaseRadarBadgeCount(getReleaseRadarItems()));
  renderReleaseRadarBadgeStatus(getReleaseRadarBadgeCount(getReleaseRadarItems()));
  showReleaseRadarMessage("Das App-Badge ist aktiviert.", "success");
}

function renderReleaseRadarBadgeStatus(count) {
  const supported = typeof navigator.setAppBadge === "function" && typeof navigator.clearAppBadge === "function";
  const permission = "Notification" in window ? Notification.permission : "unavailable";
  const enabled = state.settings.releaseRadarBadgeEnabled !== false;
  elements.releaseRadarBadgeEnabled.checked = enabled;
  elements.releaseRadarBadgeEnabled.disabled = !supported || permission === "denied";

  if (!supported) elements.releaseRadarBadgeSummary.textContent = "Auf diesem Gerät nicht verfügbar";
  else if (permission === "denied") elements.releaseRadarBadgeSummary.textContent = "In den Systemeinstellungen gesperrt";
  else if (!enabled) elements.releaseRadarBadgeSummary.textContent = "Ausgeschaltet";
  else if (permission === "granted" || permission === "unavailable") elements.releaseRadarBadgeSummary.textContent = `${count} offene Markierung${count === 1 ? "" : "en"}`;
  else elements.releaseRadarBadgeSummary.textContent = "Aktivierung benötigt einmalige Zustimmung";
}

async function updateReleaseRadarBadge(count = getReleaseRadarBadgeCount(getReleaseRadarItems())) {
  if (typeof navigator.setAppBadge !== "function" || typeof navigator.clearAppBadge !== "function") return;
  if (state.settings.releaseRadarBadgeEnabled === false) {
    await navigator.clearAppBadge().catch(() => {});
    return;
  }
  if ("Notification" in window && Notification.permission !== "granted") return;
  if (count > 0) await navigator.setAppBadge(count);
  else await navigator.clearAppBadge();
}


async function changeCalendarYear(delta) {
  const nextYear = Math.min(2100, Math.max(1900, getSafeCalendarYear() + delta));
  await setCalendarYear(nextYear);
}

async function setCalendarYear(year) {
  const normalizedYear = getSafeCalendarYear(year);
  state.settings = await saveAppSettings({ ...state.settings, calendarSelectedYear: normalizedYear });
  renderCalendarPage();
}

async function jumpCalendarToToday() {
  const today = new Date();
  state.settings = await saveAppSettings({
    ...state.settings,
    calendarSelectedYear: today.getFullYear(),
    calendarSelectedMonth: today.getMonth()
  });
  state.calendarSearch = "";
  state.calendarFilter = "all";
  elements.calendarSearch.value = "";
  elements.calendarCategoryFilter.value = "all";
  renderCalendarPage();
}

async function setCalendarMonth(month) {
  const normalizedMonth = getSafeCalendarMonth(month);
  state.settings = await saveAppSettings({ ...state.settings, calendarSelectedMonth: normalizedMonth });
  renderCalendarPage();
}

function handleCalendarMonthTabClick(event) {
  const button = event.target.closest("button[data-calendar-month]");
  if (!button) return;
  setCalendarMonth(Number(button.dataset.calendarMonth));
}

function handleCalendarDayClick(event) {
  const button = event.target.closest("button[data-calendar-date]");
  if (!button) return;
  const card = [...elements.calendarEventList.querySelectorAll("[data-calendar-event-id]")].find((entry) => {
    const calendarEvent = getCalendarEvents().find((item) => item.id === entry.dataset.calendarEventId);
    return calendarEvent?.startDate === button.dataset.calendarDate;
  });
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleCalendarEventListClick(event) {
  const releaseLinkAction = event.target.closest("button[data-calendar-release-link]");
  if (releaseLinkAction) {
    const calendarEvent = getCalendarEvents().find((item) => item.id === releaseLinkAction.dataset.calendarReleaseLink);
    if (calendarEvent) openReleaseLinkModal(calendarEvent);
    return;
  }
  const collectionAction = event.target.closest("button[data-calendar-collection-action]");
  if (collectionAction) {
    handleCalendarCollectionAction(collectionAction).catch((error) => {
      console.error("Kalenderverknüpfung fehlgeschlagen:", error);
      showToast(`Kalenderverknüpfung fehlgeschlagen: ${error.message}`, "error");
    });
    return;
  }
  const edit = event.target.closest("button[data-calendar-edit]");
  if (!edit) return;
  const calendarEvent = getCalendarEvents().find((item) => item.id === edit.dataset.calendarEdit);
  if (calendarEvent) openCalendarEventModal(calendarEvent);
}

async function refreshCalendarCatalog({ silent = false, autoImport = false } = {}) {
  if (state.calendarCatalogLoading) return;
  state.calendarCatalogLoading = true;
  renderCalendarCatalog();
  if (!silent) showCalendarImportMessage("Verfügbare Jahrespläne werden geprüft …", "info");

  try {
    const response = await fetch(CALENDAR_CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = normalizeCalendarCatalog(await response.json());
    state.calendarCatalog = catalog.calendars;
    state.calendarCatalogUpdatedAt = catalog.updatedAt;
    state.settings = await saveAppSettings({
      ...state.settings,
      calendarCatalogLastCheckAt: new Date().toISOString()
    });

    let imported = 0;
    if (autoImport && state.settings.calendarAutoSync !== false) {
      const currentYear = new Date().getFullYear();
      const automaticEntries = state.calendarCatalog.filter((entry) => entry.active && [currentYear, currentYear + 1].includes(entry.year));
      for (const entry of automaticEntries) {
        if (calendarCatalogEntryNeedsImport(entry)) {
          await importCalendarCatalogEntry(entry, { silent: true, selectYear: false });
          imported += 1;
        }
      }
    }

    if (!silent) {
      const suffix = imported ? ` ${imported} Jahresplan${imported === 1 ? " wurde" : "e wurden"} aktualisiert.` : " Alles ist aktuell.";
      showCalendarImportMessage(`${state.calendarCatalog.length} verfügbare Jahr${state.calendarCatalog.length === 1 ? "" : "e"} gefunden.${suffix}`, "success");
    }
  } catch (error) {
    console.error("Kalenderindex konnte nicht geladen werden:", error);
    if (!silent) showCalendarImportMessage("Der Kalenderindex konnte gerade nicht geladen werden. Bereits importierte Termine bleiben verfügbar.", "error");
  } finally {
    state.calendarCatalogLoading = false;
    renderCalendarPage();
  }
}

function calendarCatalogEntryNeedsImport(entry) {
  const record = getCalendarImportedSources()[String(entry.year)];
  const publisherEvents = getEventsForYear(getCalendarEvents(), entry.year).filter((event) => event.source === "publisher");
  if (!record || publisherEvents.length === 0) return true;
  return `${record.id}|${record.version}|${record.file}` !== createCalendarCatalogSignature(entry);
}

async function importCalendarCatalogEntry(entry, { silent = false, selectYear = true } = {}) {
  if (!entry || state.calendarImporting) return 0;
  state.calendarImporting = true;
  renderCalendarCatalog();
  if (!silent) showCalendarImportMessage(`${entry.label} wird geladen …`, "info");

  try {
    const response = await fetch(entry.file, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const importedEvents = parseIcsCalendar(text, {
      sourceUrl: entry.sourceUrl,
      sourceName: entry.label,
      sourceId: entry.id,
      sourceVersion: entry.version
    }).filter((event) => Number(event.startDate.slice(0, 4)) === entry.year);
    if (!importedEvents.length) throw new Error(`Die Datei enthält keine Termine für ${entry.year}.`);

    const mergedEvents = mergePublisherCalendarEvents(getCalendarEvents(), importedEvents);
    const importedSources = getCalendarImportedSources();
    importedSources[String(entry.year)] = {
      id: entry.id,
      label: entry.label,
      version: entry.version,
      file: entry.file,
      sourceUrl: entry.sourceUrl,
      importedAt: new Date().toISOString(),
      eventCount: importedEvents.length
    };

    const patch = {
      calendarEvents: mergedEvents,
      calendarImportedSources: importedSources,
      calendarSourceUrl: entry.sourceUrl || state.settings.calendarSourceUrl,
      calendarSourceName: entry.label,
      calendarLastImportAt: new Date().toISOString()
    };
    if (selectYear) patch.calendarSelectedYear = entry.year;
    state.settings = await saveMeaningfulSettings(patch, 1);
    await initializeReleaseRadarIfNeeded();
    renderCalendarOverview();
    renderCalendarPage();
    if (!silent) showCalendarImportMessage(`${importedEvents.length} Termine aus ${entry.label} wurden geladen.`, "success");
    return importedEvents.length;
  } catch (error) {
    console.error(`${entry.label} konnte nicht geladen werden:`, error);
    if (!silent) showCalendarImportMessage(`Jahresplan konnte nicht geladen werden: ${error.message}`, "error");
    return 0;
  } finally {
    state.calendarImporting = false;
    renderCalendarCatalog();
  }
}

async function handleCalendarCatalogClick(event) {
  const importButton = event.target.closest("button[data-calendar-catalog-import]");
  if (importButton) {
    const year = Number(importButton.dataset.calendarCatalogImport);
    const entry = state.calendarCatalog.find((item) => item.year === year);
    if (entry) await importCalendarCatalogEntry(entry, { silent: false, selectYear: true });
    return;
  }

  const removeButton = event.target.closest("button[data-calendar-catalog-remove]");
  if (!removeButton) return;
  const year = Number(removeButton.dataset.calendarCatalogRemove);
  if (!window.confirm(`Alle importierten Verlagstermine für ${year} entfernen? Eigene Termine bleiben erhalten.`)) return;
  const importedSources = getCalendarImportedSources();
  delete importedSources[String(year)];
  state.settings = await saveMeaningfulSettings({
    calendarEvents: removePublisherCalendarYear(getCalendarEvents(), year),
    calendarImportedSources: importedSources
  }, 1);
  renderCalendarOverview();
  renderCalendarPage();
  showCalendarImportMessage(`Verlagstermine für ${year} wurden entfernt.`, "success");
}

async function handleCalendarAutoSyncChange() {
  state.settings = await saveAppSettings({
    ...state.settings,
    calendarAutoSync: elements.calendarAutoSync.checked
  });
  if (elements.calendarAutoSync.checked) {
    await refreshCalendarCatalog({ silent: false, autoImport: true });
  } else {
    showCalendarImportMessage("Automatische Aktualisierung ist deaktiviert. Jahrespläne können weiterhin manuell geladen werden.", "info");
  }
}

async function handleCalendarFileImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await importCalendarText(text, {
      sourceUrl: "",
      sourceName: file.name.replace(/\.ics$/i, "") || "Importierter Jahresplan",
      sourceId: `manual-${file.name.toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      sourceVersion: `datei-${file.lastModified || Date.now()}`
    });
    showCalendarImportMessage("iCal-Datei wurde erfolgreich importiert.", "success");
  } catch (error) {
    showCalendarImportMessage(`Import fehlgeschlagen: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
}

async function importCalendarText(text, source = {}) {
  const importedEvents = parseIcsCalendar(text, source);
  const mergedEvents = mergePublisherCalendarEvents(getCalendarEvents(), importedEvents);
  const importedYears = [...new Set(importedEvents.map((event) => Number(event.startDate.slice(0, 4))))].filter(Number.isFinite);
  const importedSources = getCalendarImportedSources();
  const now = new Date().toISOString();
  importedYears.forEach((year) => {
    const yearEvents = importedEvents.filter((event) => Number(event.startDate.slice(0, 4)) === year);
    importedSources[String(year)] = {
      id: source.sourceId || `manual-${year}`,
      label: source.sourceName || `Importierter Jahresplan ${year}`,
      version: source.sourceVersion || "manuell",
      file: "",
      sourceUrl: source.sourceUrl || "",
      importedAt: now,
      eventCount: yearEvents.length
    };
  });
  const preferredYear = importedYears.includes(new Date().getFullYear())
    ? new Date().getFullYear()
    : importedYears[0] || getSafeCalendarYear();
  state.settings = await saveMeaningfulSettings({
    calendarEvents: mergedEvents,
    calendarImportedSources: importedSources,
    calendarSourceUrl: source.sourceUrl || state.settings.calendarSourceUrl,
    calendarSourceName: source.sourceName || "Importierter Jahresplan",
    calendarLastImportAt: now,
    calendarSelectedYear: preferredYear
  }, 1);
  await initializeReleaseRadarIfNeeded();
  renderCalendarOverview();
  renderCalendarPage();
}

function showCalendarImportMessage(message, type = "info") {
  elements.calendarImportMessage.textContent = message;
  elements.calendarImportMessage.dataset.type = type;
}

function openCalendarEventModal(calendarEvent = null) {
  const event = calendarEvent ? normalizeCalendarEvent(calendarEvent) : null;
  state.selectedCalendarEventId = event?.id || null;
  elements.calendarEventModalTitle.textContent = event ? "Termin bearbeiten" : "Termin hinzufügen";
  elements.calendarEventId.value = event?.id || "";
  elements.calendarEventName.value = event?.title || "";
  elements.calendarEventDate.value = event?.startDate || `${getSafeCalendarYear()}-${String(getSafeCalendarMonth() + 1).padStart(2, "0")}-01`;
  elements.calendarEventCategory.value = event?.category && event.category !== "release" ? event.category : "flea-market";
  elements.calendarEventAllDay.checked = event ? event.allDay !== false : true;
  elements.calendarEventTime.value = event?.startTime || "10:00";
  elements.calendarEventLocation.value = event?.location || "";
  elements.calendarEventUrl.value = event?.url || "";
  elements.calendarEventNotes.value = event?.notes || "";
  elements.calendarEventReminder.checked = event ? event.reminderEnabled !== false : true;
  elements.calendarEventDelete.classList.toggle("hidden", !event);
  elements.calendarEventMessage.textContent = "";
  syncCalendarEventTimeVisibility();
  elements.calendarEventModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.calendarEventName.focus({ preventScroll: true }), 0);
}

function closeCalendarEventModal() {
  elements.calendarEventModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  state.selectedCalendarEventId = null;
}

function syncCalendarEventTimeVisibility() {
  elements.calendarEventTimeField.classList.toggle("hidden", elements.calendarEventAllDay.checked);
}

async function handleCalendarEventSubmit(event) {
  event.preventDefault();
  const title = elements.calendarEventName.value.trim();
  const startDate = elements.calendarEventDate.value;
  if (!title || !startDate) {
    elements.calendarEventMessage.textContent = "Bitte gib Titel und Datum an.";
    elements.calendarEventMessage.dataset.type = "error";
    return;
  }

  const existing = getCalendarEvents().find((item) => item.id === state.selectedCalendarEventId);
  const now = new Date().toISOString();
  const calendarEvent = normalizeCalendarEvent({
    id: existing?.id || createCalendarEventId("custom"),
    uid: existing?.uid || "",
    title,
    startDate,
    endDate: startDate,
    allDay: elements.calendarEventAllDay.checked,
    startTime: elements.calendarEventAllDay.checked ? "" : elements.calendarEventTime.value,
    endTime: "",
    location: elements.calendarEventLocation.value,
    notes: elements.calendarEventNotes.value,
    url: elements.calendarEventUrl.value,
    source: "custom",
    sourceName: "Eigener Termin",
    category: elements.calendarEventCategory.value,
    reminderEnabled: elements.calendarEventReminder.checked,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });
  if (!calendarEvent) return;

  const nextEvents = getCalendarEvents().filter((item) => item.id !== calendarEvent.id);
  nextEvents.push(calendarEvent);
  state.settings = await saveMeaningfulSettings({
    calendarEvents: nextEvents,
    calendarSelectedYear: Number(startDate.slice(0, 4)),
    calendarSelectedMonth: Number(startDate.slice(5, 7)) - 1
  }, 1);
  closeCalendarEventModal();
  renderCalendarOverview();
  renderCalendarPage();
  showToast(existing ? "Termin aktualisiert." : "Termin gespeichert.");
}

async function deleteSelectedCalendarEvent() {
  const calendarEvent = getCalendarEvents().find((item) => item.id === state.selectedCalendarEventId);
  if (!calendarEvent || calendarEvent.source !== "custom") return;
  if (!window.confirm(`„${calendarEvent.title}“ wirklich löschen?`)) return;
  state.settings = await saveMeaningfulSettings({
    calendarEvents: getCalendarEvents().filter((item) => item.id !== calendarEvent.id)
  }, 1);
  closeCalendarEventModal();
  renderCalendarOverview();
  renderCalendarPage();
  showToast("Termin gelöscht.");
}

async function handleCalendarReminderTimeChange() {
  state.settings = await saveAppSettings({ ...state.settings, calendarReminderTime: elements.calendarReminderTime.value || "09:00" });
}

async function exportCalendarWithReminders() {
  const year = getSafeCalendarYear();
  const events = getEventsForYear(getCalendarEvents(), year);
  if (!events.length) {
    showCalendarImportMessage("Für dieses Jahr sind noch keine Termine vorhanden.", "error");
    return;
  }
  const reminderTime = elements.calendarReminderTime.value || state.settings.calendarReminderTime || "09:00";
  await handleCalendarReminderTimeChange();
  const content = buildCalendarIcs(events, {
    calendarName: `Entenarchiv ${year}`,
    reminderTime,
    timedReleaseReminders: true
  });
  const result = await shareOrDownloadText({
    content,
    filename: `Entenarchiv-Kalender-${year}.ics`,
    mimeType: "text/calendar;charset=utf-8",
    title: `Entenarchiv-Kalender ${year}`,
    text: `Neuerscheinungen und eigene Termine für ${year}`
  });
  if (result.method !== "cancelled") {
    showToast("Kalenderdatei erstellt. Öffne sie mit Apple Kalender, um die Erinnerungen zu aktivieren.");
  }
}
