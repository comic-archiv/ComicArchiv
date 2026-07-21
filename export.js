import {
  APP_CONFIG,
  createDuckipediaSearchUrl,
  createMetadataCacheKey,
  createMissingDetailKey,
  normalizeDuckipediaPattern
} from "./config.js";
import { blobToDataUrl } from "./media.js";

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
  const rows = [
    [
      "Reihe",
      "Bandnummer",
      "Titel",
      "Erscheinungsjahr",
      "Zustand Exemplar 1",
      "Zustand Exemplar 2",
      "Gelesen",
      "Foliert",
      "Doppelt",
      "Notizen",
      "Duckipedia"
    ],
    ...comics.map((comic) => [
      comic.series,
      comic.volumeNumber,
      comic.title || "",
      comic.publicationYear ?? "",
      comic.condition,
      comic.isDuplicate ? (comic.duplicateCondition || comic.condition) : "",
      comic.isRead ? "Ja" : "Nein",
      comic.isSealed ? "Ja" : "Nein",
      comic.isDuplicate ? "Ja" : "Nein",
      comic.notes || "",
      comic.duckipediaPageUrl || createDuckipediaSearchUrl(comic.series, comic.volumeNumber, comic.title || "", settings)
    ])
  ];

  return UTF8_BOM + rows.map(createCsvRow).join("\r\n");
}

