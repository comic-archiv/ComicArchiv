import {
  APP_CONFIG,
  DEFAULT_CONDITION_CODE,
  createDuckipediaSearchUrl,
  createMetadataCacheKey,
  createMissingDetailKey,
  normalizeConditionCode,
  normalizeDuckipediaPattern
} from "./config.js";
import { blobToDataUrl } from "./media.js";
import { normalizeMilestoneIds, normalizeWishlistPriority, getWishlistPriorityDefinition, compareWishlistEntries } from "./collector-goals.js";
import {
  buildSeriesCatalog,
  createCustomSeriesId,
  createIssueIdentityKey,
  createSeriesDefinition,
  getComicCopies,
  materializeLegacyComics,
  mergeCopyLists,
  migrateLegacyComicsToArchive,
  normalizeCopy,
  normalizeCopyRecord,
  normalizeIssueRecord,
  normalizeSeriesLookup,
  validateArchiveGraph
} from "./archive-model.js";
import { getEntryCopies, getEntryPublicationYear, getEntrySeriesName, getEntryTitle, getEntryVolumeNumber, getEntryDuckipediaPageUrl, toLegacyComic, toLegacyComics } from "./archive-entry.js";
import { normalizeCalendarEvent } from "./calendar.js";
import {
  RELEASE_RADAR_FILTERS,
  normalizeKnownReleaseSignatures,
  normalizeReleaseDecisionMap,
  normalizeReleaseEventLinks,
  normalizeReleaseSeriesAliases
} from "./release-radar.js";

const CSV_SEPARATOR = ";";
const UTF8_BOM = "\uFEFF";
const MAX_IMPORT_SIZE_BYTES = 250 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 10000;

export class BackupValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "BackupValidationError";
    this.issues = issues;
  }
}

export function createCollectionCsv(comics, settings = {}) {
  const rows = [[
    "Reihe",
    "Bandnummer",
    "Titel",
    "Erscheinungsjahr",
    "Exemplar",
    "Zustand",
    "Gelesen",
    "Foliert",
    "Exemplar-Notiz",
    "Duckipedia"
  ]];

  (Array.isArray(comics) ? comics : []).forEach((comic) => {
    const copies = getEntryCopies(comic);
    copies.forEach((copy, index) => {
      rows.push([
        getEntrySeriesName(comic),
        getEntryVolumeNumber(comic),
        getEntryTitle(comic) || "",
        getEntryPublicationYear(comic) ?? "",
        index + 1,
        copy.condition,
        copy.isRead ? "Ja" : "Nein",
        copy.isSealed ? "Ja" : "Nein",
        copy.notes || "",
        getEntryDuckipediaPageUrl(comic) || createDuckipediaSearchUrl(getEntrySeriesName(comic), getEntryVolumeNumber(comic), getEntryTitle(comic) || "", settings)
      ]);
    });
  });

  return UTF8_BOM + rows.map(createCsvRow).join("\r\n");
}

export function createMissingCsv(missingGroups, settings = {}) {
  const rows = [[
    "Reihe",
    "Fehlender Band",
    "Titel / Name",
    "Erscheinungsjahr",
    "Priorität",
    "Wunschzustand",
    "Notizen",
    "Duckipedia"
  ]];
  const detailMap = settings.missingBandDetails || {};

  missingGroups.forEach((group) => {
    group.missingBands.forEach((bandNumber) => {
      const detail = detailMap[createMissingDetailKey(group.series, bandNumber)] || {};
      rows.push([
        group.series,
        bandNumber,
        detail.title || "",
        detail.publicationYear ?? "",
        getWishlistPriorityDefinition(detail.priority)?.label || "",
        detail.desiredCondition || "",
        detail.notes || "",
        detail.duckipediaUrl || createDuckipediaSearchUrl(group.series, bandNumber, detail.title || "", settings)
      ]);
    });
  });

  return UTF8_BOM + rows.map(createCsvRow).join("\r\n");
}


