import {
  APP_CONFIG,
  ARCHIVE_MODEL_VERSION,
  DEFAULT_CONDITION_CODE,
  DEFAULT_SETTINGS,
  normalizeConditionCode,
  normalizeDuckipediaPattern
} from "./config.js";
import {
  normalizeKnownReleaseSignatures,
  normalizeReleaseDecisionMap,
  normalizeReleaseEventLinks,
  normalizeReleaseSeriesAliases,
  RELEASE_RADAR_FILTERS
} from "./release-radar.js";
import {
  buildSeriesCatalog,
  createCustomSeriesId,
  createSeriesDefinition,
  legacyComicToArchiveRecords,
  materializeLegacyComics,
  migrateLegacyComicsToArchive,
  validateArchiveGraph
} from "./archive-model.js";

const DATABASE_NAME = resolveDatabaseName();
const STORAGE_MODE = DATABASE_NAME.endsWith("-test") ? "test" : "production";
const DATABASE_VERSION = 5;
const COMICS_STORE = "comics";
const SETTINGS_STORE = "settings";
const COVER_STORE = "coverMedia";
const METADATA_STORE = "metadataCache";
const SERIES_STORE = "seriesCatalog";
const ISSUES_STORE = "issues";
const COPIES_STORE = "copies";
const ARCHIVE_META_STORE = "archiveMeta";
const MIGRATION_SNAPSHOT_STORE = "migrationSnapshots";
const ARCHIVE_CORE_META_KEY = "archive-core";
const SETTINGS_KEY = "app";

let databasePromise;
let archiveCorePromise;

export function getStorageMode() {
  return STORAGE_MODE;
}

export function getDatabaseName() {
  return DATABASE_NAME;
}

export function getDatabaseVersion() {
  return DATABASE_VERSION;
}

function resolveDatabaseName() {
  try {
    const search = globalThis.location?.search || "";
    return new URLSearchParams(search).get("testmode") === "1"
      ? "comicarchiv-db-test"
      : "comicarchiv-db";
  } catch {
    return "comicarchiv-db";
  }
}

function createDatabaseConnection() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Dieser Browser unterstützt die benötigte lokale Datenbank nicht."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(COMICS_STORE)) {
        const store = database.createObjectStore(COMICS_STORE, { keyPath: "id" });
        store.createIndex("series", "series", { unique: false });
        store.createIndex("numericBandNumber", "numericBandNumber", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(COVER_STORE)) {
        const coverStore = database.createObjectStore(COVER_STORE, { keyPath: "comicId" });
        coverStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: "key" });
        metadataStore.createIndex("fetchedAt", "fetchedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(SERIES_STORE)) {
        const seriesStore = database.createObjectStore(SERIES_STORE, { keyPath: "id" });
        seriesStore.createIndex("name", "name", { unique: false });
        seriesStore.createIndex("category", "category", { unique: false });
        seriesStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(ISSUES_STORE)) {
        const issueStore = database.createObjectStore(ISSUES_STORE, { keyPath: "id" });
        issueStore.createIndex("seriesId", "seriesId", { unique: false });
        issueStore.createIndex("seriesVolumeKey", "seriesVolumeKey", { unique: true });
        issueStore.createIndex("numericBandNumber", "numericBandNumber", { unique: false });
        issueStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(COPIES_STORE)) {
        const copyStore = database.createObjectStore(COPIES_STORE, { keyPath: "id" });
        copyStore.createIndex("issueId", "issueId", { unique: false });
        copyStore.createIndex("condition", "condition", { unique: false });
        copyStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(ARCHIVE_META_STORE)) {
        database.createObjectStore(ARCHIVE_META_STORE, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(MIGRATION_SNAPSHOT_STORE)) {
        const snapshotStore = database.createObjectStore(MIGRATION_SNAPSHOT_STORE, { keyPath: "id" });
        snapshotStore.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
        archiveCorePromise = undefined;
      };
      resolve(database);
    };

    request.onerror = () => reject(request.error || new Error("Die lokale Datenbank konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Die Datenbank-Aktualisierung ist blockiert. Bitte schließe andere geöffnete Entenarchiv-Fenster."));
  });
}

function getDatabase() {
  if (!databasePromise) {
    databasePromise = createDatabaseConnection().catch((error) => {
      databasePromise = undefined;
      archiveCorePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Die Speicheroperation ist fehlgeschlagen."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Die Speichertransaktion ist fehlgeschlagen."));
    transaction.onabort = () => reject(transaction.error || new Error("Die Speichertransaktion wurde abgebrochen."));
  });
}

