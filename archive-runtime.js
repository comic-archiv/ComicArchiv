import {
  APP_CONFIG,
  ARCHIVE_MODEL_VERSION,
  DEFAULT_CONDITION_CODE,
  normalizeConditionCode
} from "./config.js";
import {
  compareCopies,
  validateArchiveGraph
} from "./archive-model.js";

export const ARCHIVE_RUNTIME_VERSION = 1;

export function createArchiveRuntimeCollection({ series = [], issues = [], copies = [] } = {}, {
  dataFormatVersion = APP_CONFIG.dataFormatVersion
} = {}) {
  const graph = {
    series: Array.isArray(series) ? series : [],
    issues: Array.isArray(issues) ? issues : [],
    copies: Array.isArray(copies) ? copies : []
  };
  const validation = validateArchiveGraph(graph);
  if (!validation.valid) {
    throw new Error(`Archivgraph ist nicht runtime-bereit: ${validation.problems.slice(0, 5).join(" ")}`);
  }

  const seriesById = new Map(graph.series.map((entry) => [String(entry.id || ""), entry]));
  const copiesByIssue = new Map();
  graph.copies.forEach((copy) => {
    const issueId = String(copy?.issueId || "");
    if (!copiesByIssue.has(issueId)) copiesByIssue.set(issueId, []);
    copiesByIssue.get(issueId).push(copy);
  });
  copiesByIssue.forEach((entries) => entries.sort(compareCopies));

  const entries = graph.issues
    .map((issue) => createArchiveRuntimeEntry(issue, {
      series: seriesById.get(String(issue.seriesId || "")),
      copies: copiesByIssue.get(String(issue.id || "")) || [],
      dataFormatVersion
    }))
    .sort(compareRuntimeEntries);

  return {
    runtimeVersion: ARCHIVE_RUNTIME_VERSION,
    source: "archive-graph",
    series: graph.series,
    issues: graph.issues,
    copies: graph.copies,
    entries,
    counts: validation.counts
  };
}

export function createArchiveRuntimeEntry(issue, {
  series,
  copies = [],
  dataFormatVersion = APP_CONFIG.dataFormatVersion
} = {}) {
  if (!issue?.id) throw new Error("Runtime-Ausgabe benötigt eine ID.");
  if (!series?.id) throw new Error(`Runtime-Ausgabe ${issue.id} verweist auf eine unbekannte Reihe.`);

  const orderedCopies = (Array.isArray(copies) ? copies : []).slice().sort(compareCopies);
  if (!orderedCopies.length) throw new Error(`Runtime-Ausgabe ${issue.id} besitzt kein Exemplar.`);

  const normalizedCopies = orderedCopies.map((copy, index) => ({
    id: copy.id,
    issueId: copy.issueId,
    condition: normalizeConditionCode(copy.condition, DEFAULT_CONDITION_CODE),
    isRead: Boolean(copy.isRead),
    isSealed: Boolean(copy.isSealed),
    notes: String(copy.notes || ""),
    displayOrder: Number(copy.displayOrder) || index + 1,
    source: String(copy.source || "manual"),
    createdAt: copy.createdAt || issue.createdAt,
    updatedAt: copy.updatedAt || issue.updatedAt
  }));
  const primary = normalizedCopies[0];
  const secondary = normalizedCopies[1] || null;

  return {
    id: issue.id,
    issueId: issue.id,
    seriesId: series.id,
    dataFormatVersion,
    archiveModelVersion: ARCHIVE_MODEL_VERSION,
    series: series.name,
    volumeNumber: issue.volumeNumber,
    numericBandNumber: Number.isSafeInteger(issue.numericBandNumber) ? issue.numericBandNumber : null,
    title: issue.title || "",
    publicationYear: issue.publicationYear ?? null,
    condition: primary.condition,
    duplicateCondition: secondary?.condition || null,
    isRead: Boolean(primary.isRead),
    isDuplicate: normalizedCopies.length > 1,
    isSealed: Boolean(primary.isSealed),
    notes: primary.notes || "",
    copies: normalizedCopies,
    copyCount: normalizedCopies.length,
    duckipediaPageUrl: issue.duckipediaPageUrl || "",
    duckipediaCoverUrl: issue.duckipediaCoverUrl || "",
    duckipediaCoverFileName: issue.duckipediaCoverFileName || "",
    duckipediaCoverSource: issue.duckipediaCoverSource || "",
    duckipediaCoverLookupVersion: Number(issue.duckipediaCoverLookupVersion || 0),
    metadataStatus: issue.metadataStatus || "",
    metadataFetchedAt: issue.metadataFetchedAt || null,
    createdAt: issue.createdAt,
    updatedAt: latestDate([issue.updatedAt, ...normalizedCopies.map((copy) => copy.updatedAt)]) || issue.updatedAt
  };
}

export function createArchiveRuntimeIndex(runtime) {
  const source = runtime && typeof runtime === "object" ? runtime : {};
  return {
    seriesById: new Map((source.series || []).map((entry) => [String(entry.id || ""), entry])),
    issueById: new Map((source.issues || []).map((entry) => [String(entry.id || ""), entry])),
    copiesByIssue: groupCopiesByIssue(source.copies || []),
    entryById: new Map((source.entries || []).map((entry) => [String(entry.id || ""), entry]))
  };
}

function groupCopiesByIssue(copies) {
  const grouped = new Map();
  for (const copy of Array.isArray(copies) ? copies : []) {
    const issueId = String(copy?.issueId || "");
    if (!grouped.has(issueId)) grouped.set(issueId, []);
    grouped.get(issueId).push(copy);
  }
  grouped.forEach((entries) => entries.sort(compareCopies));
  return grouped;
}

function compareRuntimeEntries(first, second) {
  return String(first?.series || "").localeCompare(String(second?.series || ""), "de", { sensitivity: "base" })
    || compareVolumeNumbers(first?.volumeNumber, second?.volumeNumber);
}

function compareVolumeNumbers(first, second) {
  const firstNumeric = parsePositiveInteger(first);
  const secondNumeric = parsePositiveInteger(second);
  if (firstNumeric !== null && secondNumeric !== null) return firstNumeric - secondNumeric;
  if (firstNumeric !== null) return -1;
  if (secondNumeric !== null) return 1;
  return String(first || "").localeCompare(String(second || ""), "de", { numeric: true, sensitivity: "base" });
}

function parsePositiveInteger(value) {
  if (!/^[0-9]+$/.test(String(value ?? "").trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function latestDate(values) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) || null;
}