export function createMissingPdfBlob(missingGroups, settings = {}) {
  const JsPdf = globalThis.jspdf?.jsPDF;

  if (typeof JsPdf !== "function") {
    throw new Error("Das lokale PDF-Modul konnte nicht geladen werden. Bitte lade die App neu und versuche es erneut.");
  }

  const groups = (Array.isArray(missingGroups) ? missingGroups : [])
    .filter((group) => Array.isArray(group?.missingBands) && group.missingBands.length > 0)
    .map((group) => ({ ...group, missingBands: [...group.missingBands].sort((a, b) => a - b) }))
    .sort((first, second) => {
      const mainSeries = "Lustiges Taschenbuch";
      if (first.series === mainSeries && second.series !== mainSeries) return -1;
      if (second.series === mainSeries && first.series !== mainSeries) return 1;
      return String(first.series).localeCompare(String(second.series), "de", { sensitivity: "base" });
    });

  const totalMissing = groups.reduce((sum, group) => sum + group.missingBands.length, 0);
  if (totalMissing === 0) {
    throw new Error("Aktuell wurden keine fehlenden Bände erkannt.");
  }

  // Two dense list columns in landscape format minimize the page count while
  // keeping the information needed at a flea market easy to scan.
  const doc = new JsPdf({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 7;
  const contentWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 4.5;
  const details = settings.missingBandDetails || {};
  const exportedAt = new Date();
  let pageNumber = 1;
  let cursorY = 0;
  let currentGroup = null;
  let rowStripe = 0;

  const gutter = 4;
  const listWidth = (contentWidth - gutter) / 2;
  const columns = Object.freeze({
    check: 6.5,
    priority: 8,
    band: 13,
    year: 12,
    title: listWidth - 6.5 - 8 - 13 - 12
  });

  const colors = {
    navy: [11, 16, 32],
    navySoft: [25, 43, 73],
    primary: [0, 94, 168],
    accent: [239, 180, 35],
    text: [29, 39, 54],
    muted: [91, 105, 123],
    border: [207, 216, 226],
    stripe: [247, 249, 252],
    white: [255, 255, 255]
  };

  const formatDate = (date) => new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);

  const setTextColor = (color) => doc.setTextColor(...color);
  const setFillColor = (color) => doc.setFillColor(...color);
  const setDrawColor = (color) => doc.setDrawColor(...color);

  function drawPageHeader() {
    setFillColor(colors.navy);
    doc.rect(0, 0, pageWidth, 14.5, "F");

    setFillColor(colors.accent);
    doc.roundedRect(margin, 3.6, 29, 5.8, 1.3, 1.3, "F");
    setTextColor(colors.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.text("ENTENARCHIV", margin + 14.5, 7.6, { align: "center" });

    setTextColor(colors.white);
    doc.setFontSize(13.2);
    doc.text("Flohmarkt-Suchliste", margin + 34, 7.9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.text(
      `${totalMissing} fehlende Bände | ${groups.length} Reihen | Stand ${formatDate(exportedAt)}`,
      pageWidth - margin,
      7.6,
      { align: "right" }
    );

    cursorY = 18.2;
  }

  function drawPageFooter() {
    setDrawColor(colors.border);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 2.1, pageWidth - margin, footerY - 2.1);
    setTextColor(colors.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text("Entenarchiv - kompakte private Suchliste", margin, footerY + 0.2);
    doc.text(`Seite ${pageNumber}`, pageWidth - margin, footerY + 0.2, { align: "right" });
  }

  function drawSeriesHeading(group, continued = false) {
    const label = continued ? `${group.series} (Fortsetzung)` : String(group.series);
    setFillColor(colors.navySoft);
    doc.rect(margin, cursorY, contentWidth, 5.6, "F");
    setFillColor(colors.accent);
    doc.rect(margin, cursorY, 2.2, 5.6, "F");
    setTextColor(colors.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label, margin + 4.5, cursorY + 3.9);
    doc.setFontSize(6.2);
    doc.text(`${group.missingBands.length} fehlen`, pageWidth - margin - 2.5, cursorY + 3.85, { align: "right" });
    cursorY += 5.6;
    drawListHeaders();
  }

  function drawSingleListHeader(startX) {
    const height = 4.8;
    setFillColor([231, 237, 244]);
    doc.rect(startX, cursorY, listWidth, height, "F");
    setTextColor(colors.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.1);

    let x = startX;
    doc.text("OK", x + columns.check / 2, cursorY + 3.3, { align: "center" });
    x += columns.check;
    doc.text("Prio", x + columns.priority / 2, cursorY + 3.3, { align: "center" });
    x += columns.priority;
    doc.text("Band", x + 1.2, cursorY + 3.3);
    x += columns.band;
    doc.text("Titel / Name", x + 1.2, cursorY + 3.3);
    x += columns.title;
    doc.text("Jahr", x + columns.year / 2, cursorY + 3.3, { align: "center" });
  }

  function drawListHeaders() {
    drawSingleListHeader(margin);
    drawSingleListHeader(margin + listWidth + gutter);
    setDrawColor(colors.border);
    doc.setLineWidth(0.18);
    doc.line(margin, cursorY + 4.8, pageWidth - margin, cursorY + 4.8);
    cursorY += 4.8;
  }

  function addPage(group = currentGroup) {
    drawPageFooter();
    doc.addPage();
    pageNumber += 1;
    drawPageHeader();
    rowStripe = 0;
    if (group) drawSeriesHeading(group, true);
  }

  function getEntryData(group, bandNumber) {
    if (bandNumber == null) return null;
    const detail = details[createMissingDetailKey(group.series, bandNumber)] || {};
    const title = String(detail.title || "").trim();

    return {
      series: String(group.series || ""),
      bandNumber,
      title,
      year: detail.publicationYear ? String(detail.publicationYear) : "",
      priority: normalizeWishlistPriority(detail.priority),
      url: detail.duckipediaUrl || createDuckipediaSearchUrl(group.series, bandNumber, title, settings)
    };
  }

  function measureEntry(data) {
    if (!data) return null;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.1);
    const titleLines = data.title ? doc.splitTextToSize(data.title, columns.title - 2.6) : [];
    return { ...data, titleLines };
  }

  function measurePair(left, right) {
    const leftLines = Math.max(1, left?.titleLines?.length || 0);
    const rightLines = Math.max(1, right?.titleLines?.length || 0);
    const lineCount = Math.max(leftLines, rightLines);
    return Math.max(4.25, 1.25 + lineCount * 2.05);
  }

  function drawVerticalSeparators(startX, y, height) {
    setDrawColor([224, 230, 237]);
    doc.setLineWidth(0.12);
    let x = startX;
    [columns.check, columns.priority, columns.band, columns.title].forEach((width) => {
      x += width;
      doc.line(x, y, x, y + height);
    });
  }

  function drawEntry(data, startX, y, height) {
    drawVerticalSeparators(startX, y, height);
    if (!data) return;

    const centerY = y + height / 2;
    let x = startX;

    setDrawColor(colors.primary);
    doc.setLineWidth(0.32);
    doc.rect(x + 2, centerY - 1.2, 2.4, 2.4, "S");
    x += columns.check;

    const priority = getWishlistPriorityDefinition(data.priority);
    if (priority) {
      setTextColor(data.priority === "wanted" ? colors.primary : data.priority === "ignore" ? colors.muted : colors.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.1);
      doc.text(priority.symbol, x + columns.priority / 2, centerY + 1, { align: "center" });
    } else {
      setTextColor(colors.muted);
      doc.setFont("helvetica", "normal");
      doc.text("-", x + columns.priority / 2, centerY + 1, { align: "center" });
    }
    x += columns.priority;

    setTextColor(colors.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.1);
    if (data.url) {
      doc.textWithLink(String(data.bandNumber), x + 1.2, centerY + 1, { url: data.url });
    } else {
      doc.text(String(data.bandNumber), x + 1.2, centerY + 1);
    }
    x += columns.band;

    const titleLines = data.titleLines.length ? data.titleLines : ["-"];
    setTextColor(data.title ? colors.text : colors.muted);
    doc.setFont("helvetica", data.title ? "normal" : "italic");
    doc.setFontSize(6.1);
    doc.text(titleLines, x + 1.2, centerY - ((titleLines.length - 1) * 2.05) / 2 + 0.75);
    x += columns.title;

    setTextColor(data.year ? colors.text : colors.muted);
    doc.setFont("helvetica", "normal");
    doc.text(data.year || "-", x + columns.year / 2, centerY + 0.95, { align: "center" });
  }

  function drawPair(left, right) {
    const height = measurePair(left, right);
    if (cursorY + height > footerY - 3.1) addPage(currentGroup);

    const y = cursorY;
    if (rowStripe % 2 === 1) {
      setFillColor(colors.stripe);
      doc.rect(margin, y, contentWidth, height, "F");
    }

    setDrawColor(colors.border);
    doc.setLineWidth(0.16);
    doc.line(margin, y + height, pageWidth - margin, y + height);
    doc.line(margin + listWidth + gutter / 2, y, margin + listWidth + gutter / 2, y + height);

    drawEntry(left, margin, y, height);
    drawEntry(right, margin + listWidth + gutter, y, height);

    cursorY += height;
    rowStripe += 1;
  }

  drawPageHeader();

  groups.forEach((group) => {
    currentGroup = group;
    rowStripe = 0;

    const entries = group.missingBands
      .map((bandNumber) => getEntryData(group, bandNumber))
      .sort(compareWishlistEntries)
      .map((entry) => measureEntry(entry));
    const firstPairHeight = measurePair(entries[0], entries[1] || null);

    // Keep the heading, column labels and first pair together.
    if (cursorY + 10.4 + firstPairHeight > footerY - 3.1) addPage(null);
    drawSeriesHeading(group);

    for (let index = 0; index < entries.length; index += 2) {
      drawPair(entries[index], entries[index + 1] || null);
    }

    cursorY += 1.3;
  });

  drawPageFooter();
  return doc.output("blob");
}

export function createJsonBackup(comics, settings, metadataCache = []) {
  return JSON.stringify(createBackupObject({
    backupType: "data",
    comics,
    settings,
    metadataCache,
    covers: null
  }), null, 2);
}

export async function createMediaBackup(comics, settings, metadataCache = [], coverRecords = []) {
  const covers = [];

  for (const record of coverRecords) {
    if (!record?.comicId || !(record.blob instanceof Blob)) continue;
    covers.push({
      comicId: String(record.comicId),
      mimeType: String(record.mimeType || record.blob.type || "image/jpeg"),
      size: Number(record.size || record.blob.size || 0),
      width: Number(record.width || 0),
      height: Number(record.height || 0),
      updatedAt: isValidDateString(record.updatedAt) ? record.updatedAt : new Date().toISOString(),
      dataUrl: await blobToDataUrl(record.blob)
    });
  }

  return JSON.stringify(createBackupObject({
    backupType: "media",
    comics,
    settings,
    metadataCache,
    covers
  }), null, 2);
}

function createBackupObject({ backupType, comics, settings, metadataCache, covers }) {
  const safeComics = toLegacyComics(Array.isArray(comics) ? comics : []);
  const safeSettings = serializeSettings(settings);
  const catalog = buildSeriesCatalog({ legacyComics: safeComics, settings: safeSettings });
  const archiveCore = migrateLegacyComicsToArchive(safeComics, catalog.series, {
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  });
  const archiveValidation = validateArchiveGraph(archiveCore);

  if (archiveCore.report.skippedCount > 0 || !archiveValidation.valid) {
    const reason = archiveCore.report.warnings?.[0] || archiveValidation.problems?.[0] || "Unbekannter Validierungsfehler";
    throw new Error(`Das Backup wurde vorsorglich nicht erstellt: ${reason}`);
  }

  const backup = {
    app: APP_CONFIG.storageName,
    appVersion: APP_CONFIG.appVersion,
    backupType,
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    archiveModelVersion: APP_CONFIG.archiveModelVersion,
    mediaFormatVersion: backupType === "media" ? 1 : null,
    exportedAt: new Date().toISOString(),
    sourceOrigin: typeof window !== "undefined" ? window.location.origin : "",
    // Die kompatible Projektion bleibt enthalten, damit ältere Entenarchiv-Versionen
    // und normale JSON-Werkzeuge die Sammlung weiterhin lesen können.
    comics: safeComics,
    archiveCore: {
      modelVersion: APP_CONFIG.archiveModelVersion,
      series: archiveCore.series,
      issues: archiveCore.issues,
      copies: archiveCore.copies,
      report: archiveCore.report
    },
    settings: safeSettings,
    metadataCache: Array.isArray(metadataCache) ? metadataCache : [],
    seriesConfiguration: {
      defaultSeries: [...APP_CONFIG.series],
      customSeries: safeSettings.customSeries,
      customSeriesConfigs: safeSettings.customSeriesConfigs,
      knownHighestBandBySeries: safeSettings.knownHighestBandBySeries,
      missingBandDetails: safeSettings.missingBandDetails
    }
  };

  if (backupType === "media") {
    backup.covers = covers || [];
  }

  return backup;
}

function serializeSettings(settings = {}) {
  return {
    theme: settings.theme === "light" ? "light" : "dark",
    lastBackupAt: settings.lastBackupAt || null,
    lastMediaBackupAt: settings.lastMediaBackupAt || null,
    customSeries: Array.isArray(settings.customSeries) ? settings.customSeries : [],
    customSeriesConfigs: Array.isArray(settings.customSeriesConfigs) ? settings.customSeriesConfigs : [],
    knownHighestBandBySeries: settings.knownHighestBandBySeries || {},
    missingBandDetails: settings.missingBandDetails || {},
    fleaMarketSession: settings.fleaMarketSession || { items: {}, updatedAt: null },
    changesSinceBackup: Number.isSafeInteger(settings.changesSinceBackup) ? settings.changesSinceBackup : 0,
    mediaChangesSinceBackup: Number.isSafeInteger(settings.mediaChangesSinceBackup) ? settings.mediaChangesSinceBackup : 0,
    lastBackupComicCount: Number.isSafeInteger(settings.lastBackupComicCount) ? settings.lastBackupComicCount : 0,
    showCovers: settings.showCovers !== false,
    duckipediaAutoEnrich: settings.duckipediaAutoEnrich !== false,
    calendarEvents: Array.isArray(settings.calendarEvents) ? settings.calendarEvents : [],
    calendarSourceUrl: settings.calendarSourceUrl || "",
    calendarSourceName: settings.calendarSourceName || "LTB Jahresplan",
    calendarLastImportAt: settings.calendarLastImportAt || null,
    calendarImportedSources: settings.calendarImportedSources && typeof settings.calendarImportedSources === "object" ? settings.calendarImportedSources : {},
    calendarCatalogLastCheckAt: settings.calendarCatalogLastCheckAt || null,
    calendarAutoSync: settings.calendarAutoSync !== false,
    calendarSelectedYear: Number(settings.calendarSelectedYear) || new Date().getFullYear(),
    calendarSelectedMonth: Number.isInteger(Number(settings.calendarSelectedMonth)) ? Number(settings.calendarSelectedMonth) : new Date().getMonth(),
    calendarReminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings.calendarReminderTime || "")) ? settings.calendarReminderTime : "09:00",
    releaseRadarDecisions: settings.releaseRadarDecisions || {},
    releaseRadarKnownSignatures: Array.isArray(settings.releaseRadarKnownSignatures) ? settings.releaseRadarKnownSignatures : [],
    releaseRadarInitializedAt: settings.releaseRadarInitializedAt || null,
    releaseRadarLastOpenedAt: settings.releaseRadarLastOpenedAt || null,
    releaseRadarFilter: settings.releaseRadarFilter || "open",
    releaseRadarBadgeEnabled: settings.releaseRadarBadgeEnabled !== false,
    releaseSeriesAliases: settings.releaseSeriesAliases || {},
    releaseEventLinks: settings.releaseEventLinks || {},
    milestoneSeenIds: normalizeMilestoneIds(settings.milestoneSeenIds),
    milestonesInitializedAt: isValidDateString(settings.milestonesInitializedAt) ? settings.milestonesInitializedAt : null,
    archiveMigrationAcknowledgedAt: isValidDateString(settings.archiveMigrationAcknowledgedAt) ? settings.archiveMigrationAcknowledgedAt : null
  };
}