async function readAll(database, storeName) {
  const transaction = database.transaction(storeName, "readonly");
  const records = await requestToPromise(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return records;
}

async function readRecord(database, storeName, key) {
  const transaction = database.transaction(storeName, "readonly");
  const record = await requestToPromise(transaction.objectStore(storeName).get(key));
  await transactionDone(transaction);
  return record || null;
}

async function readSettingsValue(database) {
  const transaction = database.transaction(SETTINGS_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(SETTINGS_STORE).get(SETTINGS_KEY));
  await transactionDone(transaction);
  return record?.value || {};
}

async function readIssueByIdentity(database, seriesVolumeKey) {
  if (!seriesVolumeKey) return null;
  const transaction = database.transaction(ISSUES_STORE, "readonly");
  const record = await requestToPromise(
    transaction.objectStore(ISSUES_STORE).index("seriesVolumeKey").get(seriesVolumeKey)
  );
  await transactionDone(transaction);
  return record || null;
}

async function readArchiveMeta(database) {
  const transaction = database.transaction(ARCHIVE_META_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(ARCHIVE_META_STORE).get(ARCHIVE_CORE_META_KEY));
  await transactionDone(transaction);
  return record || null;
}

async function writeArchiveMeta(database, meta) {
  const transaction = database.transaction(ARCHIVE_META_STORE, "readwrite");
  transaction.objectStore(ARCHIVE_META_STORE).put({ key: ARCHIVE_CORE_META_KEY, ...meta });
  await transactionDone(transaction);
}

async function getLatestMigrationSnapshotRecord(database) {
  const transaction = database.transaction(MIGRATION_SNAPSHOT_STORE, "readonly");
  const records = await requestToPromise(transaction.objectStore(MIGRATION_SNAPSHOT_STORE).getAll());
  await transactionDone(transaction);
  return records.sort((first, second) => Date.parse(second.createdAt || 0) - Date.parse(first.createdAt || 0))[0] || null;
}

async function ensureArchiveCoreReady() {
  if (!archiveCorePromise) {
    archiveCorePromise = migrateArchiveCore().catch((error) => ({
      ready: false,
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  return archiveCorePromise;
}

async function migrateArchiveCore() {
  const database = await getDatabase();
  const existingMeta = await readArchiveMeta(database);
  if (existingMeta?.status === "complete" && existingMeta.archiveModelVersion === ARCHIVE_MODEL_VERSION) {
    return { ready: true, justMigrated: false, ...existingMeta };
  }

  const startedAt = new Date().toISOString();
  await writeArchiveMeta(database, {
    archiveModelVersion: ARCHIVE_MODEL_VERSION,
    status: "running",
    startedAt,
    completedAt: null,
    error: ""
  });

  try {
    const [legacyComics, settings, existingSeries, existingSnapshot, existingCovers] = await Promise.all([
      readAll(database, COMICS_STORE),
      readSettingsValue(database),
      readAll(database, SERIES_STORE),
      getLatestMigrationSnapshotRecord(database),
      readAll(database, COVER_STORE)
    ]);
    const catalog = buildSeriesCatalog({ legacyComics, settings, existingSeries });
    const migration = migrateLegacyComicsToArchive(legacyComics, catalog.series, {
      dataFormatVersion: APP_CONFIG.dataFormatVersion
    });
    if (migration.report.skippedCount > 0) {
      throw new Error(
        `Die Umstellung wurde vorsorglich abgebrochen, weil ${migration.report.skippedCount} Eintrag${migration.report.skippedCount === 1 ? "" : "e"} nicht sicher zugeordnet werden konnte${migration.report.skippedCount === 1 ? "" : "n"}. `
        + "Die bisherige Sammlung bleibt unverändert und kann über den sicheren Modus exportiert werden."
      );
    }
    const graph = validateArchiveGraph(migration);
    if (!graph.valid) {
      throw new Error(`Der neue Archivkern konnte nicht validiert werden: ${graph.problems.slice(0, 3).join(" ")}`);
    }

    const materialized = materializeLegacyComics(migration.issues, migration.copies, migration.series);
    const issueIdByLegacyId = new Map();
    migration.issues.forEach((issue) => {
      [issue.id, ...(issue.legacyComicIds || [])].forEach((legacyId) => {
        if (legacyId) issueIdByLegacyId.set(String(legacyId), issue.id);
      });
    });
    const remappedCoverByIssue = new Map();
    let remappedCovers = 0;
    existingCovers.forEach((cover) => {
      const originalId = String(cover?.comicId || "");
      if (!originalId) return;
      const targetId = issueIdByLegacyId.get(originalId) || originalId;
      if (targetId !== originalId) remappedCovers += 1;
      const candidate = { ...cover, comicId: targetId };
      const previous = remappedCoverByIssue.get(targetId);
      const candidateTime = Date.parse(candidate.updatedAt || "") || 0;
      const previousTime = Date.parse(previous?.updatedAt || "") || 0;
      if (!previous || candidateTime >= previousTime) remappedCoverByIssue.set(targetId, candidate);
    });
    migration.report.remappedCovers = remappedCovers;

    const completedAt = new Date().toISOString();
    const transaction = database.transaction(
      [SERIES_STORE, ISSUES_STORE, COPIES_STORE, COMICS_STORE, COVER_STORE, ARCHIVE_META_STORE, MIGRATION_SNAPSHOT_STORE],
      "readwrite"
    );
    const seriesStore = transaction.objectStore(SERIES_STORE);
    const issueStore = transaction.objectStore(ISSUES_STORE);
    const copyStore = transaction.objectStore(COPIES_STORE);
    const legacyStore = transaction.objectStore(COMICS_STORE);
    const coverStore = transaction.objectStore(COVER_STORE);
    seriesStore.clear();
    issueStore.clear();
    copyStore.clear();
    legacyStore.clear();
    coverStore.clear();
    migration.series.forEach((record) => seriesStore.put(record));
    migration.issues.forEach((record) => issueStore.put(record));
    migration.copies.forEach((record) => copyStore.put(record));
    materialized.forEach((record) => legacyStore.put(record));
    remappedCoverByIssue.forEach((record) => coverStore.put(record));

    if (!existingSnapshot) {
      transaction.objectStore(MIGRATION_SNAPSHOT_STORE).put({
        id: `pre-archive-core-${completedAt.replace(/[^0-9]/g, "")}`,
        kind: "pre-archive-core",
        createdAt: completedAt,
        sourceDatabaseVersion: 4,
        sourceDataFormatVersion: Math.max(1, ...legacyComics.map((comic) => Number(comic?.dataFormatVersion) || 1)),
        comics: legacyComics,
        settings
      });
    }

    const meta = {
      key: ARCHIVE_CORE_META_KEY,
      archiveModelVersion: ARCHIVE_MODEL_VERSION,
      status: "complete",
      startedAt,
      completedAt,
      report: migration.report,
      counts: graph.counts,
      error: ""
    };
    transaction.objectStore(ARCHIVE_META_STORE).put(meta);
    await transactionDone(transaction);

    const counts = await getCoreStoreCounts(database);
    if (counts.issues !== migration.report.issueCount || counts.copies !== migration.report.copyCount) {
      throw new Error(`Migrationsprüfung fehlgeschlagen: ${counts.issues} Ausgaben und ${counts.copies} Exemplare wurden gespeichert.`);
    }

    return { ready: true, justMigrated: true, ...meta, counts };
  } catch (error) {
    await writeArchiveMeta(database, {
      archiveModelVersion: ARCHIVE_MODEL_VERSION,
      status: "failed",
      startedAt,
      completedAt: null,
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => {});
    throw error;
  }
}

async function getCoreStoreCounts(database) {
  const transaction = database.transaction([SERIES_STORE, ISSUES_STORE, COPIES_STORE], "readonly");
  const [series, issues, copies] = await Promise.all([
    requestToPromise(transaction.objectStore(SERIES_STORE).count()),
    requestToPromise(transaction.objectStore(ISSUES_STORE).count()),
    requestToPromise(transaction.objectStore(COPIES_STORE).count())
  ]);
  await transactionDone(transaction);
  return { series, issues, copies };
}

async function readArchiveGraph(database) {
  const transaction = database.transaction([SERIES_STORE, ISSUES_STORE, COPIES_STORE], "readonly");
  const [series, issues, copies] = await Promise.all([
    requestToPromise(transaction.objectStore(SERIES_STORE).getAll()),
    requestToPromise(transaction.objectStore(ISSUES_STORE).getAll()),
    requestToPromise(transaction.objectStore(COPIES_STORE).getAll())
  ]);
  await transactionDone(transaction);
  return { series, issues, copies };
}

export async function getArchiveGraph() {
  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  if (!core.ready) return null;
  return readArchiveGraph(database);
}

export async function getArchiveCoreStatus() {
  const database = await getDatabase();
  const result = await ensureArchiveCoreReady();
  const meta = await readArchiveMeta(database).catch(() => null);
  const counts = result.ready
    ? await getCoreStoreCounts(database).catch(() => ({ series: 0, issues: 0, copies: 0 }))
    : null;
  const snapshot = await getLatestMigrationSnapshotRecord(database).catch(() => null);
  return {
    ready: Boolean(result.ready),
    justMigrated: Boolean(result.justMigrated),
    archiveModelVersion: meta?.archiveModelVersion || ARCHIVE_MODEL_VERSION,
    status: meta?.status || result.status || "unknown",
    startedAt: meta?.startedAt || null,
    completedAt: meta?.completedAt || null,
    counts: counts || meta?.counts || null,
    report: meta?.report || null,
    warnings: Array.isArray(meta?.report?.warnings) ? meta.report.warnings : [],
    error: meta?.error || result.error || "",
    hasRollbackSnapshot: Boolean(snapshot),
    rollbackSnapshotCreatedAt: snapshot?.createdAt || null
  };
}

export async function getLatestMigrationSnapshot() {
  const database = await getDatabase();
  return getLatestMigrationSnapshotRecord(database);
}

export async function restoreLatestMigrationSnapshot() {
  const database = await getDatabase();
  const snapshot = await getLatestMigrationSnapshotRecord(database);
  if (!snapshot || !Array.isArray(snapshot.comics)) {
    throw new Error("Es ist kein alter Datenstand für eine Wiederherstellung vorhanden.");
  }
  await replaceAllComics(snapshot.comics);
  if (snapshot.settings && typeof snapshot.settings === "object") await saveAppSettings(snapshot.settings);
  return { comics: snapshot.comics.length, createdAt: snapshot.createdAt };
}

export async function getAllComics() {
  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  if (!core.ready) return readAll(database, COMICS_STORE);
  try {
    const graph = await readArchiveGraph(database);
    return materializeLegacyComics(graph.issues, graph.copies, graph.series);
  } catch (error) {
    console.warn("Archivkern konnte nicht gelesen werden; Legacy-Speicher wird verwendet:", error);
    return readAll(database, COMICS_STORE);
  }
}

export async function saveComic(comic) {
  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  if (!core.ready) {
    const transaction = database.transaction(COMICS_STORE, "readwrite");
    transaction.objectStore(COMICS_STORE).put(comic);
    await transactionDone(transaction);
    return comic;
  }

  const [settings, existingSeries] = await Promise.all([
    readSettingsValue(database),
    readAll(database, SERIES_STORE)
  ]);
  const catalog = buildSeriesCatalog({ legacyComics: [comic], settings, existingSeries });
  const firstPass = legacyComicToArchiveRecords(comic, catalog.series, [], {
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  });
  const identityMatch = await readIssueByIdentity(database, firstPass.issue.seriesVolumeKey);
  const requestedIssueId = String(comic.issueId || comic.id || firstPass.issue.id);
  const targetIssueId = identityMatch?.id || requestedIssueId;
  const sourceIssueId = requestedIssueId;
  const previousCopies = await readCopiesForIssue(database, targetIssueId);
  const sourceCopies = sourceIssueId !== targetIssueId
    ? await readCopiesForIssue(database, sourceIssueId)
    : [];
  const isAdditionalLegacyEntry = Boolean(identityMatch && sourceIssueId !== identityMatch.id);
  const [sourceCover, targetCover] = sourceIssueId !== targetIssueId
    ? await Promise.all([
        readRecord(database, COVER_STORE, sourceIssueId),
        readRecord(database, COVER_STORE, targetIssueId)
      ])
    : [null, null];

  let records = legacyComicToArchiveRecords({
    ...comic,
    id: targetIssueId,
    issueId: targetIssueId,
    seriesId: firstPass.series.id,
    createdAt: identityMatch?.createdAt || comic.createdAt
  }, catalog.series, isAdditionalLegacyEntry ? [] : previousCopies, {
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  });

  if (identityMatch) {
    records.issue = {
      ...identityMatch,
      ...records.issue,
      id: identityMatch.id,
      createdAt: identityMatch.createdAt || records.issue.createdAt,
      title: records.issue.title || identityMatch.title || "",
      publicationYear: records.issue.publicationYear ?? identityMatch.publicationYear ?? null,
      duckipediaPageUrl: records.issue.duckipediaPageUrl || identityMatch.duckipediaPageUrl || "",
      duckipediaCoverUrl: records.issue.duckipediaCoverUrl || identityMatch.duckipediaCoverUrl || "",
      duckipediaCoverFileName: records.issue.duckipediaCoverFileName || identityMatch.duckipediaCoverFileName || "",
      duckipediaCoverSource: records.issue.duckipediaCoverSource || identityMatch.duckipediaCoverSource || "",
      duckipediaCoverLookupVersion: Math.max(
        Number(records.issue.duckipediaCoverLookupVersion || 0),
        Number(identityMatch.duckipediaCoverLookupVersion || 0)
      ),
      legacyComicIds: [...new Set([
        ...(identityMatch.legacyComicIds || []),
        ...(records.issue.legacyComicIds || []),
        requestedIssueId
      ].filter(Boolean))]
    };

    if (isAdditionalLegacyEntry) {
      const incomingCopies = records.copies.map((copy, index) => ({
        ...copy,
        id: previousCopies.some((existing) => existing.id === copy.id) ? `${copy.id}-${Date.now()}-${index + 1}` : copy.id,
        issueId: identityMatch.id,
        displayOrder: previousCopies.length + index + 1
      }));
      records.copies = [
        ...previousCopies.map((copy, index) => ({ ...copy, issueId: identityMatch.id, displayOrder: index + 1 })),
        ...incomingCopies
      ];
    } else {
      records.copies = records.copies.map((copy, index) => ({
        ...copy,
        issueId: identityMatch.id,
        displayOrder: index + 1
      }));
    }
  }

  const projected = materializeLegacyComics([records.issue], records.copies, [records.series])[0];
  const oldCopyIds = [...new Set([
    ...previousCopies.map((copy) => copy.id),
    ...sourceCopies.map((copy) => copy.id)
  ])];
  const stores = [SERIES_STORE, ISSUES_STORE, COPIES_STORE, COMICS_STORE];
  if (sourceIssueId !== targetIssueId) stores.push(COVER_STORE);
  const transaction = database.transaction(stores, "readwrite");
  const copiesStore = transaction.objectStore(COPIES_STORE);
  const issuesStore = transaction.objectStore(ISSUES_STORE);
  const legacyStore = transaction.objectStore(COMICS_STORE);
  transaction.objectStore(SERIES_STORE).put(records.series);
  if (sourceIssueId !== targetIssueId) issuesStore.delete(sourceIssueId);
  issuesStore.put(records.issue);
  oldCopyIds.forEach((copyId) => copiesStore.delete(copyId));
  records.copies.forEach((copy) => copiesStore.put(copy));
  legacyStore.put(projected);
  if (sourceIssueId !== projected.id) legacyStore.delete(sourceIssueId);

  if (sourceIssueId !== targetIssueId) {
    const coverStore = transaction.objectStore(COVER_STORE);
    if (sourceCover) {
      const sourceIsNewer = Date.parse(sourceCover.updatedAt || 0) > Date.parse(targetCover?.updatedAt || 0);
      if (!targetCover || sourceIsNewer) coverStore.put({ ...sourceCover, comicId: targetIssueId });
      coverStore.delete(sourceIssueId);
    }
  }

  await transactionDone(transaction);
  return projected;
}

export async function deleteComic(id) {
  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  const copyIds = core.ready
    ? (await readCopiesForIssue(database, id)).map((copy) => copy.id)
    : [];
  const stores = [COMICS_STORE, COVER_STORE];
  if (core.ready) stores.push(ISSUES_STORE, COPIES_STORE);
  const transaction = database.transaction(stores, "readwrite");
  transaction.objectStore(COMICS_STORE).delete(id);
  transaction.objectStore(COVER_STORE).delete(id);
  if (core.ready) {
    transaction.objectStore(ISSUES_STORE).delete(id);
    const copyStore = transaction.objectStore(COPIES_STORE);
    copyIds.forEach((copyId) => copyStore.delete(copyId));
  }
  await transactionDone(transaction);
}

export async function replaceAllComics(comics) {
  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  if (!core.ready) {
    const transaction = database.transaction(COMICS_STORE, "readwrite");
    const store = transaction.objectStore(COMICS_STORE);
    store.clear();
    comics.forEach((comic) => store.put(comic));
    await transactionDone(transaction);
    return;
  }

  const [settings, existingSeries, existingMeta] = await Promise.all([
    readSettingsValue(database),
    readAll(database, SERIES_STORE),
    readArchiveMeta(database).catch(() => null)
  ]);
  const catalog = buildSeriesCatalog({ legacyComics: comics, settings, existingSeries });
  const migration = migrateLegacyComicsToArchive(comics, catalog.series, {
    dataFormatVersion: APP_CONFIG.dataFormatVersion
  });
  if (migration.report.skippedCount > 0) {
    throw new Error(`${migration.report.skippedCount} Eintrag${migration.report.skippedCount === 1 ? "" : "e"} konnte${migration.report.skippedCount === 1 ? "" : "n"} nicht sicher in den Archivkern übernommen werden.`);
  }
  const graphValidation = validateArchiveGraph(migration);
  if (!graphValidation.valid) throw new Error(graphValidation.problems.slice(0, 5).join(" "));
  const projected = materializeLegacyComics(migration.issues, migration.copies, migration.series);

  const transaction = database.transaction(
    [SERIES_STORE, ISSUES_STORE, COPIES_STORE, COMICS_STORE, ARCHIVE_META_STORE],
    "readwrite"
  );
  const seriesStore = transaction.objectStore(SERIES_STORE);
  const issueStore = transaction.objectStore(ISSUES_STORE);
  const copyStore = transaction.objectStore(COPIES_STORE);
  const legacyStore = transaction.objectStore(COMICS_STORE);
  seriesStore.clear();
  issueStore.clear();
  copyStore.clear();
  legacyStore.clear();
  migration.series.forEach((record) => seriesStore.put(record));
  migration.issues.forEach((record) => issueStore.put(record));
  migration.copies.forEach((record) => copyStore.put(record));
  projected.forEach((record) => legacyStore.put(record));
  const rebuiltAt = new Date().toISOString();
  transaction.objectStore(ARCHIVE_META_STORE).put({
    key: ARCHIVE_CORE_META_KEY,
    archiveModelVersion: ARCHIVE_MODEL_VERSION,
    status: "complete",
    startedAt: existingMeta?.startedAt || rebuiltAt,
    completedAt: existingMeta?.completedAt || rebuiltAt,
    lastRebuiltAt: rebuiltAt,
    report: existingMeta?.report || migration.report,
    lastRebuildReport: migration.report,
    counts: graphValidation.counts,
    error: ""
  });
  await transactionDone(transaction);
}

export async function saveSeriesDefinition(definition) {
  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  if (!core.ready) return null;
  const normalized = createSeriesDefinition(definition);
  const transaction = database.transaction(SERIES_STORE, "readwrite");
  transaction.objectStore(SERIES_STORE).put(normalized);
  await transactionDone(transaction);
  return normalized;
}

export async function removeSeriesDefinition(seriesId) {
  const normalizedId = String(seriesId || "").trim();
  if (!normalizedId) return { removed: false, archived: false, issueCount: 0 };

  const database = await getDatabase();
  const core = await ensureArchiveCoreReady();
  if (!core.ready) return { removed: false, archived: false, issueCount: 0 };

  const [series, issueCount] = await Promise.all([
    readRecord(database, SERIES_STORE, normalizedId),
    new Promise((resolve, reject) => {
      const readTransaction = database.transaction(ISSUES_STORE, "readonly");
      const request = readTransaction.objectStore(ISSUES_STORE).index("seriesId").count(IDBKeyRange.only(normalizedId));
      request.onsuccess = () => resolve(Number(request.result || 0));
      request.onerror = () => reject(request.error || new Error("Reihennutzung konnte nicht geprüft werden."));
    })
  ]);

  if (series) {
    const transaction = database.transaction(SERIES_STORE, "readwrite");
    const seriesStore = transaction.objectStore(SERIES_STORE);
    if (issueCount > 0) {
      seriesStore.put({ ...series, isArchived: true, updatedAt: new Date().toISOString() });
    } else {
      seriesStore.delete(normalizedId);
    }
    await transactionDone(transaction);
  }
  return { removed: Boolean(series && issueCount === 0), archived: Boolean(series && issueCount > 0), issueCount };
}

export async function upsertComics(comics) {
  for (const comic of comics) await saveComic(comic);
}

async function readCopiesForIssue(database, issueId) {
  if (!issueId) return [];
  const transaction = database.transaction(COPIES_STORE, "readonly");
  const records = await requestToPromise(
    transaction.objectStore(COPIES_STORE).index("issueId").getAll(IDBKeyRange.only(issueId))
  );
  await transactionDone(transaction);
  return records;
}


export async function getAppSettings() {
  const database = await getDatabase();
  const transaction = database.transaction(SETTINGS_STORE, "readonly");
  const storedRecord = await requestToPromise(
    transaction.objectStore(SETTINGS_STORE).get(SETTINGS_KEY)
  );
  await transactionDone(transaction);

  return normalizeSettings(storedRecord?.value);
}

export async function saveAppSettings(settings) {
  const normalizedSettings = normalizeSettings(settings);
  const database = await getDatabase();
  const transaction = database.transaction(SETTINGS_STORE, "readwrite");
  transaction.objectStore(SETTINGS_STORE).put({
    key: SETTINGS_KEY,
    value: normalizedSettings
  });
  await transactionDone(transaction);
  return normalizedSettings;
}

export async function getCoverMedia(comicId) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(COVER_STORE).get(comicId));
  await transactionDone(transaction);
  return record || null;
}

export async function saveCoverMedia(record) {
  if (!record?.comicId || !(record.blob instanceof Blob)) {
    throw new Error("Das Coverbild ist ungültig.");
  }

  const normalized = {
    comicId: String(record.comicId),
    blob: record.blob,
    mimeType: String(record.mimeType || record.blob.type || "image/jpeg"),
    size: Number(record.size || record.blob.size || 0),
    width: Number(record.width || 0),
    height: Number(record.height || 0),
    source: record.source === "import" ? "import" : "user",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
  };

  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  transaction.objectStore(COVER_STORE).put(normalized);
  await transactionDone(transaction);
  return normalized;
}

export async function deleteCoverMedia(comicId) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  transaction.objectStore(COVER_STORE).delete(comicId);
  await transactionDone(transaction);
}

export async function getAllCoverMedia() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const records = await requestToPromise(transaction.objectStore(COVER_STORE).getAll());
  await transactionDone(transaction);
  return records;
}

export async function getAllCoverMediaKeys() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const keys = await requestToPromise(transaction.objectStore(COVER_STORE).getAllKeys());
  await transactionDone(transaction);
  return keys.map((key) => String(key));
}

export async function replaceAllCoverMedia(records) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  const store = transaction.objectStore(COVER_STORE);
  store.clear();
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function upsertCoverMedia(records) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  const store = transaction.objectStore(COVER_STORE);
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function clearAllCoverMedia() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  transaction.objectStore(COVER_STORE).clear();
  await transactionDone(transaction);
}

