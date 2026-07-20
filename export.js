import {
  APP_CONFIG,
  createDuckipediaSearchUrl,
  createMetadataCacheKey,
  createMissingDetailKey
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

export function createCollectionCsv(comics) {
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
      comic.duckipediaPageUrl || createDuckipediaSearchUrl(comic.series, comic.volumeNumber, comic.title || "")
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
        detail.duckipediaUrl || createDuckipediaSearchUrl(group.series, bandNumber, detail.title || "")
      ]);
    });
  });

  return UTF8_BOM + rows.map(createCsvRow).join("\r\n");
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
    knownHighestBandBySeries: settings.knownHighestBandBySeries || {},
    missingBandDetails: settings.missingBandDetails || {},
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
    issues.push(`Datenformat-Version ${version} ist neuer als diese App-Version unterstützt. Bitte aktualisiere zuerst Sammlerhausen.`);
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
  const highestCandidate = isPlainObject(source.knownHighestBandBySeries)
    ? source.knownHighestBandBySeries
    : seriesSource.knownHighestBandBySeries;

  const customSeries = Array.isArray(customSeriesCandidate)
    ? customSeriesCandidate.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim().slice(0, 100))
    : [];

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
    customSeries: [...new Set(customSeries)],
    knownHighestBandBySeries,
    missingBandDetails,
    changesSinceBackup: Number.isSafeInteger(changesSinceBackup) && changesSinceBackup >= 0 ? changesSinceBackup : 0,
    mediaChangesSinceBackup: Number.isSafeInteger(mediaChangesSinceBackup) && mediaChangesSinceBackup >= 0 ? mediaChangesSinceBackup : 0,
    lastBackupComicCount: Number.isSafeInteger(lastBackupComicCount) && lastBackupComicCount >= 0 ? lastBackupComicCount : 0,
    showCovers: source.showCovers !== false,
    duckipediaAutoEnrich: source.duckipediaAutoEnrich !== false
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