export async function readAndValidateBackupFile(file) {
  if (!file || typeof file.text !== "function") {
    throw new BackupValidationError("Bitte wähle eine JSON-Datei aus.");
  }

  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    throw new BackupValidationError("Die Datei ist größer als 250 MB und wird aus Sicherheitsgründen nicht importiert.");
  }

  const text = await file.text();
  return parseAndValidateBackup(text);
}

export function parseAndValidateBackup(text) {
  let parsedBackup;

  try {
    parsedBackup = JSON.parse(text);
  } catch (error) {
    throw new BackupValidationError("Die Datei enthält kein gültiges JSON.");
  }

  if (!isPlainObject(parsedBackup)) {
    throw new BackupValidationError("Das Backup muss ein JSON-Objekt sein.");
  }

  const issues = [];
  const version = Number(parsedBackup.dataFormatVersion);
  const backupType = parsedBackup.backupType === "media" ? "media" : "data";
  const hasArchiveCore = isPlainObject(parsedBackup.archiveCore);
  const archiveModelVersion = Number(
    parsedBackup.archiveCore?.modelVersion ?? parsedBackup.archiveModelVersion ?? 0
  );

  if (!Number.isInteger(version)) {
    issues.push("Die Versionsnummer des Datenformats fehlt oder ist ungültig.");
  } else if (version < APP_CONFIG.minimumSupportedBackupVersion) {
    issues.push(`Datenformat-Version ${version} ist zu alt.`);
  } else if (version > APP_CONFIG.dataFormatVersion) {
    issues.push(`Datenformat-Version ${version} ist neuer als diese App-Version unterstützt. Bitte aktualisiere zuerst Entenarchiv.`);
  }

  if (hasArchiveCore) {
    if (!Number.isInteger(archiveModelVersion) || archiveModelVersion < 1) {
      issues.push("Die Versionsnummer des Archivmodells fehlt oder ist ungültig.");
    } else if (archiveModelVersion > APP_CONFIG.archiveModelVersion) {
      issues.push(`Archivmodell-Version ${archiveModelVersion} ist neuer als diese App unterstützt. Bitte aktualisiere zuerst Entenarchiv.`);
    }
    if (!Array.isArray(parsedBackup.archiveCore.series)) issues.push("Der Reihenkatalog des Archivkerns fehlt.");
    if (!Array.isArray(parsedBackup.archiveCore.issues)) issues.push("Die Ausgabenliste des Archivkerns fehlt.");
    if (!Array.isArray(parsedBackup.archiveCore.copies)) issues.push("Die Exemplarliste des Archivkerns fehlt.");
  } else if (!Array.isArray(parsedBackup.comics)) {
    issues.push("Das Feld „comics“ fehlt oder ist keine Liste.");
  }

  if (backupType === "media" && !Array.isArray(parsedBackup.covers)) {
    issues.push("Das Medien-Backup enthält keine gültige Cover-Liste.");
  }

  if (issues.length > 0) {
    throw new BackupValidationError("Das Backup ist nicht kompatibel.", issues);
  }

  let normalizedComics = [];
  let normalizedArchiveCore = null;

  if (hasArchiveCore) {
    try {
      const normalizedSeries = parsedBackup.archiveCore.series.map((entry) => createSeriesDefinition(entry));
      const normalizedIssues = parsedBackup.archiveCore.issues.map((entry) => normalizeIssueRecord(entry, {
        dataFormatVersion: APP_CONFIG.dataFormatVersion
      }));
      const normalizedCopies = parsedBackup.archiveCore.copies.map((entry, copyIndex) => {
        if (!isPlainObject(entry)) {
          throw new Error(`Exemplar ${copyIndex + 1}: Der Eintrag ist kein Objekt.`);
        }
        ["isRead", "isSealed"].forEach((fieldName) => {
          if (entry[fieldName] !== undefined && typeof entry[fieldName] !== "boolean") {
            throw new Error(`Exemplar ${copyIndex + 1}: Das Feld „${fieldName}“ muss true oder false sein.`);
          }
        });
        return normalizeCopyRecord(entry);
      });
      const graph = { series: normalizedSeries, issues: normalizedIssues, copies: normalizedCopies };
      const validation = validateArchiveGraph(graph);
      if (!validation.valid) {
        throw new Error(validation.problems.slice(0, 10).join(" "));
      }
      normalizedComics = materializeLegacyComics(normalizedIssues, normalizedCopies, normalizedSeries, {
        dataFormatVersion: APP_CONFIG.dataFormatVersion
      });
      normalizedArchiveCore = {
        modelVersion: archiveModelVersion,
        series: normalizedSeries,
        issues: normalizedIssues,
        copies: normalizedCopies,
        counts: validation.counts,
        report: isPlainObject(parsedBackup.archiveCore.report) ? parsedBackup.archiveCore.report : null
      };
    } catch (error) {
      throw new BackupValidationError("Der Archivkern im Backup ist ungültig.", [error.message]);
    }
  } else {
    const seenLegacyIds = new Set();
    parsedBackup.comics.forEach((comic, index) => {
      try {
        const normalizedComic = normalizeImportedComic(comic, index);
        if (seenLegacyIds.has(normalizedComic.id)) {
          issues.push(`Eintrag ${index + 1}: Die ID „${normalizedComic.id}“ kommt mehrfach vor.`);
        } else {
          seenLegacyIds.add(normalizedComic.id);
          normalizedComics.push(normalizedComic);
        }
      } catch (error) {
        issues.push(error.message);
      }
    });
  }

  if (issues.length > 0) {
    throw new BackupValidationError("Das Backup enthält ungültige Comic-Einträge.", issues.slice(0, 20));
  }

  // Auch die kompatible Projektion eines neuen Backups wird geprüft. Sie ist nicht
  // autoritativ, darf aber keine offensichtlich beschädigten IDs enthalten.
  if (hasArchiveCore && Array.isArray(parsedBackup.comics)) {
    const projectionIds = new Set();
    parsedBackup.comics.forEach((comic, index) => {
      try {
        const normalized = normalizeImportedComic(comic, index);
        if (projectionIds.has(normalized.id)) throw new Error(`Eintrag ${index + 1}: doppelte ID „${normalized.id}“.`);
        projectionIds.add(normalized.id);
      } catch (error) {
        issues.push(error.message);
      }
    });
    if (issues.length > 0) {
      throw new BackupValidationError("Die kompatible Comic-Projektion im Backup ist beschädigt.", issues.slice(0, 20));
    }
  }

  let normalizedSettings;
  try {
    normalizedSettings = normalizeImportedSettings(parsedBackup.settings, parsedBackup.seriesConfiguration);
  } catch (error) {
    throw new BackupValidationError("Die App-Einstellungen im Backup sind ungültig.", [error.message]);
  }

  const seenIds = new Set(normalizedComics.map((comic) => comic.id));
  const metadataCache = normalizeMetadataCache(parsedBackup.metadataCache, issues);
  const covers = backupType === "media" ? normalizeMediaCovers(parsedBackup.covers, seenIds, issues) : [];

  if (issues.length > 0) {
    throw new BackupValidationError("Das Backup enthält ungültige Medien- oder Metadaten.", issues.slice(0, 20));
  }

  return {
    backupType,
    dataFormatVersion: version,
    archiveModelVersion: hasArchiveCore ? archiveModelVersion : Number(parsedBackup.archiveModelVersion) || null,
    archiveCore: normalizedArchiveCore,
    hasArchiveCore,
    exportedAt: isValidDateString(parsedBackup.exportedAt) ? parsedBackup.exportedAt : null,
    comics: normalizedComics,
    settings: normalizedSettings,
    metadataCache,
    hasMetadataCache: Array.isArray(parsedBackup.metadataCache),
    covers,
    hasMedia: backupType === "media"
  };
}