export async function getCoverMediaStats() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const store = transaction.objectStore(COVER_STORE);
  const stats = { count: 0, bytes: 0 };

  await new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error || new Error("Cover-Speicher konnte nicht ausgewertet werden."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const record = cursor.value;
      stats.count += 1;
      stats.bytes += Number(record.size || record.blob?.size || 0);
      cursor.continue();
    };
  });

  await transactionDone(transaction);
  return stats;
}

export async function getMetadataCache(key) {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(METADATA_STORE).get(key));
  await transactionDone(transaction);
  return record || null;
}

export async function getAllMetadataCache() {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readonly");
  const records = await requestToPromise(transaction.objectStore(METADATA_STORE).getAll());
  await transactionDone(transaction);
  return records;
}

export async function saveMetadataCache(record) {
  if (!record?.key) {
    throw new Error("Der Metadaten-Schlüssel fehlt.");
  }
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  transaction.objectStore(METADATA_STORE).put(record);
  await transactionDone(transaction);
  return record;
}

export async function replaceMetadataCache(records) {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  const store = transaction.objectStore(METADATA_STORE);
  store.clear();
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function upsertMetadataCache(records) {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  const store = transaction.objectStore(METADATA_STORE);
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function clearMetadataCache() {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  transaction.objectStore(METADATA_STORE).clear();
  await transactionDone(transaction);
}

function normalizeSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const customSeries = Array.isArray(source.customSeries)
    ? source.customSeries
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim().slice(0, 100))
    : [];

  const customSeriesConfigs = normalizeCustomSeriesConfigs(source.customSeriesConfigs, customSeries);

  const knownHighestBandBySeries = {};
  const knownSource = source.knownHighestBandBySeries;

  if (knownSource && typeof knownSource === "object" && !Array.isArray(knownSource)) {
    Object.entries(knownSource).forEach(([series, value]) => {
      if (typeof series !== "string" || !series.trim()) return;
      const parsedValue = Number(value);
      if (Number.isSafeInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 99999) {
        knownHighestBandBySeries[series.trim().slice(0, 100)] = parsedValue;
      }
    });
  }

  const missingBandDetails = {};
  const detailSource = source.missingBandDetails;

  if (detailSource && typeof detailSource === "object" && !Array.isArray(detailSource)) {
    Object.entries(detailSource).forEach(([key, value]) => {
      if (typeof key !== "string" || !key || !value || typeof value !== "object" || Array.isArray(value)) return;
      const publicationYear = value.publicationYear === null || value.publicationYear === undefined || value.publicationYear === ""
        ? null
        : Number(value.publicationYear);

      missingBandDetails[key.slice(0, 500)] = {
        title: typeof value.title === "string" ? value.title.trim().slice(0, 200) : "",
        publicationYear: Number.isInteger(publicationYear) && publicationYear >= 1800 && publicationYear <= 2035
          ? publicationYear
          : null,
        desiredCondition: normalizeConditionCode(value.desiredCondition, ""),
        notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 2000) : "",
        duckipediaUrl: normalizeOptionalUrl(value.duckipediaUrl),
        updatedAt: isValidDateString(value.updatedAt) ? value.updatedAt : null
      };
    });
  }

  const changesSinceBackup = Number(source.changesSinceBackup);
  const mediaChangesSinceBackup = Number(source.mediaChangesSinceBackup);
  const lastBackupComicCount = Number(source.lastBackupComicCount);

  return {
    theme: source.theme === "light" ? "light" : DEFAULT_SETTINGS.theme,
    lastBackupAt: isValidDateString(source.lastBackupAt) ? source.lastBackupAt : null,
    lastMediaBackupAt: isValidDateString(source.lastMediaBackupAt) ? source.lastMediaBackupAt : null,
    customSeries: [...new Set(customSeriesConfigs.map((entry) => entry.name))],
    customSeriesConfigs,
    knownHighestBandBySeries,
    missingBandDetails,
    fleaMarketSession: normalizeFleaMarketSession(source.fleaMarketSession),
    changesSinceBackup: Number.isSafeInteger(changesSinceBackup) && changesSinceBackup >= 0
      ? Math.min(changesSinceBackup, 999999)
      : 0,
    mediaChangesSinceBackup: Number.isSafeInteger(mediaChangesSinceBackup) && mediaChangesSinceBackup >= 0
      ? Math.min(mediaChangesSinceBackup, 999999)
      : 0,
    lastBackupComicCount: Number.isSafeInteger(lastBackupComicCount) && lastBackupComicCount >= 0
      ? Math.min(lastBackupComicCount, 999999)
      : 0,
    showCovers: source.showCovers !== false,
    duckipediaAutoEnrich: source.duckipediaAutoEnrich !== false,
    calendarEvents: normalizeCalendarEvents(source.calendarEvents),
    calendarSourceUrl: normalizeOptionalUrl(source.calendarSourceUrl) || DEFAULT_SETTINGS.calendarSourceUrl,
    calendarSourceName: typeof source.calendarSourceName === "string" && source.calendarSourceName.trim()
      ? source.calendarSourceName.trim().slice(0, 120)
      : DEFAULT_SETTINGS.calendarSourceName,
    calendarLastImportAt: isValidDateString(source.calendarLastImportAt) ? source.calendarLastImportAt : null,
    calendarImportedSources: normalizeCalendarImportedSources(source.calendarImportedSources),
    calendarCatalogLastCheckAt: isValidDateString(source.calendarCatalogLastCheckAt) ? source.calendarCatalogLastCheckAt : null,
    calendarAutoSync: source.calendarAutoSync !== false,
    calendarSelectedYear: normalizeCalendarYear(source.calendarSelectedYear),
    calendarSelectedMonth: normalizeCalendarMonth(source.calendarSelectedMonth),
    calendarReminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(source.calendarReminderTime || ""))
      ? String(source.calendarReminderTime)
      : DEFAULT_SETTINGS.calendarReminderTime,
    releaseRadarDecisions: normalizeReleaseDecisionMap(source.releaseRadarDecisions),
    releaseRadarKnownSignatures: normalizeKnownReleaseSignatures(source.releaseRadarKnownSignatures),
    releaseRadarInitializedAt: isValidDateString(source.releaseRadarInitializedAt) ? source.releaseRadarInitializedAt : null,
    releaseRadarLastOpenedAt: isValidDateString(source.releaseRadarLastOpenedAt) ? source.releaseRadarLastOpenedAt : null,
    releaseRadarFilter: RELEASE_RADAR_FILTERS.includes(source.releaseRadarFilter) ? source.releaseRadarFilter : "open",
    releaseRadarBadgeEnabled: source.releaseRadarBadgeEnabled !== false,
    releaseSeriesAliases: normalizeReleaseSeriesAliases(source.releaseSeriesAliases),
    releaseEventLinks: normalizeReleaseEventLinks(source.releaseEventLinks),
    archiveMigrationAcknowledgedAt: isValidDateString(source.archiveMigrationAcknowledgedAt)
      ? source.archiveMigrationAcknowledgedAt
      : null,
    scannerMode: source.scannerMode === "review" ? "review" : "fast"
  };
}


function normalizeCalendarImportedSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([yearKey, entry]) => {
    const year = Number(yearKey);
    if (!Number.isSafeInteger(year) || year < 1900 || year > 2100 || !entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const importedAt = isValidDateString(entry.importedAt) ? entry.importedAt : null;
    const eventCount = Number(entry.eventCount);
    result[String(year)] = {
      id: typeof entry.id === "string" ? entry.id.trim().slice(0, 120) : `ltb-${year}`,
      label: typeof entry.label === "string" ? entry.label.trim().slice(0, 160) : `LTB Jahresplan ${year}`,
      version: typeof entry.version === "string" ? entry.version.trim().slice(0, 80) : "",
      file: typeof entry.file === "string" ? entry.file.trim().slice(0, 500) : "",
      sourceUrl: normalizeOptionalUrl(entry.sourceUrl),
      importedAt,
      eventCount: Number.isSafeInteger(eventCount) && eventCount >= 0 ? Math.min(eventCount, 10000) : 0
    };
  });
  return result;
}


function normalizeCalendarEvents(value) {
  const entries = Array.isArray(value) ? value : [];
  const events = [];
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const title = typeof entry.title === "string" ? entry.title.trim().slice(0, 200) : "";
    const startDate = normalizeCalendarDate(entry.startDate);
    if (!title || !startDate) return;
    const endDate = normalizeCalendarDate(entry.endDate) || startDate;
    const sourceType = entry.source === "publisher" ? "publisher" : "custom";
    const category = ["release", "flea-market", "comic-fair", "other"].includes(entry.category)
      ? entry.category
      : sourceType === "publisher" ? "release" : "other";
    const normalizeTime = (time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || "")) ? String(time) : "";
    events.push({
      id: typeof entry.id === "string" && entry.id ? entry.id.slice(0, 300) : `calendar-${Date.now()}-${Math.random()}`,
      uid: typeof entry.uid === "string" ? entry.uid.trim().slice(0, 500) : "",
      title,
      startDate,
      endDate,
      allDay: entry.allDay !== false,
      startTime: normalizeTime(entry.startTime),
      endTime: normalizeTime(entry.endTime),
      location: typeof entry.location === "string" ? entry.location.trim().slice(0, 300) : "",
      notes: typeof entry.notes === "string" ? entry.notes.trim().slice(0, 3000) : "",
      url: normalizeOptionalUrl(entry.url),
      source: sourceType,
      sourceId: typeof entry.sourceId === "string" ? entry.sourceId.trim().slice(0, 120) : "",
      sourceVersion: typeof entry.sourceVersion === "string" ? entry.sourceVersion.trim().slice(0, 80) : "",
      sourceUrl: normalizeOptionalUrl(entry.sourceUrl),
      sourceName: typeof entry.sourceName === "string" ? entry.sourceName.trim().slice(0, 120) : "",
      category,
      reminderEnabled: entry.reminderEnabled !== false,
      createdAt: isValidDateString(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
      updatedAt: isValidDateString(entry.updatedAt) ? entry.updatedAt : new Date().toISOString()
    });
  });
  return events.slice(0, 5000);
}


