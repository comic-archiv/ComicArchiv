import {
  APP_CONFIG,
  ARCHIVE_MODEL_VERSION,
  DEFAULT_CONDITION_CODE,
  STANDARD_SERIES_DEFINITIONS,
  normalizeConditionCode,
  normalizeDuckipediaPattern
} from "./config.js";

const SERIES_NAME_LIMIT = 100;
const VOLUME_NUMBER_LIMIT = 30;
const TITLE_LIMIT = 200;
const NOTES_LIMIT = 2000;

export function normalizeSeriesLookup(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createCustomSeriesId(name) {
  const normalized = normalizeSeriesLookup(name) || "reihe";
  const slug = normalized.replace(/\s+/g, "-").slice(0, 48).replace(/^-+|-+$/g, "") || "reihe";
  return `custom-${slug}-${hashString(normalized).slice(0, 8)}`;
}

export function hashString(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeVolumeNumber(value) {
  return String(value ?? "").trim().slice(0, VOLUME_NUMBER_LIMIT);
}

export function createIssueIdentityKey(seriesId, volumeNumber) {
  const normalizedVolume = normalizeVolumeNumber(volumeNumber).normalize("NFC");
  const identityVolume = /^[0-9]+$/.test(normalizedVolume) && Number(normalizedVolume) > 0
    ? String(Number(normalizedVolume))
    : normalizedVolume;
  return `${String(seriesId || "").trim()}::${encodeURIComponent(identityVolume)}`;
}

export function createSeriesDefinition(input, { now = new Date().toISOString() } = {}) {
  const source = input && typeof input === "object" ? input : {};
  const name = String(source.name || "").trim().slice(0, SERIES_NAME_LIMIT);
  if (!name) throw new Error("Der Reihenname fehlt.");

  const standard = findStandardSeriesDefinition(source.id || name);
  const id = String(source.id || standard?.id || createCustomSeriesId(name)).trim().slice(0, 120);
  if (!id) throw new Error("Die Reihen-ID fehlt.");

  const aliases = deduplicateStrings([
    ...(Array.isArray(standard?.aliases) ? standard.aliases : []),
    ...(Array.isArray(source.aliases) ? source.aliases : []),
    ...(Array.isArray(source.legacyNames) ? source.legacyNames : []),
    name
  ], SERIES_NAME_LIMIT).filter((entry) => normalizeSeriesLookup(entry) !== normalizeSeriesLookup(name));

  return {
    id,
    name,
    category: ["main", "special", "other"].includes(source.category)
      ? source.category
      : standard?.category || (name === "Sonstige" ? "other" : "special"),
    duckipediaPattern: normalizeDuckipediaPattern(
      source.duckipediaPattern ?? standard?.duckipediaPattern ?? ""
    ),
    aliases,
    isSystem: source.isSystem === true || Boolean(standard),
    isArchived: source.isArchived === true,
    createdAt: isDateString(source.createdAt) ? source.createdAt : now,
    updatedAt: isDateString(source.updatedAt) ? source.updatedAt : now
  };
}

export function createStandardSeriesCatalog({ now = new Date().toISOString() } = {}) {
  return STANDARD_SERIES_DEFINITIONS.map((entry) => createSeriesDefinition({
    ...entry,
    aliases: [...entry.aliases],
    isSystem: true,
    createdAt: now,
    updatedAt: now
  }, { now }));
}

export function findStandardSeriesDefinition(value) {
  const raw = String(value || "").trim();
  const lookup = normalizeSeriesLookup(raw);
  if (!lookup) return null;
  return STANDARD_SERIES_DEFINITIONS.find((entry) => {
    if (entry.id === raw) return true;
    if (normalizeSeriesLookup(entry.name) === lookup) return true;
    return entry.aliases.some((alias) => normalizeSeriesLookup(alias) === lookup);
  }) || null;
}

export function buildSeriesCatalog({ legacyComics = [], settings = {}, existingSeries = [], now = new Date().toISOString() } = {}) {
  const byId = new Map();
  const byLookup = new Map();

  const add = (candidate, options = {}) => {
    if (!candidate) return null;
    const definition = createSeriesDefinition(candidate, { now });
    const previous = byId.get(definition.id);
    const merged = previous
      ? createSeriesDefinition({
          ...previous,
          ...definition,
          aliases: deduplicateStrings([
            ...(previous.aliases || []),
            ...(definition.aliases || []),
            previous.name !== definition.name ? previous.name : ""
          ], SERIES_NAME_LIMIT),
          createdAt: previous.createdAt || definition.createdAt,
          updatedAt: definition.updatedAt || previous.updatedAt
        }, { now })
      : definition;

    byId.set(merged.id, merged);
    [merged.name, ...(merged.aliases || [])].forEach((name) => {
      const key = normalizeSeriesLookup(name);
      if (key && (!byLookup.has(key) || options.prefer)) byLookup.set(key, merged.id);
    });
    return merged;
  };

  createStandardSeriesCatalog({ now }).forEach((entry) => add(entry, { prefer: true }));
  (Array.isArray(existingSeries) ? existingSeries : []).forEach((entry) => add(entry, { prefer: true }));

  const customConfigs = Array.isArray(settings?.customSeriesConfigs) ? settings.customSeriesConfigs : [];
  customConfigs.forEach((entry) => {
    if (!entry?.name) return;
    add({
      id: entry.id || createCustomSeriesId(entry.name),
      name: entry.name,
      duckipediaPattern: entry.duckipediaPattern || "",
      category: entry.category || "special",
      aliases: entry.aliases || [],
      isSystem: false,
      isArchived: entry.isArchived === true
    }, { prefer: true });
  });

  const legacyNames = new Set([
    ...(Array.isArray(settings?.customSeries) ? settings.customSeries : []),
    ...Object.keys(settings?.knownHighestBandBySeries || {}),
    ...(Array.isArray(legacyComics) ? legacyComics.map((comic) => comic?.series) : [])
  ].filter((entry) => typeof entry === "string" && entry.trim()));

  legacyNames.forEach((name) => {
    const lookup = normalizeSeriesLookup(name);
    if (byLookup.has(lookup)) return;
    add({ id: createCustomSeriesId(name), name, isSystem: false, category: "special" });
  });

  const series = [...byId.values()];
  const resolve = (value, preferredId = "") => {
    if (preferredId && byId.has(preferredId)) return byId.get(preferredId);
    const key = normalizeSeriesLookup(value);
    const id = byLookup.get(key);
    if (id && byId.has(id)) return byId.get(id);
    const created = add({ id: createCustomSeriesId(value || "Sonstige"), name: value || "Sonstige", isSystem: false });
    return created;
  };

  return { series, resolve };
}

export function migrateLegacyComicsToArchive(legacyComics, seriesCatalog, {
  now = new Date().toISOString(),
  dataFormatVersion = APP_CONFIG.dataFormatVersion
} = {}) {
  const comics = Array.isArray(legacyComics) ? legacyComics : [];
  const catalog = Array.isArray(seriesCatalog) ? seriesCatalog : [];
  const seriesById = new Map(catalog.map((entry) => [entry.id, createSeriesDefinition(entry, { now })]));
  const seriesByLookup = createSeriesLookupMap([...seriesById.values()]);
  const groups = new Map();
  const warnings = [];
  const usedIssueIds = new Set();
  const usedCopyIds = new Set();

  comics.forEach((comic, index) => {
    if (!comic || typeof comic !== "object") {
      warnings.push(`Eintrag ${index + 1} wurde übersprungen, weil er kein Objekt ist.`);
      return;
    }
    const series = resolveSeriesForComic(comic, seriesById, seriesByLookup, now);
    if (!seriesById.has(series.id)) {
      seriesById.set(series.id, series);
      updateSeriesLookupMap(seriesByLookup, series);
    }
    const volumeNumber = normalizeVolumeNumber(comic.volumeNumber);
    if (!volumeNumber) {
      warnings.push(`Eintrag ${index + 1} wurde übersprungen, weil die Bandnummer fehlt.`);
      return;
    }
    const key = createIssueIdentityKey(series.id, volumeNumber);
    if (!groups.has(key)) groups.set(key, { series, volumeNumber, comics: [] });
    groups.get(key).comics.push({ comic, index });
  });

  const issues = [];
  const copies = [];
  let collapsedLegacyDuplicates = 0;
  let migratedDuplicateCopies = 0;

  for (const group of groups.values()) {
    const ordered = group.comics.slice().sort(compareLegacyComics);
    if (ordered.length > 1) collapsedLegacyDuplicates += ordered.length - 1;
    const preferred = selectPreferredLegacyComic(ordered.map((entry) => entry.comic));
    const issueId = createUniqueRecordId(
      String(ordered[0]?.comic?.id || preferred.id || createDeterministicIssueId(group.series.id, group.volumeNumber)).slice(0, 200),
      usedIssueIds,
      () => createDeterministicIssueId(group.series.id, group.volumeNumber),
      200
    );
    const numericBandNumber = parsePositiveInteger(group.volumeNumber);
    const createdAt = earliestDate(ordered.map((entry) => entry.comic?.createdAt)) || now;
    const updatedAt = latestDate(ordered.map((entry) => entry.comic?.updatedAt)) || now;
    const legacyComicIds = deduplicateStrings(ordered.map((entry) => entry.comic?.id).filter(Boolean), 200);

    issues.push(normalizeIssueRecord({
      id: issueId,
      seriesId: group.series.id,
      seriesVolumeKey: createIssueIdentityKey(group.series.id, group.volumeNumber),
      volumeNumber: group.volumeNumber,
      numericBandNumber,
      title: preferred.title || "",
      publicationYear: preferred.publicationYear ?? null,
      duckipediaPageUrl: preferred.duckipediaPageUrl || "",
      duckipediaCoverUrl: preferred.duckipediaCoverUrl || "",
      duckipediaCoverFileName: preferred.duckipediaCoverFileName || "",
      duckipediaCoverSource: preferred.duckipediaCoverSource || "",
      duckipediaCoverLookupVersion: Number(preferred.duckipediaCoverLookupVersion || 0),
      metadataStatus: preferred.metadataStatus || "",
      metadataFetchedAt: preferred.metadataFetchedAt || null,
      legacyComicIds,
      dataFormatVersion,
      archiveModelVersion: ARCHIVE_MODEL_VERSION,
      createdAt,
      updatedAt
    }, { now, dataFormatVersion }));

    let displayOrder = 0;
    ordered.forEach(({ comic }) => {
      const legacyId = String(comic.id || issueId);
      const explicitCopies = Array.isArray(comic.copies) && comic.copies.length > 0
        ? comic.copies
        : null;

      if (explicitCopies) {
        explicitCopies.forEach((copy, copyIndex) => {
          displayOrder += 1;
          const copyId = createUniqueRecordId(
            String(copy.id || createLegacyCopyId(legacyId, copyIndex + 1)).slice(0, 220),
            usedCopyIds,
            () => createLegacyCopyId(legacyId, copyIndex + 1)
          );
          copies.push(normalizeCopyRecord({
            ...copy,
            id: copyId,
            issueId,
            displayOrder,
            source: copy.source || (copyIndex === 0 ? "backup-primary" : "backup-copy"),
            legacyComicId: copy.legacyComicId || legacyId,
            createdAt: copy.createdAt || comic.createdAt || createdAt,
            updatedAt: copy.updatedAt || comic.updatedAt || updatedAt
          }, { now }));
        });
        migratedDuplicateCopies += Math.max(0, explicitCopies.length - 1);
        return;
      }

      displayOrder += 1;
      copies.push(normalizeCopyRecord({
        id: createUniqueRecordId(createLegacyCopyId(legacyId, 1), usedCopyIds),
        issueId,
        condition: comic.condition,
        isRead: comic.isRead,
        isSealed: comic.isSealed,
        notes: comic.notes,
        displayOrder,
        source: "legacy-primary",
        legacyComicId: legacyId,
        createdAt: comic.createdAt || createdAt,
        updatedAt: comic.updatedAt || updatedAt
      }, { now }));

      if (comic.isDuplicate) {
        displayOrder += 1;
        migratedDuplicateCopies += 1;
        copies.push(normalizeCopyRecord({
          id: createUniqueRecordId(createLegacyCopyId(legacyId, 2), usedCopyIds),
          issueId,
          condition: comic.duplicateCondition || comic.condition,
          // Das alte Modell speicherte diese Eigenschaften nicht separat für Exemplar 2.
          isRead: false,
          isSealed: false,
          notes: "",
          displayOrder,
          source: "legacy-duplicate",
          legacyComicId: legacyId,
          createdAt: comic.createdAt || createdAt,
          updatedAt: comic.updatedAt || updatedAt
        }, { now }));
      }
    });
  }

  const sortedIssues = issues.sort(compareIssues);
  const sortedCopies = copies.sort(compareCopies);
  const usedSeriesCount = new Set(sortedIssues.map((issue) => issue.seriesId)).size;

  return {
    series: [...seriesById.values()].sort(compareSeries),
    issues: sortedIssues,
    copies: sortedCopies,
    report: {
      modelVersion: ARCHIVE_MODEL_VERSION,
      migratedAt: now,
      legacyComicCount: comics.length,
      issueCount: sortedIssues.length,
      copyCount: sortedCopies.length,
      seriesCount: seriesById.size,
      catalogSeriesCount: seriesById.size,
      usedSeriesCount,
      collapsedLegacyDuplicates,
      migratedDuplicateCopies,
      skippedCount: warnings.length,
      warnings
    }
  };
}

export function materializeLegacyComics(issues, copies, seriesCatalog, {
  dataFormatVersion = APP_CONFIG.dataFormatVersion
} = {}) {
  const seriesById = new Map((Array.isArray(seriesCatalog) ? seriesCatalog : []).map((entry) => [entry.id, entry]));
  const copiesByIssue = new Map();
  (Array.isArray(copies) ? copies : []).forEach((copy) => {
    if (!copiesByIssue.has(copy.issueId)) copiesByIssue.set(copy.issueId, []);
    copiesByIssue.get(copy.issueId).push(copy);
  });

  return (Array.isArray(issues) ? issues : [])
    .map((issue) => {
      const series = seriesById.get(issue.seriesId) || { id: issue.seriesId, name: "Unbekannte Reihe" };
      const issueCopies = (copiesByIssue.get(issue.id) || []).slice().sort(compareCopies);
      const fallbackCopy = normalizeCopyRecord({
        id: `${issue.id}:copy:fallback`,
        issueId: issue.id,
        condition: DEFAULT_CONDITION_CODE,
        displayOrder: 1,
        source: "recovery"
      });
      const primary = issueCopies[0] || fallbackCopy;
      const secondary = issueCopies[1] || null;
      const normalizedCopies = (issueCopies.length ? issueCopies : [fallbackCopy]).map((copy, index) => ({
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
    })
    .sort(compareMaterializedComics);
}

export function legacyComicToArchiveRecords(comic, seriesCatalog, existingCopies = [], {
  now = new Date().toISOString(),
  createId = defaultCreateId,
  dataFormatVersion = APP_CONFIG.dataFormatVersion
} = {}) {
  const catalog = Array.isArray(seriesCatalog) ? seriesCatalog : [];
  const seriesById = new Map(catalog.map((entry) => [entry.id, entry]));
  const lookup = createSeriesLookupMap(catalog);
  const series = resolveSeriesForComic(comic, seriesById, lookup, now);
  const issueId = String(comic.issueId || comic.id || createId("issue")).slice(0, 200);
  const volumeNumber = normalizeVolumeNumber(comic.volumeNumber);
  if (!volumeNumber) throw new Error("Die Bandnummer fehlt.");
  const createdAt = isDateString(comic.createdAt) ? comic.createdAt : now;
  const updatedAt = isDateString(comic.updatedAt) ? comic.updatedAt : now;

  const issue = normalizeIssueRecord({
    id: issueId,
    seriesId: series.id,
    seriesVolumeKey: createIssueIdentityKey(series.id, volumeNumber),
    volumeNumber,
    numericBandNumber: Number.isSafeInteger(comic.numericBandNumber)
      ? comic.numericBandNumber
      : parsePositiveInteger(volumeNumber),
    title: comic.title,
    publicationYear: comic.publicationYear,
    duckipediaPageUrl: comic.duckipediaPageUrl,
    duckipediaCoverUrl: comic.duckipediaCoverUrl,
    duckipediaCoverFileName: comic.duckipediaCoverFileName,
    duckipediaCoverSource: comic.duckipediaCoverSource,
    duckipediaCoverLookupVersion: comic.duckipediaCoverLookupVersion,
    metadataStatus: comic.metadataStatus,
    metadataFetchedAt: comic.metadataFetchedAt,
    legacyComicIds: deduplicateStrings([...(comic.legacyComicIds || []), comic.id].filter(Boolean), 200),
    dataFormatVersion,
    archiveModelVersion: ARCHIVE_MODEL_VERSION,
    createdAt,
    updatedAt
  }, { now, dataFormatVersion });

  const previousCopies = (Array.isArray(existingCopies) ? existingCopies : []).map((entry) => normalizeCopyRecord(entry, { now }));
  let nextCopies;

  if (Array.isArray(comic.copies) && comic.copies.length > 0) {
    nextCopies = comic.copies.map((copy, index) => normalizeCopyRecord({
      ...copy,
      id: copy.id || createId("copy"),
      issueId,
      displayOrder: index + 1,
      updatedAt: copy.updatedAt || updatedAt
    }, { now }));
  } else {
    const primary = normalizeCopyRecord({
      ...(previousCopies[0] || {}),
      id: previousCopies[0]?.id || createId("copy"),
      issueId,
      condition: comic.condition,
      isRead: comic.isRead,
      isSealed: comic.isSealed,
      notes: comic.notes,
      displayOrder: 1,
      updatedAt
    }, { now });
    nextCopies = [primary];

    if (comic.isDuplicate) {
      nextCopies.push(normalizeCopyRecord({
        ...(previousCopies[1] || {}),
        id: previousCopies[1]?.id || createId("copy"),
        issueId,
        condition: comic.duplicateCondition || comic.condition,
        isRead: previousCopies[1]?.isRead ?? comic.isRead,
        isSealed: previousCopies[1]?.isSealed ?? comic.isSealed,
        notes: previousCopies[1]?.notes || "",
        displayOrder: 2,
        updatedAt
      }, { now }));
    } else if (previousCopies.length > 1) {
      // Ein älteres Formular kann zusätzliche Exemplare nicht vollständig darstellen.
      // Bestehende Exemplare bleiben deshalb immer erhalten, solange keine explizite
      // Exemplarliste übergeben wurde.
      nextCopies.push(...previousCopies.slice(1).map((copy, index) => ({ ...copy, issueId, displayOrder: index + 2 })));
    }
  }

  if (nextCopies.length === 0) {
    nextCopies = [normalizeCopyRecord({ id: createId("copy"), issueId, displayOrder: 1 }, { now })];
  }

  return {
    series,
    issue,
    copies: nextCopies.map((copy, index) => ({ ...copy, issueId, displayOrder: index + 1 }))
  };
}

export function normalizeIssueRecord(input, {
  now = new Date().toISOString(),
  dataFormatVersion = APP_CONFIG.dataFormatVersion
} = {}) {
  const source = input && typeof input === "object" ? input : {};
  const id = String(source.id || "").trim().slice(0, 200);
  const seriesId = String(source.seriesId || "").trim().slice(0, 120);
  const volumeNumber = normalizeVolumeNumber(source.volumeNumber);
  if (!id || !seriesId || !volumeNumber) throw new Error("Ausgabe ist unvollständig.");
  const numericBandNumber = Number.isSafeInteger(source.numericBandNumber)
    ? source.numericBandNumber
    : parsePositiveInteger(volumeNumber);
  const publicationYear = Number(source.publicationYear);

  return {
    id,
    seriesId,
    seriesVolumeKey: createIssueIdentityKey(seriesId, volumeNumber),
    volumeNumber,
    numericBandNumber,
    title: String(source.title || "").trim().slice(0, TITLE_LIMIT),
    publicationYear: Number.isInteger(publicationYear) && publicationYear >= 1800 && publicationYear <= APP_CONFIG.publicationYearMaximum
      ? publicationYear
      : null,
    duckipediaPageUrl: normalizeOptionalUrl(source.duckipediaPageUrl),
    duckipediaCoverUrl: normalizeOptionalUrl(source.duckipediaCoverUrl),
    duckipediaCoverFileName: String(source.duckipediaCoverFileName || "").trim().slice(0, 300),
    duckipediaCoverSource: ["infobox-wikitext", "infobox-html", ""].includes(source.duckipediaCoverSource)
      ? source.duckipediaCoverSource
      : "",
    duckipediaCoverLookupVersion: Number.isSafeInteger(Number(source.duckipediaCoverLookupVersion))
      && Number(source.duckipediaCoverLookupVersion) >= 0
      && Number(source.duckipediaCoverLookupVersion) <= 999
      ? Number(source.duckipediaCoverLookupVersion)
      : 0,
    metadataStatus: ["found", "not-found", ""].includes(source.metadataStatus) ? source.metadataStatus : "",
    metadataFetchedAt: isDateString(source.metadataFetchedAt) ? source.metadataFetchedAt : null,
    legacyComicIds: deduplicateStrings(source.legacyComicIds || [], 200),
    dataFormatVersion,
    archiveModelVersion: ARCHIVE_MODEL_VERSION,
    createdAt: isDateString(source.createdAt) ? source.createdAt : now,
    updatedAt: isDateString(source.updatedAt) ? source.updatedAt : now
  };
}

export function normalizeCopyRecord(input, { now = new Date().toISOString() } = {}) {
  const source = input && typeof input === "object" ? input : {};
  const id = String(source.id || "").trim().slice(0, 220);
  const issueId = String(source.issueId || "").trim().slice(0, 200);
  if (!id || !issueId) throw new Error("Exemplar ist unvollständig.");
  const displayOrder = Number(source.displayOrder);
  return {
    id,
    issueId,
    condition: normalizeConditionCode(source.condition, DEFAULT_CONDITION_CODE),
    isRead: Boolean(source.isRead),
    isSealed: Boolean(source.isSealed),
    notes: String(source.notes || "").trim().slice(0, NOTES_LIMIT),
    displayOrder: Number.isSafeInteger(displayOrder) && displayOrder >= 1 ? displayOrder : 1,
    source: String(source.source || "manual").trim().slice(0, 40) || "manual",
    legacyComicId: String(source.legacyComicId || "").trim().slice(0, 200),
    createdAt: isDateString(source.createdAt) ? source.createdAt : now,
    updatedAt: isDateString(source.updatedAt) ? source.updatedAt : now
  };
}

export function validateArchiveGraph({ series = [], issues = [], copies = [] } = {}) {
  const problems = [];
  const seriesIds = new Set();
  const issueIds = new Set();
  const issueKeys = new Set();
  const copyIds = new Set();
  const copiesByIssue = new Map();

  series.forEach((entry, index) => {
    try {
      const normalized = createSeriesDefinition(entry);
      if (seriesIds.has(normalized.id)) problems.push(`Reihen-ID doppelt: ${normalized.id}`);
      seriesIds.add(normalized.id);
    } catch (error) {
      problems.push(`Reihe ${index + 1}: ${error.message}`);
    }
  });

  issues.forEach((entry, index) => {
    try {
      const normalized = normalizeIssueRecord(entry);
      if (issueIds.has(normalized.id)) problems.push(`Ausgaben-ID doppelt: ${normalized.id}`);
      if (issueKeys.has(normalized.seriesVolumeKey)) problems.push(`Ausgabe doppelt: ${normalized.seriesVolumeKey}`);
      if (!seriesIds.has(normalized.seriesId)) problems.push(`Ausgabe ${normalized.id} verweist auf unbekannte Reihe ${normalized.seriesId}.`);
      issueIds.add(normalized.id);
      issueKeys.add(normalized.seriesVolumeKey);
    } catch (error) {
      problems.push(`Ausgabe ${index + 1}: ${error.message}`);
    }
  });

  copies.forEach((entry, index) => {
    try {
      const normalized = normalizeCopyRecord(entry);
      if (copyIds.has(normalized.id)) problems.push(`Exemplar-ID doppelt: ${normalized.id}`);
      if (!issueIds.has(normalized.issueId)) problems.push(`Exemplar ${normalized.id} verweist auf unbekannte Ausgabe ${normalized.issueId}.`);
      copyIds.add(normalized.id);
      copiesByIssue.set(normalized.issueId, (copiesByIssue.get(normalized.issueId) || 0) + 1);
    } catch (error) {
      problems.push(`Exemplar ${index + 1}: ${error.message}`);
    }
  });

  issueIds.forEach((issueId) => {
    if (!copiesByIssue.get(issueId)) problems.push(`Ausgabe ${issueId} besitzt kein Exemplar.`);
  });

  return {
    valid: problems.length === 0,
    problems,
    counts: { series: seriesIds.size, issues: issueIds.size, copies: copyIds.size }
  };
}

export function compareSeries(first, second) {
  const rank = (entry) => entry?.id === "ltb-main" ? 0 : entry?.category === "special" ? 1 : 2;
  return rank(first) - rank(second)
    || String(first?.name || "").localeCompare(String(second?.name || ""), "de", { sensitivity: "base", numeric: true });
}

export function compareIssues(first, second) {
  return String(first?.seriesId || "").localeCompare(String(second?.seriesId || ""), "de")
    || compareVolumeNumbers(first?.volumeNumber, second?.volumeNumber)
    || String(first?.id || "").localeCompare(String(second?.id || ""));
}

export function compareCopies(first, second) {
  return Number(first?.displayOrder || 0) - Number(second?.displayOrder || 0)
    || String(first?.createdAt || "").localeCompare(String(second?.createdAt || ""))
    || String(first?.id || "").localeCompare(String(second?.id || ""));
}

function compareMaterializedComics(first, second) {
  return String(first.series || "").localeCompare(String(second.series || ""), "de", { sensitivity: "base" })
    || compareVolumeNumbers(first.volumeNumber, second.volumeNumber);
}

function compareVolumeNumbers(first, second) {
  const firstNumeric = parsePositiveInteger(first);
  const secondNumeric = parsePositiveInteger(second);
  if (firstNumeric !== null && secondNumeric !== null) return firstNumeric - secondNumeric;
  if (firstNumeric !== null) return -1;
  if (secondNumeric !== null) return 1;
  return String(first || "").localeCompare(String(second || ""), "de", { numeric: true, sensitivity: "base" });
}

function resolveSeriesForComic(comic, seriesById, seriesByLookup, now) {
  const preferredId = String(comic?.seriesId || "").trim();
  if (preferredId && seriesById.has(preferredId)) return seriesById.get(preferredId);
  const name = String(comic?.series || "Sonstige").trim() || "Sonstige";
  const lookup = normalizeSeriesLookup(name);
  const knownId = seriesByLookup.get(lookup);
  if (knownId && seriesById.has(knownId)) return seriesById.get(knownId);
  const created = createSeriesDefinition({ id: preferredId || createCustomSeriesId(name), name, isSystem: false }, { now });
  return created;
}

function createSeriesLookupMap(series) {
  const map = new Map();
  series.forEach((entry) => updateSeriesLookupMap(map, entry));
  return map;
}

function updateSeriesLookupMap(map, entry) {
  [entry?.name, ...(entry?.aliases || [])].forEach((name) => {
    const key = normalizeSeriesLookup(name);
    if (key) map.set(key, entry.id);
  });
}

function compareLegacyComics(first, second) {
  return String(first?.comic?.createdAt || "").localeCompare(String(second?.comic?.createdAt || ""))
    || first.index - second.index;
}

function selectPreferredLegacyComic(comics) {
  return comics.slice().sort((first, second) => {
    const firstScore = legacyMetadataScore(first);
    const secondScore = legacyMetadataScore(second);
    return secondScore - firstScore
      || String(second?.updatedAt || "").localeCompare(String(first?.updatedAt || ""));
  })[0] || {};
}

function legacyMetadataScore(comic) {
  return Number(Boolean(comic?.title)) * 4
    + Number(Boolean(comic?.publicationYear)) * 2
    + Number(Boolean(comic?.duckipediaPageUrl)) * 2
    + Number(Boolean(comic?.duckipediaCoverUrl));
}

function createLegacyCopyId(legacyId, position) {
  return `${String(legacyId || "legacy").slice(0, 180)}:copy:${position}`;
}

function createDeterministicIssueId(seriesId, volumeNumber) {
  return `issue-${hashString(createIssueIdentityKey(seriesId, volumeNumber))}`;
}

function createUniqueRecordId(candidate, usedIds, fallbackFactory = () => "record", maximumLength = 220) {
  const base = String(candidate || fallbackFactory() || "record").trim() || "record";
  let value = base.slice(0, maximumLength);
  let suffix = 2;
  while (usedIds.has(value)) {
    const suffixText = `-${suffix}`;
    value = `${base.slice(0, Math.max(1, maximumLength - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
  usedIds.add(value);
  return value;
}

function defaultCreateId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parsePositiveInteger(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed <= 99999 ? parsed : null;
}

function deduplicateStrings(values, maxLength = 200) {
  const result = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim().slice(0, maxLength);
    if (!normalized) return;
    const key = normalizeSeriesLookup(normalized) || normalized;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function earliestDate(values) {
  return (Array.isArray(values) ? values : [])
    .filter(isDateString)
    .sort()[0] || null;
}

function latestDate(values) {
  return (Array.isArray(values) ? values : [])
    .filter(isDateString)
    .sort()
    .at(-1) || null;
}

function isDateString(value) {
  return typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value));
}

function normalizeOptionalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href.slice(0, 1000) : "";
  } catch {
    return "";
  }
}

// UI- und Kompatibilitätshelfer für die schrittweise Umstellung der bestehenden App.
export function createEntityId(prefix = "entity") {
  return defaultCreateId(String(prefix || "entity").replace(/[^a-z0-9-]/gi, "-").toLowerCase());
}

export function normalizeCopy(input, { issueId = "", position = 1, now = new Date().toISOString() } = {}) {
  const source = input && typeof input === "object" ? input : {};
  return normalizeCopyRecord({
    ...source,
    id: source.id || createEntityId("copy"),
    issueId: source.issueId || issueId,
    displayOrder: Number(source.displayOrder) || position
  }, { now });
}

export function getComicCopies(comic, { now = new Date().toISOString() } = {}) {
  const source = comic && typeof comic === "object" ? comic : {};
  const issueId = String(source.issueId || source.id || createEntityId("issue")).slice(0, 200);
  const existing = Array.isArray(source.copies) ? source.copies : [];

  if (existing.length > 0) {
    return existing
      .map((copy, index) => normalizeCopy({ ...copy, issueId }, { issueId, position: index + 1, now }))
      .sort(compareCopies)
      .map((copy, index) => ({ ...copy, displayOrder: index + 1 }));
  }

  const primary = normalizeCopy({
    id: `${issueId}:copy:1`,
    issueId,
    condition: source.condition,
    isRead: source.isRead,
    isSealed: source.isSealed,
    notes: source.notes,
    displayOrder: 1,
    source: "legacy-primary",
    legacyComicId: source.id,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  }, { issueId, position: 1, now });

  if (!source.isDuplicate) return [primary];

  const secondary = normalizeCopy({
    id: `${issueId}:copy:2`,
    issueId,
    condition: source.duplicateCondition || source.condition,
    // Das alte Datenmodell kannte diese Angaben für Exemplar 2 nicht separat.
    isRead: false,
    isSealed: false,
    notes: "",
    displayOrder: 2,
    source: "legacy-duplicate",
    legacyComicId: source.id,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  }, { issueId, position: 2, now });

  return [primary, secondary];
}

export function countPhysicalCopies(comics) {
  return (Array.isArray(comics) ? comics : []).reduce(
    (total, comic) => total + getComicCopies(comic).length,
    0
  );
}

export function mergeFormValuesIntoCopies(existingComic, formComic, { now = new Date().toISOString() } = {}) {
  const issueId = String(formComic?.issueId || formComic?.id || existingComic?.issueId || existingComic?.id || createEntityId("issue")).slice(0, 200);
  const existingCopies = existingComic ? getComicCopies(existingComic, { now }) : [];
  const primary = normalizeCopy({
    ...(existingCopies[0] || {}),
    id: existingCopies[0]?.id || createEntityId("copy"),
    issueId,
    condition: formComic?.condition,
    isRead: formComic?.isRead,
    isSealed: formComic?.isSealed,
    notes: formComic?.notes,
    displayOrder: 1,
    source: existingCopies[0]?.source || "manual",
    createdAt: existingCopies[0]?.createdAt || formComic?.createdAt || now,
    updatedAt: formComic?.updatedAt || now
  }, { issueId, position: 1, now });

  const copies = [primary];
  const wantsInitialDuplicate = Boolean(formComic?.isDuplicate);

  if (wantsInitialDuplicate) {
    copies.push(normalizeCopy({
      ...(existingCopies[1] || {}),
      id: existingCopies[1]?.id || createEntityId("copy"),
      issueId,
      condition: formComic?.duplicateCondition || formComic?.condition,
      isRead: existingCopies[1]?.isRead || false,
      isSealed: existingCopies[1]?.isSealed || false,
      notes: existingCopies[1]?.notes || "",
      displayOrder: 2,
      source: existingCopies[1]?.source || "manual",
      createdAt: existingCopies[1]?.createdAt || formComic?.createdAt || now,
      updatedAt: formComic?.updatedAt || now
    }, { issueId, position: 2, now }));
  }

  // Das kompakte Hauptformular darf vorhandene zusätzliche Exemplare nie verlieren.
  // Ist „Doppelt“ aktiviert, wurde Exemplar 2 bereits oben aktualisiert; alle
  // weiteren Exemplare werden ab Position 3 unverändert angehängt. Ist der
  // Schalter nicht aktiv, bleiben sämtliche vorhandenen Exemplare ab Position 2
  // erhalten und können ausschließlich im Exemplarmanager entfernt werden.
  if (wantsInitialDuplicate && existingCopies.length > 2) {
    copies.push(...existingCopies.slice(2).map((copy, index) => normalizeCopy({
      ...copy,
      issueId,
      displayOrder: index + 3
    }, { issueId, position: index + 3, now })));
  } else if (!wantsInitialDuplicate && existingCopies.length > 1 && existingComic) {
    copies.push(...existingCopies.slice(1).map((copy, index) => normalizeCopy({
      ...copy,
      issueId,
      displayOrder: index + 2
    }, { issueId, position: index + 2, now })));
  }

  return copies.map((copy, index) => ({ ...copy, displayOrder: index + 1 }));
}

export function createCopyFingerprint(copy) {
  const source = copy && typeof copy === "object" ? copy : {};
  return JSON.stringify([
    normalizeConditionCode(source.condition, DEFAULT_CONDITION_CODE),
    Boolean(source.isRead),
    Boolean(source.isSealed),
    String(source.notes || "").trim().toLocaleLowerCase("de")
  ]);
}

export function mergeCopyLists(existingCopies, importedCopies, { issueId = "", now = new Date().toISOString() } = {}) {
  const result = [];
  const indexById = new Map();

  const addOrUpdate = (copy, sourceLabel) => {
    const normalized = normalizeCopy({
      ...copy,
      id: copy?.id || createEntityId("copy"),
      issueId: issueId || copy?.issueId || "",
      source: copy?.source || sourceLabel,
      updatedAt: copy?.updatedAt || now
    }, {
      issueId: issueId || copy?.issueId || "",
      position: result.length + 1,
      now
    });

    const existingIndex = indexById.get(normalized.id);
    if (existingIndex !== undefined) {
      const previous = result[existingIndex];
      const previousTime = Date.parse(previous.updatedAt || "") || 0;
      const nextTime = Date.parse(normalized.updatedAt || "") || 0;
      if (nextTime > previousTime) result[existingIndex] = { ...normalized, displayOrder: existingIndex + 1 };
      return false;
    }

    indexById.set(normalized.id, result.length);
    result.push({ ...normalized, displayOrder: result.length + 1 });
    return true;
  };

  (Array.isArray(existingCopies) ? existingCopies : []).forEach((copy) => addOrUpdate(copy, "existing"));
  (Array.isArray(importedCopies) ? importedCopies : []).forEach((copy) => addOrUpdate(copy, "import"));
  return result.map((copy, index) => ({ ...copy, displayOrder: index + 1 }));
}
