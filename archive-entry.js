import { APP_CONFIG, ARCHIVE_MODEL_VERSION, DEFAULT_CONDITION_CODE, normalizeConditionCode } from "./config.js";
import { compareCopies, normalizeCopy } from "./archive-model.js";

export const ARCHIVE_ENTRY_VERSION = 1;

export function createArchiveEntry({ issue, series, copies = [] } = {}) {
  if (!issue?.id) throw new Error("Archive Entry benötigt eine Ausgabe mit ID.");
  if (!series?.id) throw new Error(`Archive Entry ${issue.id} benötigt eine gültige Reihe.`);
  const normalizedCopies = (Array.isArray(copies) ? copies : [])
    .map((copy, index) => normalizeCopy({
      ...copy,
      issueId: issue.id,
      condition: normalizeConditionCode(copy?.condition, DEFAULT_CONDITION_CODE),
      displayOrder: Number(copy?.displayOrder) || index + 1
    }, { issueId: issue.id, position: index + 1 }))
    .sort(compareCopies)
    .map((copy, index) => ({ ...copy, displayOrder: index + 1 }));

  if (!normalizedCopies.length) throw new Error(`Archive Entry ${issue.id} besitzt kein Exemplar.`);

  return {
    entryVersion: ARCHIVE_ENTRY_VERSION,
    id: String(issue.id),
    issue,
    series,
    copies: normalizedCopies
  };
}

export function isArchiveEntry(value) {
  return Boolean(value && typeof value === "object" && value.issue?.id && value.series?.id && Array.isArray(value.copies));
}

export function getEntryId(entry) {
  return String(entry?.issue?.id || entry?.id || "");
}

export function getEntrySeriesId(entry) {
  return String(entry?.series?.id || entry?.issue?.seriesId || entry?.seriesId || "");
}

export function getEntrySeriesName(entry) {
  if (entry?.series && typeof entry.series === "object") return String(entry.series.name || "");
  return String(entry?.series || "");
}

export function getEntryVolumeNumber(entry) {
  return String(entry?.issue?.volumeNumber ?? entry?.volumeNumber ?? "");
}

export function getEntryNumericBandNumber(entry) {
  const value = entry?.issue?.numericBandNumber ?? entry?.numericBandNumber;
  return Number.isSafeInteger(value) ? value : null;
}

export function getEntryTitle(entry) {
  return String(entry?.issue?.title ?? entry?.title ?? "");
}

export function getEntryPublicationYear(entry) {
  const value = entry?.issue?.publicationYear ?? entry?.publicationYear ?? null;
  return Number.isInteger(value) ? value : null;
}

export function getEntryCopies(entry) {
  if (Array.isArray(entry?.copies) && entry.copies.length) return entry.copies;
  if (!entry || typeof entry !== "object") return [];
  const issueId = String(entry?.issue?.id || entry?.issueId || entry?.id || "");
  if (!issueId) return [];
  const primary = normalizeCopy({
    id: `${issueId}:copy:1`,
    issueId,
    condition: entry.condition,
    isRead: entry.isRead,
    isSealed: entry.isSealed,
    notes: entry.notes,
    displayOrder: 1,
    source: "legacy-view",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }, { issueId, position: 1 });
  if (!entry.isDuplicate) return [primary];
  return [primary, normalizeCopy({
    id: `${issueId}:copy:2`,
    issueId,
    condition: entry.duplicateCondition || entry.condition,
    isRead: false,
    isSealed: false,
    notes: "",
    displayOrder: 2,
    source: "legacy-view",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }, { issueId, position: 2 })];
}

export function getEntryPrimaryCopy(entry) {
  return getEntryCopies(entry)[0] || null;
}

export function getEntryCondition(entry) {
  return getEntryPrimaryCopy(entry)?.condition || DEFAULT_CONDITION_CODE;
}

export function getEntryNotes(entry) {
  return String(getEntryPrimaryCopy(entry)?.notes || "");
}

export function isEntryRead(entry) {
  return Boolean(getEntryPrimaryCopy(entry)?.isRead);
}

export function isEntrySealed(entry) {
  return Boolean(getEntryPrimaryCopy(entry)?.isSealed);
}

export function getEntryCreatedAt(entry) {
  return entry?.issue?.createdAt || entry?.createdAt || null;
}