export function createMissingCsv(missingGroups, settings = {}) {
  const rows = [[
    "Reihe",
    "Fehlender Band",
    "Titel / Name",
    "Erscheinungsjahr",
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

  const doc = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const columnGap = 6;
  const cardWidth = (contentWidth - columnGap) / 2;
  const footerY = pageHeight - 10;
  const details = settings.missingBandDetails || {};
  const exportedAt = new Date();
  let pageNumber = 1;
  let cursorY = 0;

  const colors = {
    navy: [17, 24, 39],
    navySoft: [30, 41, 59],
    accent: [250, 204, 21],
    cyan: [14, 116, 144],
    text: [31, 41, 55],
    muted: [100, 116, 139],
    border: [218, 224, 232],
    card: [248, 250, 252],
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
    doc.rect(0, 0, pageWidth, 43, "F");
    setFillColor(colors.accent);
    doc.roundedRect(margin, 9, 37, 8, 2, 2, "F");
    setTextColor(colors.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SAMMLERHAUSEN", margin + 18.5, 14.3, { align: "center" });

    setTextColor(colors.white);
    doc.setFontSize(21);
    doc.text("Flohmarkt-Suchliste", margin, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`${totalMissing} fehlende Bände | ${groups.length} Reihen | Stand ${formatDate(exportedAt)}`, margin, 35.2);

    cursorY = 51;
  }

  function drawPageFooter() {
    setDrawColor(colors.border);
    doc.setLineWidth(0.25);
    doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
    setTextColor(colors.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text("Entenarchiv - private Such- und Wunschliste", margin, footerY + 1);
    doc.text(`Seite ${pageNumber}`, pageWidth - margin, footerY + 1, { align: "right" });
  }

  function addPage() {
    drawPageFooter();
    doc.addPage();
    pageNumber += 1;
    drawPageHeader();
  }

  function ensureSpace(requiredHeight) {
    if (cursorY + requiredHeight > footerY - 6) addPage();
  }

  function drawSummaryCards() {
    const gap = 5;
    const width = (contentWidth - gap * 2) / 3;
    const summaries = [
      { value: String(totalMissing), label: "fehlende Bände" },
      { value: String(groups.length), label: "betroffene Reihen" },
      { value: "A4", label: "druckfertig & übersichtlich" }
    ];

    summaries.forEach((item, index) => {
      const x = margin + index * (width + gap);
      setFillColor(index === 0 ? [255, 248, 214] : colors.card);
      setDrawColor(index === 0 ? [232, 190, 35] : colors.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, cursorY, width, 19, 3, 3, "FD");
      setTextColor(index === 0 ? [113, 63, 18] : colors.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(index === 2 ? 12 : 13);
      doc.text(item.value, x + 5, cursorY + 8.1);
      setTextColor(colors.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.text(item.label, x + 5, cursorY + 14.2);
    });

    cursorY += 27;
  }

  function drawSeriesHeading(group) {
    ensureSpace(18);
    setFillColor(colors.navySoft);
    doc.roundedRect(margin, cursorY, contentWidth, 12, 2.5, 2.5, "F");
    setFillColor(colors.accent);
    doc.roundedRect(margin, cursorY, 3.2, 12, 1.6, 1.6, "F");
    setTextColor(colors.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(String(group.series), margin + 7, cursorY + 7.7);
    doc.setFontSize(8);
    doc.text(`${group.missingBands.length} fehlen`, pageWidth - margin - 5, cursorY + 7.7, { align: "right" });
    cursorY += 16;
  }

  function getCardData(group, bandNumber) {
    const detail = details[createMissingDetailKey(group.series, bandNumber)] || {};
    const condition = APP_CONFIG.conditions.find((entry) => entry.code === detail.desiredCondition)?.label || "";
    const title = String(detail.title || "").trim();
    const notes = String(detail.notes || "").trim();
    const metaParts = [
      detail.publicationYear ? String(detail.publicationYear) : "",
      condition ? `Wunsch: ${condition}` : ""
    ].filter(Boolean);

    return {
      bandNumber,
      title,
      notes,
      meta: metaParts.join(" | "),
      url: detail.duckipediaUrl || createDuckipediaSearchUrl(group.series, bandNumber, title, settings)
    };
  }

  function measureCard(data) {
    const titleLines = data.title ? doc.splitTextToSize(data.title, cardWidth - 15).slice(0, 2) : [];
    const metaLines = data.meta ? doc.splitTextToSize(data.meta, cardWidth - 10).slice(0, 2) : [];
    const notesLines = data.notes ? doc.splitTextToSize(data.notes, cardWidth - 10).slice(0, 2) : [];
    const contentLines = titleLines.length + metaLines.length + notesLines.length;
    const height = Math.max(20, 15 + contentLines * 3.5);
    return { ...data, titleLines, metaLines, notesLines, height };
  }

  function drawBandCard(data, x, y, height) {
    setFillColor(colors.card);
    setDrawColor(colors.border);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, cardWidth, height, 2.8, 2.8, "FD");

    setDrawColor(colors.cyan);
    doc.setLineWidth(0.55);
    doc.roundedRect(x + 4, y + 5, 4.3, 4.3, 0.7, 0.7, "S");

    setTextColor(colors.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(`Band ${data.bandNumber}`, x + 11, y + 8.5);

    let textY = y + 13.3;
    if (data.titleLines.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.6);
      doc.text(data.titleLines, x + 5, textY);
      textY += data.titleLines.length * 3.3 + 0.8;
    }

    if (data.metaLines.length) {
      setTextColor(colors.cyan);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(data.metaLines, x + 5, textY);
      textY += data.metaLines.length * 3.2 + 0.8;
    }

    if (data.notesLines.length) {
      setTextColor(colors.muted);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.8);
      doc.text(data.notesLines, x + 5, textY);
    }

    if (data.url) {
      setTextColor(colors.cyan);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.textWithLink("Info", x + cardWidth - 5, y + 8.2, { url: data.url, align: "right" });
    }
  }

  drawPageHeader();
  drawSummaryCards();

  groups.forEach((group) => {
    drawSeriesHeading(group);
    const cards = group.missingBands.map((bandNumber) => measureCard(getCardData(group, bandNumber)));

    for (let index = 0; index < cards.length; index += 2) {
      const first = cards[index];
      const second = cards[index + 1] || null;
      const rowHeight = Math.max(first.height, second?.height || 0);
      ensureSpace(rowHeight + 5);
      drawBandCard(first, margin, cursorY, rowHeight);
      if (second) drawBandCard(second, margin + cardWidth + columnGap, cursorY, rowHeight);
      cursorY += rowHeight + 5;
    }

    cursorY += 2;
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
  const backup = {
    app: APP_CONFIG.storageName,
    appVersion: APP_CONFIG.appVersion,
    backupType,
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    mediaFormatVersion: backupType === "media" ? 1 : null,
    exportedAt: new Date().toISOString(),
    sourceOrigin: typeof window !== "undefined" ? window.location.origin : "",
    comics,
    settings: serializeSettings(settings),
    metadataCache: Array.isArray(metadataCache) ? metadataCache : [],
    seriesConfiguration: {
      defaultSeries: [...APP_CONFIG.series],
      customSeries: Array.isArray(settings.customSeries) ? settings.customSeries : [],
      customSeriesConfigs: Array.isArray(settings.customSeriesConfigs) ? settings.customSeriesConfigs : [],
      knownHighestBandBySeries: settings.knownHighestBandBySeries || {},
      missingBandDetails: settings.missingBandDetails || {}
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
    duckipediaAutoEnrich: settings.duckipediaAutoEnrich !== false
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

  if (!Number.isInteger(version)) {
    issues.push("Die Versionsnummer des Datenformats fehlt oder ist ungültig.");
  } else if (version < APP_CONFIG.minimumSupportedBackupVersion) {
    issues.push(`Datenformat-Version ${version} ist zu alt.`);
  } else if (version > APP_CONFIG.dataFormatVersion) {
    issues.push(`Datenformat-Version ${version} ist neuer als diese App-Version unterstützt. Bitte aktualisiere zuerst Entenarchiv.`);
  }

  if (!Array.isArray(parsedBackup.comics)) {
    issues.push("Das Feld „comics“ fehlt oder ist keine Liste.");
  }

  if (backupType === "media" && !Array.isArray(parsedBackup.covers)) {
    issues.push("Das Medien-Backup enthält keine gültige Cover-Liste.");
  }

  if (issues.length > 0) {
    throw new BackupValidationError("Das Backup ist nicht kompatibel.", issues);
  }

  const normalizedComics = [];
  const seenIds = new Set();

  parsedBackup.comics.forEach((comic, index) => {
    try {
      const normalizedComic = normalizeImportedComic(comic, index);
      if (seenIds.has(normalizedComic.id)) {
        issues.push(`Eintrag ${index + 1}: Die ID „${normalizedComic.id}“ kommt mehrfach vor.`);
      } else {
        seenIds.add(normalizedComic.id);
        normalizedComics.push(normalizedComic);
      }
    } catch (error) {
      issues.push(error.message);
    }
  });

  if (issues.length > 0) {
    throw new BackupValidationError("Das Backup enthält ungültige Comic-Einträge.", issues.slice(0, 20));
  }

  let normalizedSettings;
  try {
    normalizedSettings = normalizeImportedSettings(parsedBackup.settings, parsedBackup.seriesConfiguration);
  } catch (error) {
    throw new BackupValidationError("Die App-Einstellungen im Backup sind ungültig.", [error.message]);
  }

  const metadataCache = normalizeMetadataCache(parsedBackup.metadataCache, issues);
  const covers = backupType === "media" ? normalizeMediaCovers(parsedBackup.covers, seenIds, issues) : [];

  if (issues.length > 0) {
    throw new BackupValidationError("Das Backup enthält ungültige Medien- oder Metadaten.", issues.slice(0, 20));
  }

  return {
    backupType,
    dataFormatVersion: version,
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
  const mergedById = new Map(existingComics.map((comic) => [comic.id, comic]));
  const fingerprints = new Set(existingComics.map(createComicFingerprint));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  importedComics.forEach((importedComic) => {
    const existingWithSameId = mergedById.get(importedComic.id);

    if (existingWithSameId) {
      if (getTimestamp(importedComic.updatedAt) > getTimestamp(existingWithSameId.updatedAt)) {
        mergedById.set(importedComic.id, importedComic);
        fingerprints.add(createComicFingerprint(importedComic));
        updated += 1;
      } else {
        skipped += 1;
      }
      return;
    }

    const fingerprint = createComicFingerprint(importedComic);
    if (fingerprints.has(fingerprint)) {
      skipped += 1;
      return;
    }

    mergedById.set(importedComic.id, importedComic);
    fingerprints.add(fingerprint);
    added += 1;
  });

  return { comics: [...mergedById.values()], added, updated, skipped };
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

  const id = normalizeRequiredString(comic.id, 200, `${label}: ID`);
  const series = normalizeRequiredString(comic.series, 100, `${label}: Reihe`);
  const volumeNumber = normalizeRequiredString(comic.volumeNumber, 30, `${label}: Bandnummer`);
  const numericBandNumber = parseStrictPositiveInteger(volumeNumber);

  if (/^\d+$/.test(volumeNumber) && numericBandNumber === null) {
    throw new Error(`${label}: Die numerische Bandnummer liegt außerhalb des erlaubten Bereichs 1 bis 99.999.`);
  }

  const title = normalizeOptionalString(comic.title, 200, `${label}: Titel`);
  const notes = normalizeOptionalString(comic.notes, 2000, `${label}: Notizen`);
  const publicationYear = normalizePublicationYear(comic.publicationYear, label);
  const condition = normalizeRequiredString(comic.condition, 10, `${label}: Zustand`);

  if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
    throw new Error(`${label}: Der Zustand „${condition}“ ist unbekannt.`);
  }

  ["isRead", "isDuplicate", "isSealed"].forEach((fieldName) => {
    if (typeof comic[fieldName] !== "boolean") {
      throw new Error(`${label}: Das Feld „${fieldName}“ muss true oder false sein.`);
    }
  });

  let duplicateCondition = null;
  if (comic.isDuplicate) {
    duplicateCondition = typeof comic.duplicateCondition === "string" && comic.duplicateCondition
      ? comic.duplicateCondition
      : condition;
    if (!APP_CONFIG.conditions.some((entry) => entry.code === duplicateCondition)) {
      throw new Error(`${label}: Der Zustand des zweiten Exemplars ist unbekannt.`);
    }
  }

  const now = new Date().toISOString();
  const createdAt = isValidDateString(comic.createdAt) ? comic.createdAt : now;
  const updatedAt = isValidDateString(comic.updatedAt) ? comic.updatedAt : createdAt;

  return {
    id,
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    series,
    volumeNumber,
    numericBandNumber,
    title,
    publicationYear,
    condition,
    duplicateCondition,
    isRead: comic.isRead,
    isDuplicate: comic.isDuplicate,
    isSealed: comic.isSealed,
    notes,
    duckipediaPageUrl: normalizeOptionalHttpUrl(comic.duckipediaPageUrl),
    duckipediaCoverUrl: normalizeOptionalHttpUrl(comic.duckipediaCoverUrl),
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
    const desiredCondition = typeof detail.desiredCondition === "string" && APP_CONFIG.conditions.some((entry) => entry.code === detail.desiredCondition)
      ? detail.desiredCondition
      : "";
    missingBandDetails[key.slice(0, 500)] = {
      title: normalizeOptionalString(detail.title, 200, "Fehlband-Titel"),
      publicationYear: Number.isInteger(publicationYear) && publicationYear >= 1800 && publicationYear <= APP_CONFIG.publicationYearMaximum ? publicationYear : null,
      desiredCondition,
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
    duckipediaAutoEnrich: source.duckipediaAutoEnrich !== false
  };
}

function normalizeImportedCustomSeriesConfigs(value, legacySeries = []) {
  const normalized = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!isPlainObject(entry)) return;
      const name = normalizeOptionalString(entry.name, 100, "Reihenname");
      if (!name) return;
      const duckipediaPattern = normalizeDuckipediaPattern(normalizeOptionalString(entry.duckipediaPattern, 200, "Duckipedia-Pfad"));
      normalized.push({ name, duckipediaPattern });
    });
  }
  legacySeries.forEach((name) => {
    if (!normalized.some((entry) => entry.name.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
      normalized.push({ name, duckipediaPattern: "" });
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
    const condition = typeof item.condition === "string" && APP_CONFIG.conditions.some((entry) => entry.code === item.condition)
      ? item.condition
      : "VG";
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
  return JSON.stringify([
    normalizeForComparison(comic.series),
    normalizeForComparison(comic.volumeNumber),
    normalizeForComparison(comic.title),
    comic.publicationYear ?? null,
    comic.condition,
    comic.duplicateCondition || null,
    Boolean(comic.isRead),
    Boolean(comic.isDuplicate),
    Boolean(comic.isSealed),
    normalizeForComparison(comic.notes),
    comic.createdAt || null
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