export function mergeCollections(existingComics, importedComics) {
  const merged = toLegacyComics(Array.isArray(existingComics) ? existingComics : []).map((comic) => normalizeComicCopiesForMerge(comic));
  const byId = new Map(merged.map((comic) => [comic.id, comic]));
  const byIdentity = new Map(merged.map((comic) => [createIssueMergeKey(comic), comic]));
  const idMap = {};
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let copiesAdded = 0;

  (Array.isArray(importedComics) ? importedComics : []).forEach((rawImported) => {
    const imported = normalizeComicCopiesForMerge(rawImported);
    const existing = byId.get(imported.id) || byIdentity.get(createIssueMergeKey(imported));

    if (!existing) {
      merged.push(imported);
      byId.set(imported.id, imported);
      byIdentity.set(createIssueMergeKey(imported), imported);
      idMap[imported.id] = imported.id;
      added += 1;
      return;
    }

    idMap[imported.id] = existing.id;
    const existingCopyIds = new Set(getComicCopies(existing).map((copy) => copy.id));
    const combined = mergeIssueAndCopies(existing, imported);
    const newlyAddedCopies = getComicCopies(combined).filter((copy) => !existingCopyIds.has(copy.id)).length;
    const changed = createComicFingerprint(combined) !== createComicFingerprint(existing);
    if (!changed) {
      skipped += 1;
      return;
    }

    const index = merged.findIndex((comic) => comic.id === existing.id);
    if (index >= 0) merged[index] = combined;
    byId.set(existing.id, combined);
    byIdentity.set(createIssueMergeKey(combined), combined);
    copiesAdded += newlyAddedCopies;
    updated += 1;
  });

  return { comics: merged, added, updated, skipped, copiesAdded, idMap };
}