function normalizeCustomSeriesConfigs(value, legacySeries = []) {
  const entries = Array.isArray(value) ? value : [];
  const normalized = [];

  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 100) : "";
    if (!name) return;
    const duckipediaPattern = normalizeDuckipediaPattern(entry.duckipediaPattern);
    normalized.push({
      id: typeof entry.id === "string" && entry.id.trim()
        ? entry.id.trim().slice(0, 120)
        : createCustomSeriesId(name),
      name,
      duckipediaPattern,
      category: ["main", "special", "other"].includes(entry.category) ? entry.category : "special",
      aliases: Array.isArray(entry.aliases)
        ? [...new Set(entry.aliases.filter((alias) => typeof alias === "string" && alias.trim()).map((alias) => alias.trim().slice(0, 100)))]
        : [],
      isArchived: entry.isArchived === true
    });
  });

  legacySeries.forEach((name) => {
    if (!normalized.some((entry) => entry.name.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
      normalized.push({ id: createCustomSeriesId(name), name, duckipediaPattern: "", category: "special", aliases: [], isArchived: false });
    }
  });

  const deduplicated = [];
  normalized.forEach((entry) => {
    if (!deduplicated.some((item) => item.name.localeCompare(entry.name, "de", { sensitivity: "base" }) === 0)) {
      deduplicated.push(entry);
    }
  });
  return deduplicated;
}