export function getEntryUpdatedAt(entry) {
  const issueDate = entry?.issue?.updatedAt || entry?.updatedAt || null;
  const copyDates = getEntryCopies(entry).map((copy) => copy?.updatedAt).filter(Boolean);
  return [issueDate, ...copyDates]
    .filter((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) || issueDate;
}

export function getEntryDuckipediaPageUrl(entry) {
  return String(entry?.issue?.duckipediaPageUrl ?? entry?.duckipediaPageUrl ?? "");
}

export function getEntryDuckipediaCoverUrl(entry) {
  return String(entry?.issue?.duckipediaCoverUrl ?? entry?.duckipediaCoverUrl ?? "");
}

export function getEntryDuckipediaCoverFileName(entry) {
  return String(entry?.issue?.duckipediaCoverFileName ?? entry?.duckipediaCoverFileName ?? "");
}

export function getEntryDuckipediaCoverSource(entry) {
  return String(entry?.issue?.duckipediaCoverSource ?? entry?.duckipediaCoverSource ?? "");
}

export function getEntryDuckipediaCoverLookupVersion(entry) {
  return Number(entry?.issue?.duckipediaCoverLookupVersion ?? entry?.duckipediaCoverLookupVersion ?? 0) || 0;
}

export function getEntryMetadataStatus(entry) {
  return String(entry?.issue?.metadataStatus ?? entry?.metadataStatus ?? "");
}

export function getEntryMetadataFetchedAt(entry) {
  return entry?.issue?.metadataFetchedAt ?? entry?.metadataFetchedAt ?? null;
}

export function toLegacyComic(entry, { dataFormatVersion = APP_CONFIG.dataFormatVersion } = {}) {
  if (!isArchiveEntry(entry)) return entry && typeof entry === "object" ? { ...entry } : entry;
  const copies = getEntryCopies(entry).map((copy, index) => ({
    id: copy.id,
    issueId: copy.issueId || getEntryId(entry),
    condition: normalizeConditionCode(copy.condition, DEFAULT_CONDITION_CODE),
    isRead: Boolean(copy.isRead),
    isSealed: Boolean(copy.isSealed),
    notes: String(copy.notes || ""),
    displayOrder: Number(copy.displayOrder) || index + 1,
    source: String(copy.source || "manual"),
    createdAt: copy.createdAt || getEntryCreatedAt(entry),
    updatedAt: copy.updatedAt || getEntryUpdatedAt(entry)
  }));
  const primary = copies[0] || null;
  const secondary = copies[1] || null;
  return {
    id: getEntryId(entry),
    issueId: getEntryId(entry),
    seriesId: getEntrySeriesId(entry),
    dataFormatVersion,
    archiveModelVersion: ARCHIVE_MODEL_VERSION,
    series: getEntrySeriesName(entry),
    volumeNumber: getEntryVolumeNumber(entry),
    numericBandNumber: getEntryNumericBandNumber(entry),
    title: getEntryTitle(entry),
    publicationYear: getEntryPublicationYear(entry),
    condition: primary?.condition || DEFAULT_CONDITION_CODE,
    duplicateCondition: secondary?.condition || null,
    isRead: Boolean(primary?.isRead),
    isDuplicate: copies.length > 1,
    isSealed: Boolean(primary?.isSealed),
    notes: primary?.notes || "",
    copies,
    copyCount: copies.length,
    duckipediaPageUrl: getEntryDuckipediaPageUrl(entry),
    duckipediaCoverUrl: getEntryDuckipediaCoverUrl(entry),
    duckipediaCoverFileName: getEntryDuckipediaCoverFileName(entry),
    duckipediaCoverSource: getEntryDuckipediaCoverSource(entry),
    duckipediaCoverLookupVersion: getEntryDuckipediaCoverLookupVersion(entry),
    metadataStatus: getEntryMetadataStatus(entry),
    metadataFetchedAt: getEntryMetadataFetchedAt(entry),
    createdAt: getEntryCreatedAt(entry),
    updatedAt: getEntryUpdatedAt(entry)
  };
}

export function toLegacyComics(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => toLegacyComic(entry));
}

export function updateArchiveEntry(entry, { issuePatch = null, copies = null, series = null } = {}) {
  if (!isArchiveEntry(entry)) throw new Error("Nur Archive Entries können aktualisiert werden.");
  const nextIssue = issuePatch ? { ...entry.issue, ...issuePatch } : entry.issue;
  return createArchiveEntry({
    issue: nextIssue,
    series: series || entry.series,
    copies: copies || entry.copies
  });
}