function normalizeComicCopiesForMerge(comic) {
  const issueId = String(comic?.issueId || comic?.id || createEntityId("issue"));
  const copies = getComicCopies(comic).map((copy, index) => normalizeCopy({
    ...copy,
    issueId,
    displayOrder: index + 1
  }, { issueId, position: index + 1 }));
  const primary = copies[0];
  const secondary = copies[1] || null;
  return {
    ...comic,
    id: issueId,
    issueId,
    copies,
    copyCount: copies.length,
    condition: primary.condition,
    duplicateCondition: secondary?.condition || null,
    isRead: primary.isRead,
    isSealed: primary.isSealed,
    isDuplicate: copies.length > 1
  };
}

function createIssueMergeKey(comic) {
  const seriesKey = comic.seriesId || normalizeSeriesLookup(comic.series);
  return createIssueIdentityKey(seriesKey, comic.volumeNumber);
}

function mergeIssueAndCopies(existing, imported) {
  const existingCopies = getComicCopies(existing);
  const importedCopies = getComicCopies(imported).map((copy) => ({ ...copy, issueId: existing.id }));
  const copies = mergeCopyLists(existingCopies, importedCopies, { issueId: existing.id });
  const importedIsNewer = getTimestamp(imported.updatedAt) > getTimestamp(existing.updatedAt);
  const richer = (first, second) => String(first || "").trim() || String(second || "").trim();
  const merged = {
    ...existing,
    seriesId: existing.seriesId || imported.seriesId || "",
    title: importedIsNewer ? richer(imported.title, existing.title) : richer(existing.title, imported.title),
    publicationYear: importedIsNewer ? (imported.publicationYear ?? existing.publicationYear) : (existing.publicationYear ?? imported.publicationYear),
    duckipediaPageUrl: importedIsNewer ? richer(imported.duckipediaPageUrl, existing.duckipediaPageUrl) : richer(existing.duckipediaPageUrl, imported.duckipediaPageUrl),
    duckipediaCoverUrl: importedIsNewer ? richer(imported.duckipediaCoverUrl, existing.duckipediaCoverUrl) : richer(existing.duckipediaCoverUrl, imported.duckipediaCoverUrl),
    duckipediaCoverFileName: importedIsNewer ? richer(imported.duckipediaCoverFileName, existing.duckipediaCoverFileName) : richer(existing.duckipediaCoverFileName, imported.duckipediaCoverFileName),
    duckipediaCoverSource: importedIsNewer ? richer(imported.duckipediaCoverSource, existing.duckipediaCoverSource) : richer(existing.duckipediaCoverSource, imported.duckipediaCoverSource),
    duckipediaCoverLookupVersion: Math.max(
      Number(existing.duckipediaCoverLookupVersion || 0),
      Number(imported.duckipediaCoverLookupVersion || 0)
    ),
    metadataStatus: importedIsNewer ? (imported.metadataStatus || existing.metadataStatus || "") : (existing.metadataStatus || imported.metadataStatus || ""),
    metadataFetchedAt: getTimestamp(imported.metadataFetchedAt) > getTimestamp(existing.metadataFetchedAt) ? imported.metadataFetchedAt : existing.metadataFetchedAt,
    copies: copies.map((copy, index) => ({ ...copy, issueId: existing.id, displayOrder: index + 1 })),
    updatedAt: getTimestamp(imported.updatedAt) > getTimestamp(existing.updatedAt) ? imported.updatedAt : existing.updatedAt
  };
  const primary = merged.copies[0];
  const secondary = merged.copies[1] || null;
  return {
    ...merged,
    copyCount: merged.copies.length,
    condition: primary.condition,
    duplicateCondition: secondary?.condition || null,
    isRead: primary.isRead,
    isSealed: primary.isSealed,
    isDuplicate: merged.copies.length > 1
  };
}

function createCopyFingerprint(copy) {
  return JSON.stringify([
    String(copy.id || ""),
    normalizeConditionCode(copy.condition, DEFAULT_CONDITION_CODE),
    Boolean(copy.isRead),
    Boolean(copy.isSealed),
    normalizeForComparison(copy.notes),
    copy.createdAt || null,
    copy.updatedAt || null
  ]);
}

export async function shareOrDownloadText({ content, filename, mimeType, title, text }) {
  const blob = new Blob([content], { type: mimeType });
  return shareOrDownloadBlob({ blob, filename, mimeType, title, text });
}

export async function shareOrDownloadBlob({ blob, filename, mimeType, title, text }) {
  const normalizedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const file = typeof File === "function"
    ? new File([normalizedBlob], filename, { type: mimeType })
    : null;

  if (
    file &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title, text });
      return { method: "share" };
    } catch (error) {
      if (error?.name === "AbortError") return { method: "cancelled" };
      console.warn("Teilen war nicht möglich, Download-Fallback wird verwendet:", error);
    }
  }

  downloadBlob(normalizedBlob, filename);
  return { method: "download" };
}