function normalizeFleaMarketSession(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceItems = source.items && typeof source.items === "object" && !Array.isArray(source.items)
    ? source.items
    : {};
  const items = {};

  Object.entries(sourceItems).forEach(([key, item]) => {
    if (typeof key !== "string" || !key || !item || typeof item !== "object" || Array.isArray(item)) return;
    const series = typeof item.series === "string" ? item.series.trim().slice(0, 100) : "";
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

function normalizeOptionalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 1000) : "";
  } catch (error) {
    return "";
  }
}

function normalizeCalendarYear(value) {
  const currentYear = new Date().getFullYear();
  if (value === null || value === undefined || value === "") return currentYear;
  const year = Number(value);
  return Number.isSafeInteger(year) && year >= 1900 && year <= 2100 ? year : currentYear;
}

function normalizeCalendarMonth(value) {
  const currentMonth = new Date().getMonth();
  if (value === null || value === undefined || value === "") return currentMonth;
  const month = Number(value);
  return Number.isSafeInteger(month) && month >= 0 && month <= 11 ? month : currentMonth;
}

function normalizeCalendarDate(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2100) return "";
  if (!Number.isSafeInteger(month) || month < 1 || month > 12) return "";
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) return "";
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return raw;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !value.trim() || /^0000(?:-|$)/.test(value.trim())) return false;
  try {
    return Number.isFinite(Date.parse(value));
  } catch {
    return false;
  }
}
