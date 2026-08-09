import { materializeLegacyComics, validateArchiveGraph } from "./archive-model.js";

export const DATA_STACK_FOUNDATION_KIND = "pre-data-stack-v1";

export function validateDataStackFoundation({ series = [], issues = [], copies = [], legacyComics = [] } = {}) {
  const graphValidation = validateArchiveGraph({ series, issues, copies });
  const projected = graphValidation.valid ? materializeLegacyComics(issues, copies, series) : [];
  const parity = compareLegacyMirror(projected, legacyComics);
  const problems = [...graphValidation.problems];

  if (!parity.valid) {
    if (parity.missingInMirror.length) problems.push(`Im Legacy-Mirror fehlen ${parity.missingInMirror.length} Ausgaben.`);
    if (parity.extraInMirror.length) problems.push(`Der Legacy-Mirror enthält ${parity.extraInMirror.length} zusätzliche Ausgaben.`);
    if (parity.mismatchedIds.length) problems.push(`Bei ${parity.mismatchedIds.length} Ausgaben weichen Archivgraph und Legacy-Mirror voneinander ab.`);
  }

  return {
    valid: graphValidation.valid && parity.valid,
    problems,
    counts: {
      ...graphValidation.counts,
      legacyComics: legacyComics.length,
      projectedComics: projected.length
    },
    parity
  };
}

export function compareLegacyMirror(projectedComics = [], legacyComics = []) {
  const projectedMap = createComicMap(projectedComics);
  const legacyMap = createComicMap(legacyComics);
  const projectedIds = [...projectedMap.keys()].sort();
  const legacyIds = [...legacyMap.keys()].sort();
  const missingInMirror = projectedIds.filter((id) => !legacyMap.has(id));
  const extraInMirror = legacyIds.filter((id) => !projectedMap.has(id));
  const mismatchedIds = projectedIds.filter((id) => legacyMap.has(id) && stableStringify(projectedMap.get(id)) !== stableStringify(legacyMap.get(id)));

  return {
    valid: missingInMirror.length === 0 && extraInMirror.length === 0 && mismatchedIds.length === 0,
    projectedCount: projectedIds.length,
    mirrorCount: legacyIds.length,
    missingInMirror,
    extraInMirror,
    mismatchedIds
  };
}

export function createDataStackSnapshotRecord({
  id,
  kind = DATA_STACK_FOUNDATION_KIND,
  createdAt = new Date().toISOString(),
  appVersion,
  databaseVersion,
  dataFormatVersion,
  archiveModelVersion,
  dataStackVersion,
  settings = {},
  archiveMeta = null,
  series = [],
  issues = [],
  copies = [],
  legacyComics = []
} = {}) {
  const snapshotId = String(id || `${kind}-${createdAt.replace(/[^0-9]/g, "")}`).trim();
  if (!snapshotId) throw new Error("Snapshot-ID fehlt.");

  return {
    id: snapshotId,
    kind,
    createdAt,
    appVersion: String(appVersion || ""),
    databaseVersion: Number(databaseVersion) || null,
    dataFormatVersion: Number(dataFormatVersion) || null,
    archiveModelVersion: Number(archiveModelVersion) || null,
    dataStackVersion: Number(dataStackVersion) || null,
    settings,
    archiveMeta,
    series,
    issues,
    copies,
    comics: legacyComics,
    counts: {
      series: series.length,
      issues: issues.length,
      copies: copies.length,
      comics: legacyComics.length
    }
  };
}


export const SETTINGS_SPLIT_VERSION = 1;
export const SETTINGS_SPLIT_SNAPSHOT_KIND = "pre-settings-split-v1";

export const SETTINGS_GROUP_FIELDS = Object.freeze({
  preferences: Object.freeze([
    "theme",
    "showCovers",
    "duckipediaAutoEnrich",
    "scannerMode"
  ]),
  calendarState: Object.freeze([
    "calendarEvents",
    "calendarSourceUrl",
    "calendarSourceName",
    "calendarLastImportAt",
    "calendarImportedSources",
    "calendarCatalogLastCheckAt",
    "calendarAutoSync",
    "calendarSelectedYear",
    "calendarSelectedMonth",
    "calendarReminderTime"
  ]),
  missingState: Object.freeze([
    "knownHighestBandBySeries",
    "missingBandDetails"
  ]),
  fleaMarketState: Object.freeze([
    "fleaMarketSession"
  ]),
  releaseRadarState: Object.freeze([
    "releaseRadarDecisions",
    "releaseRadarKnownSignatures",
    "releaseRadarInitializedAt",
    "releaseRadarLastOpenedAt",
    "releaseRadarFilter",
    "releaseRadarBadgeEnabled",
    "releaseSeriesAliases",
    "releaseEventLinks"
  ]),
  collectorState: Object.freeze([
    "lastBackupAt",
    "lastMediaBackupAt",
    "customSeries",
    "customSeriesConfigs",
    "changesSinceBackup",
    "mediaChangesSinceBackup",
    "lastBackupComicCount",
    "archiveMigrationAcknowledgedAt",
    "milestoneSeenIds",
    "milestonesInitializedAt"
  ])
});

export function splitAppSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return Object.fromEntries(
    Object.entries(SETTINGS_GROUP_FIELDS).map(([groupName, fields]) => [
      groupName,
      Object.fromEntries(fields.map((field) => [field, canonicalize(source[field])]))
    ])
  );
}

export function mergeSplitSettings(groups = {}, fallback = {}) {
  const merged = canonicalize(fallback && typeof fallback === "object" ? fallback : {});
  for (const groupName of Object.keys(SETTINGS_GROUP_FIELDS)) {
    const group = groups?.[groupName];
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    Object.assign(merged, canonicalize(group));
  }
  return merged;
}

export function compareSettingsSplit(settings = {}, groups = {}) {
  const expected = splitAppSettings(settings);
  const missingGroups = [];
  const mismatchedGroups = [];

  for (const groupName of Object.keys(SETTINGS_GROUP_FIELDS)) {
    const actual = groups?.[groupName];
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      missingGroups.push(groupName);
      continue;
    }
    if (stableStringify(expected[groupName]) !== stableStringify(actual)) mismatchedGroups.push(groupName);
  }

  return {
    valid: missingGroups.length === 0 && mismatchedGroups.length === 0,
    splitVersion: SETTINGS_SPLIT_VERSION,
    groupCount: Object.keys(SETTINGS_GROUP_FIELDS).length,
    missingGroups,
    mismatchedGroups
  };
}

function createComicMap(comics) {
  const map = new Map();
  for (const comic of Array.isArray(comics) ? comics : []) {
    const id = String(comic?.id || "").trim();
    if (!id) continue;
    map.set(id, canonicalize(comic));
  }
  return map;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}