export function createDatedFilename(prefix, extension) {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${prefix}-${year}-${month}-${day}.${extension}`;
}

function createCsvRow(values) {
  return values.map(escapeCsvValue).join(CSV_SEPARATOR);
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

function normalizeImportedComic(comic, index) {
  const label = `Eintrag ${index + 1}`;
  if (!isPlainObject(comic)) throw new Error(`${label}: Der Eintrag ist kein Objekt.`);

  const id = normalizeRequiredString(comic.id || comic.issueId, 200, `${label}: ID`);
  const issueId = normalizeOptionalString(comic.issueId, 200, `${label}: Ausgaben-ID`) || id;
  const seriesId = normalizeOptionalString(comic.seriesId, 120, `${label}: Reihen-ID`);
  const series = normalizeRequiredString(comic.series, 100, `${label}: Reihe`);
  const volumeNumber = normalizeRequiredString(comic.volumeNumber, 30, `${label}: Bandnummer`);
  const numericBandNumber = parseStrictPositiveInteger(volumeNumber);

  if (/^\d+$/.test(volumeNumber) && numericBandNumber === null) {
    throw new Error(`${label}: Die numerische Bandnummer liegt außerhalb des erlaubten Bereichs 1 bis 99.999.`);
  }

  const title = normalizeOptionalString(comic.title, 200, `${label}: Titel`);
  const publicationYear = normalizePublicationYear(comic.publicationYear, label);
  const now = new Date().toISOString();
  const createdAt = isValidDateString(comic.createdAt) ? comic.createdAt : now;
  const updatedAt = isValidDateString(comic.updatedAt) ? comic.updatedAt : createdAt;
  const explicitCopies = Array.isArray(comic.copies) && comic.copies.length > 0;
  let copies = [];

  if (explicitCopies) {
    if (comic.copies.length > MAX_MEDIA_ITEMS) throw new Error(`${label}: Zu viele Exemplare.`);
    const seenCopyIds = new Set();
    copies = comic.copies.map((copy, copyIndex) => {
      if (!isPlainObject(copy)) throw new Error(`${label}, Exemplar ${copyIndex + 1}: Der Eintrag ist ungültig.`);
      const rawCondition = normalizeRequiredString(copy.condition, 10, `${label}, Exemplar ${copyIndex + 1}: Zustand`);
      const condition = normalizeConditionCode(rawCondition);
      if (!condition) throw new Error(`${label}, Exemplar ${copyIndex + 1}: Der Zustand „${rawCondition}“ ist unbekannt.`);
      const copyId = normalizeOptionalString(copy.id, 220, `${label}, Exemplar ${copyIndex + 1}: ID`) || `${issueId}:copy:${copyIndex + 1}`;
      if (seenCopyIds.has(copyId)) throw new Error(`${label}: Die Exemplar-ID „${copyId}“ kommt mehrfach vor.`);
      seenCopyIds.add(copyId);
      ["isRead", "isSealed"].forEach((fieldName) => {
        if (copy[fieldName] !== undefined && typeof copy[fieldName] !== "boolean") {
          throw new Error(`${label}, Exemplar ${copyIndex + 1}: Das Feld „${fieldName}“ muss true oder false sein.`);
        }
      });
      return normalizeCopy({
        id: copyId,
        issueId,
        condition,
        isRead: copy.isRead === true,
        isSealed: copy.isSealed === true,
        notes: normalizeOptionalString(copy.notes, 2000, `${label}, Exemplar ${copyIndex + 1}: Notizen`),
        displayOrder: copyIndex + 1,
        source: normalizeOptionalString(copy.source, 40, `${label}, Exemplar ${copyIndex + 1}: Quelle`) || "backup",
        createdAt: isValidDateString(copy.createdAt) ? copy.createdAt : createdAt,
        updatedAt: isValidDateString(copy.updatedAt) ? copy.updatedAt : updatedAt
      }, { issueId, position: copyIndex + 1, now });
    });
  } else {
    ["isRead", "isDuplicate", "isSealed"].forEach((fieldName) => {
      if (typeof comic[fieldName] !== "boolean") {
        throw new Error(`${label}: Das Feld „${fieldName}“ muss true oder false sein.`);
      }
    });
    const rawCondition = normalizeRequiredString(comic.condition, 10, `${label}: Zustand`);
    const condition = normalizeConditionCode(rawCondition);
    if (!condition) throw new Error(`${label}: Der Zustand „${rawCondition}“ ist unbekannt.`);
    copies.push(normalizeCopy({
      id: `${issueId}:copy:1`,
      issueId,
      condition,
      isRead: comic.isRead,
      isSealed: comic.isSealed,
      notes: normalizeOptionalString(comic.notes, 2000, `${label}: Notizen`),
      displayOrder: 1,
      source: "legacy-backup",
      createdAt,
      updatedAt
    }, { issueId, position: 1, now }));
    if (comic.isDuplicate) {
      const rawDuplicate = typeof comic.duplicateCondition === "string" && comic.duplicateCondition ? comic.duplicateCondition : condition;
      const duplicateCondition = normalizeConditionCode(rawDuplicate);
      if (!duplicateCondition) throw new Error(`${label}: Der Zustand des zweiten Exemplars ist unbekannt.`);
      copies.push(normalizeCopy({
        id: `${issueId}:copy:2`,
        issueId,
        condition: duplicateCondition,
        isRead: false,
        isSealed: false,
        notes: "",
        displayOrder: 2,
        source: "legacy-backup-duplicate",
        createdAt,
        updatedAt
      }, { issueId, position: 2, now }));
    }
  }

  const primary = copies[0];
  const secondary = copies[1] || null;
  return {
    id,
    issueId,
    seriesId,
    archiveModelVersion: Number(comic.archiveModelVersion) || APP_CONFIG.archiveModelVersion || 1,
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    series,
    volumeNumber,
    numericBandNumber,
    title,
    publicationYear,
    condition: primary.condition,
    duplicateCondition: secondary?.condition || null,
    isRead: primary.isRead,
    isDuplicate: copies.length > 1,
    isSealed: primary.isSealed,
    notes: primary.notes || "",
    copies,
    copyCount: copies.length,
    duckipediaPageUrl: normalizeOptionalHttpUrl(comic.duckipediaPageUrl),
    duckipediaCoverUrl: normalizeOptionalHttpUrl(comic.duckipediaCoverUrl),
    duckipediaCoverFileName: String(comic.duckipediaCoverFileName || "").trim().slice(0, 300),
    duckipediaCoverSource: ["infobox-wikitext", "infobox-html", ""].includes(comic.duckipediaCoverSource)
      ? comic.duckipediaCoverSource
      : "",
    duckipediaCoverLookupVersion: Number.isSafeInteger(Number(comic.duckipediaCoverLookupVersion))
      && Number(comic.duckipediaCoverLookupVersion) >= 0
      && Number(comic.duckipediaCoverLookupVersion) <= 999
      ? Number(comic.duckipediaCoverLookupVersion)
      : 0,
    metadataStatus: ["found", "not-found", "manual", ""].includes(comic.metadataStatus) ? comic.metadataStatus : "",
    metadataFetchedAt: isValidDateString(comic.metadataFetchedAt) ? comic.metadataFetchedAt : null,
    createdAt,
    updatedAt
  };
}

function normalizeImportedSettings(settings, seriesConfiguration) {
  const source = isPlainObject(settings) ? settings : {};
  const seriesSource = isPlainObject(seriesConfiguration) ? seriesConfiguration : {};
  const customSeriesCandidate = Array.isArray(source.customSeries) ? source.customSeries : seriesSource.customSeries;
  const customSeriesConfigCandidate = Array.isArray(source.customSeriesConfigs)
    ? source.customSeriesConfigs
    : seriesSource.customSeriesConfigs;
  const highestCandidate = isPlainObject(source.knownHighestBandBySeries)
    ? source.knownHighestBandBySeries
    : seriesSource.knownHighestBandBySeries;

  const customSeries = Array.isArray(customSeriesCandidate)
    ? customSeriesCandidate.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim().slice(0, 100))
    : [];
  const customSeriesConfigs = normalizeImportedCustomSeriesConfigs(customSeriesConfigCandidate, customSeries);

  const knownHighestBandBySeries = {};
  if (isPlainObject(highestCandidate)) {
    Object.entries(highestCandidate).forEach(([series, value]) => {
      const parsedValue = Number(value);
      if (typeof series === "string" && series.trim() && Number.isSafeInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 99999) {
        knownHighestBandBySeries[series.trim().slice(0, 100)] = parsedValue;
      }
    });
  }

  const missingSource = isPlainObject(source.missingBandDetails)
    ? source.missingBandDetails
    : isPlainObject(seriesSource.missingBandDetails) ? seriesSource.missingBandDetails : {};
  const missingBandDetails = {};

  Object.entries(missingSource).forEach(([key, detail]) => {
    if (!key || !isPlainObject(detail)) return;
    const publicationYear = detail.publicationYear === null || detail.publicationYear === undefined || detail.publicationYear === ""
      ? null
      : Number(detail.publicationYear);
    const desiredCondition = normalizeConditionCode(detail.desiredCondition, "");
    missingBandDetails[key.slice(0, 500)] = {
      title: normalizeOptionalString(detail.title, 200, "Fehlband-Titel"),
      publicationYear: Number.isInteger(publicationYear) && publicationYear >= 1800 && publicationYear <= APP_CONFIG.publicationYearMaximum ? publicationYear : null,
      desiredCondition,
      priority: normalizeWishlistPriority(detail.priority),
      notes: normalizeOptionalString(detail.notes, 2000, "Fehlband-Notizen"),
      duckipediaUrl: normalizeOptionalHttpUrl(detail.duckipediaUrl),
      updatedAt: isValidDateString(detail.updatedAt) ? detail.updatedAt : null
    };
  });

  const changesSinceBackup = Number(source.changesSinceBackup);
  const mediaChangesSinceBackup = Number(source.mediaChangesSinceBackup);
  const lastBackupComicCount = Number(source.lastBackupComicCount);

  return {
    theme: source.theme === "light" ? "light" : "dark",
    lastBackupAt: isValidDateString(source.lastBackupAt) ? source.lastBackupAt : null,
    lastMediaBackupAt: isValidDateString(source.lastMediaBackupAt) ? source.lastMediaBackupAt : null,
    customSeries: [...new Set(customSeriesConfigs.map((entry) => entry.name))],
    customSeriesConfigs,
    knownHighestBandBySeries,
    missingBandDetails,
    fleaMarketSession: normalizeImportedFleaMarketSession(source.fleaMarketSession),
    changesSinceBackup: Number.isSafeInteger(changesSinceBackup) && changesSinceBackup >= 0 ? changesSinceBackup : 0,
    mediaChangesSinceBackup: Number.isSafeInteger(mediaChangesSinceBackup) && mediaChangesSinceBackup >= 0 ? mediaChangesSinceBackup : 0,
    lastBackupComicCount: Number.isSafeInteger(lastBackupComicCount) && lastBackupComicCount >= 0 ? lastBackupComicCount : 0,
    showCovers: source.showCovers !== false,
    duckipediaAutoEnrich: source.duckipediaAutoEnrich !== false,
    calendarEvents: Array.isArray(source.calendarEvents)
      ? source.calendarEvents.map(normalizeCalendarEvent).filter(Boolean)
      : [],
    calendarSourceUrl: normalizeOptionalHttpUrl(source.calendarSourceUrl),
    calendarSourceName: normalizeOptionalString(source.calendarSourceName, 120, "Kalenderquelle") || "LTB Jahresplan",
    calendarLastImportAt: isValidDateString(source.calendarLastImportAt) ? source.calendarLastImportAt : null,
    calendarImportedSources: normalizeImportedCalendarSources(source.calendarImportedSources),
    calendarCatalogLastCheckAt: isValidDateString(source.calendarCatalogLastCheckAt) ? source.calendarCatalogLastCheckAt : null,
    calendarAutoSync: source.calendarAutoSync !== false,
    calendarSelectedYear: Number.isSafeInteger(Number(source.calendarSelectedYear)) ? Number(source.calendarSelectedYear) : new Date().getFullYear(),
    calendarSelectedMonth: Number.isSafeInteger(Number(source.calendarSelectedMonth)) ? Math.min(11, Math.max(0, Number(source.calendarSelectedMonth))) : new Date().getMonth(),
    calendarReminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(source.calendarReminderTime || "")) ? String(source.calendarReminderTime) : "09:00",
    releaseRadarDecisions: normalizeReleaseDecisionMap(source.releaseRadarDecisions),
    releaseRadarKnownSignatures: normalizeKnownReleaseSignatures(source.releaseRadarKnownSignatures),
    releaseRadarInitializedAt: isValidDateString(source.releaseRadarInitializedAt) ? source.releaseRadarInitializedAt : null,
    releaseRadarLastOpenedAt: isValidDateString(source.releaseRadarLastOpenedAt) ? source.releaseRadarLastOpenedAt : null,
    releaseRadarFilter: RELEASE_RADAR_FILTERS.includes(source.releaseRadarFilter) ? source.releaseRadarFilter : "open",
    releaseRadarBadgeEnabled: source.releaseRadarBadgeEnabled !== false,
    releaseSeriesAliases: normalizeReleaseSeriesAliases(source.releaseSeriesAliases),
    releaseEventLinks: normalizeReleaseEventLinks(source.releaseEventLinks),
    milestoneSeenIds: normalizeMilestoneIds(source.milestoneSeenIds),
    milestonesInitializedAt: isValidDateString(source.milestonesInitializedAt) ? source.milestonesInitializedAt : null
  };
}

function normalizeImportedCalendarSources(value) {
  if (!isPlainObject(value)) return {};
  const result = {};
  Object.entries(value).forEach(([yearKey, entry]) => {
    const year = Number(yearKey);
    if (!Number.isSafeInteger(year) || year < 1900 || year > 2100 || !isPlainObject(entry)) return;
    const eventCount = Number(entry.eventCount);
    result[String(year)] = {
      id: normalizeOptionalString(entry.id, 120, "Kalenderquellen-ID") || `ltb-${year}`,
      label: normalizeOptionalString(entry.label, 160, "Kalenderquellenname") || `LTB Jahresplan ${year}`,
      version: normalizeOptionalString(entry.version, 80, "Kalenderversion"),
      file: normalizeOptionalString(entry.file, 500, "Kalenderdatei"),
      sourceUrl: normalizeOptionalHttpUrl(entry.sourceUrl),
      importedAt: isValidDateString(entry.importedAt) ? entry.importedAt : null,
      eventCount: Number.isSafeInteger(eventCount) && eventCount >= 0 ? Math.min(eventCount, 10000) : 0
    };
  });
  return result;
}

function normalizeImportedCustomSeriesConfigs(value, legacySeries = []) {
  const normalized = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!isPlainObject(entry)) return;
      const name = normalizeOptionalString(entry.name, 100, "Reihenname");
      if (!name) return;
      normalized.push({
        id: normalizeOptionalString(entry.id, 120, "Reihen-ID") || "",
        name,
        duckipediaPattern: normalizeDuckipediaPattern(normalizeOptionalString(entry.duckipediaPattern, 200, "Duckipedia-Pfad")),
        category: ["main", "special", "other"].includes(entry.category) ? entry.category : "special",
        aliases: Array.isArray(entry.aliases)
          ? [...new Set(entry.aliases.filter((alias) => typeof alias === "string" && alias.trim()).map((alias) => alias.trim().slice(0, 100)))]
          : [],
        isArchived: entry.isArchived === true
      });
    });
  }
  legacySeries.forEach((name) => {
    if (!normalized.some((entry) => entry.name.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
      normalized.push({ id: "", name, duckipediaPattern: "", category: "special", aliases: [], isArchived: false });
    }
  });
  return normalized.filter((entry, index, list) =>
    list.findIndex((candidate) => candidate.name.localeCompare(entry.name, "de", { sensitivity: "base" }) === 0) === index
  );
}

function normalizeImportedFleaMarketSession(value) {
  const source = isPlainObject(value) ? value : {};
  const sourceItems = isPlainObject(source.items) ? source.items : {};
  const items = {};
  Object.entries(sourceItems).forEach(([key, item]) => {
    if (!key || !isPlainObject(item)) return;
    const series = normalizeOptionalString(item.series, 100, "Flohmarkt-Reihe");
    const bandNumber = Number(item.bandNumber);
    const condition = normalizeConditionCode(item.condition, DEFAULT_CONDITION_CODE);
    if (!series || !Number.isSafeInteger(bandNumber) || bandNumber < 1 || bandNumber > 99999) return;
    items[key.slice(0, 500)] = {
      series,
      bandNumber,
      condition,
      markedAt: isValidDateString(item.markedAt) ? item.markedAt : new Date().toISOString()
    };
  });
  return {
    items,
    updatedAt: isValidDateString(source.updatedAt) ? source.updatedAt : null
  };
}

function normalizeMetadataCache(source, issues) {
  if (source === undefined) return [];
  if (!Array.isArray(source)) {
    issues.push("Der Duckipedia-Metadaten-Cache ist keine Liste.");
    return [];
  }

  return source.slice(0, MAX_MEDIA_ITEMS).map((entry, index) => {
    if (!isPlainObject(entry)) {
      issues.push(`Metadaten ${index + 1}: Eintrag ist ungültig.`);
      return null;
    }
    const series = normalizeOptionalString(entry.series, 100, `Metadaten ${index + 1}: Reihe`);
    const bandNumber = parseStrictPositiveInteger(entry.bandNumber);
    const key = normalizeOptionalString(entry.key, 500, `Metadaten ${index + 1}: Schlüssel`)
      || (series && bandNumber ? createMetadataCacheKey(series, bandNumber) : "");
    if (!key) {
      issues.push(`Metadaten ${index + 1}: Schlüssel fehlt.`);
      return null;
    }
    return {
      key,
      series,
      bandNumber,
      found: Boolean(entry.found),
      title: normalizeOptionalString(entry.title, 200, `Metadaten ${index + 1}: Titel`),
      publicationYear: normalizePublicationYear(entry.publicationYear, `Metadaten ${index + 1}`),
      pageUrl: normalizeOptionalHttpUrl(entry.pageUrl),
      coverUrl: normalizeOptionalHttpUrl(entry.coverUrl),
      reason: normalizeOptionalString(entry.reason, 500, `Metadaten ${index + 1}: Hinweis`),
      fetchedAt: isValidDateString(entry.fetchedAt) ? entry.fetchedAt : new Date().toISOString()
    };
  }).filter(Boolean);
}

function normalizeMediaCovers(source, comicIds, issues) {
  if (source.length > MAX_MEDIA_ITEMS) {
    issues.push(`Das Medien-Backup enthält mehr als ${MAX_MEDIA_ITEMS} Coverbilder.`);
    return [];
  }

  return source.map((entry, index) => {
    if (!isPlainObject(entry)) {
      issues.push(`Cover ${index + 1}: Eintrag ist ungültig.`);
      return null;
    }
    const comicId = normalizeOptionalString(entry.comicId, 200, `Cover ${index + 1}: Comic-ID`);
    if (!comicId || !comicIds.has(comicId)) {
      issues.push(`Cover ${index + 1}: Die zugehörige Comic-ID fehlt im Backup.`);
      return null;
    }
    const dataUrl = typeof entry.dataUrl === "string" ? entry.dataUrl : "";
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(dataUrl)) {
      issues.push(`Cover ${index + 1}: Bilddaten sind ungültig.`);
      return null;
    }
    return {
      comicId,
      mimeType: /^data:(image\/(?:jpeg|png|webp));/i.exec(dataUrl)?.[1]?.toLowerCase() || "image/jpeg",
      size: Number.isFinite(Number(entry.size)) ? Math.max(0, Number(entry.size)) : 0,
      width: Number.isFinite(Number(entry.width)) ? Math.max(0, Number(entry.width)) : 0,
      height: Number.isFinite(Number(entry.height)) ? Math.max(0, Number(entry.height)) : 0,
      updatedAt: isValidDateString(entry.updatedAt) ? entry.updatedAt : new Date().toISOString(),
      dataUrl
    };
  }).filter(Boolean);
}

function normalizePublicationYear(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1800 || parsedValue > APP_CONFIG.publicationYearMaximum) {
    throw new Error(`${label}: Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`);
  }
  return parsedValue;
}

function normalizeRequiredString(value, maximumLength, label) {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${label} fehlt oder ist ungültig.`);
  const normalized = String(value).trim();
  if (!normalized) throw new Error(`${label} darf nicht leer sein.`);
  if (normalized.length > maximumLength) throw new Error(`${label} ist länger als ${maximumLength} Zeichen.`);
  return normalized;
}

function normalizeOptionalString(value, maximumLength, label) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${label} ist ungültig.`);
  const normalized = String(value).trim();
  if (normalized.length > maximumLength) throw new Error(`${label} ist länger als ${maximumLength} Zeichen.`);
  return normalized;
}

function normalizeOptionalHttpUrl(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href.slice(0, 2000) : "";
  } catch (error) {
    return "";
  }
}

function parseStrictPositiveInteger(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 99999 ? parsedValue : null;
}

function createComicFingerprint(comic) {
  const copies = getComicCopies(comic).map(createCopyFingerprint).sort();
  return JSON.stringify([
    createIssueMergeKey(comic),
    normalizeForComparison(comic.title),
    comic.publicationYear ?? null,
    normalizeForComparison(comic.duckipediaPageUrl),
    copies
  ]);
}

function normalizeForComparison(value) {
  return String(value ?? "").trim().toLocaleLowerCase("de");
}

function getTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
