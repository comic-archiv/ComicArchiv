import { APP_CONFIG } from "./config.js";
import { validateArchiveGraph } from "./archive-model.js";
import { createArchiveEntry } from "./archive-entry.js";

export const ARCHIVE_RUNTIME_VERSION = 2;

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

  const entries = graph.issues
    .map((issue) => createArchiveEntry({
      issue: { ...issue, dataFormatVersion },
      series: seriesById.get(String(issue.seriesId || "")),
      copies: copiesByIssue.get(String(issue.id || "")) || []
    }))
    .sort(compareArchiveEntries);

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

export function createArchiveRuntimeEntry(issue, { series, copies = [], dataFormatVersion = APP_CONFIG.dataFormatVersion } = {}) {
  return createArchiveEntry({ issue: { ...issue, dataFormatVersion }, series, copies });
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
  grouped.forEach((entries) => entries.sort((first, second) => (Number(first?.displayOrder) || 0) - (Number(second?.displayOrder) || 0)
    || String(first?.id || "").localeCompare(String(second?.id || ""), "de", { numeric: true })));
  return grouped;
}

function compareArchiveEntries(first, second) {
  return String(first?.series?.name || "").localeCompare(String(second?.series?.name || ""), "de", { sensitivity: "base" })
    || compareVolumeNumbers(first?.issue?.volumeNumber, second?.issue?.volumeNumber);
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
