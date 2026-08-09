import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildSeriesCatalog,
  materializeLegacyComics,
  migrateLegacyComicsToArchive
} from "../archive-model.js";
import {
  canSafelyRepairLegacyMirror,
  compareLegacyMirror,
  compareSettingsSplit,
  createDataStackSnapshotRecord,
  DATA_STACK_FOUNDATION_KIND,
  describeLegacyMirrorDifferences,
  findChangedSettingsFields,
  mergeSplitSettings,
  SETTINGS_CUTOVER_SNAPSHOT_KIND,
  SETTINGS_CUTOVER_VERSION,
  SETTINGS_GROUP_FIELDS,
  SETTINGS_SPLIT_SNAPSHOT_KIND,
  SETTINGS_SPLIT_VERSION,
  splitAppSettings,
  validateDataStackFoundation,
  validateSettingsFieldValues,
  validateSettingsSplitGroups
} from "../data-stack.js";
import { upgradeDatabaseSchema } from "../storage.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function createFoundationFixture() {
  const legacy = [{
    id: "issue-239",
    series: "Lustiges Taschenbuch",
    volumeNumber: "239",
    numericBandNumber: 239,
    title: "Testband",
    condition: "1",
    isRead: true,
    copies: [
      { id: "copy-a", issueId: "issue-239", condition: "1", isRead: true, displayOrder: 1 },
      { id: "copy-b", issueId: "issue-239", condition: "2", isSealed: true, displayOrder: 2 }
    ]
  }];
  const catalog = buildSeriesCatalog({ legacyComics: legacy });
  const archive = migrateLegacyComicsToArchive(legacy, catalog.series, { now: "2026-08-09T20:00:00.000Z" });
  const mirror = materializeLegacyComics(archive.issues, archive.copies, archive.series);
  return { archive, mirror };
}

test("Data Stack Foundation akzeptiert einen validen Archivgraphen mit identischem Legacy-Mirror", () => {
  const { archive, mirror } = createFoundationFixture();
  const result = validateDataStackFoundation({ ...archive, legacyComics: mirror });
  assert.equal(result.valid, true);
  assert.equal(result.parity.valid, true);
  assert.equal(result.counts.issues, 1);
  assert.equal(result.counts.copies, 2);
});

test("Data Stack Foundation stoppt bei einem abweichenden Legacy-Mirror", () => {
  const { archive, mirror } = createFoundationFixture();
  const changedMirror = mirror.map((comic) => ({ ...comic, title: "Abweichender Titel" }));
  const result = validateDataStackFoundation({ ...archive, legacyComics: changedMirror });
  assert.equal(result.valid, false);
  assert.deepEqual(result.parity.mismatchedIds, [mirror[0].id]);
  assert.match(result.problems.join(" "), /weichen Archivgraph und Legacy-Mirror/);
});

test("Paritätsprüfung ignoriert nur Objekt-Schlüsselreihenfolge, nicht Datenänderungen", () => {
  const left = [{ id: "a", title: "Band", copies: [{ id: "c1", condition: "1" }] }];
  const right = [{ copies: [{ condition: "1", id: "c1" }], title: "Band", id: "a" }];
  assert.equal(compareLegacyMirror(left, right).valid, true);
  assert.equal(compareLegacyMirror(left, [{ ...right[0], title: "Anders" }]).valid, false);
});

test("Foundation-Snapshot enthält Graph, Mirror und Settings, aber keine Cover-Blobs", () => {
  const { archive, mirror } = createFoundationFixture();
  const snapshot = createDataStackSnapshotRecord({
    kind: DATA_STACK_FOUNDATION_KIND,
    createdAt: "2026-08-09T20:00:00.000Z",
    appVersion: "4.6.0",
    databaseVersion: 6,
    dataFormatVersion: 9,
    archiveModelVersion: 1,
    dataStackVersion: 1,
    settings: { theme: "dark" },
    archiveMeta: { key: "archive-core", status: "complete" },
    series: archive.series,
    issues: archive.issues,
    copies: archive.copies,
    legacyComics: mirror
  });
  assert.equal(snapshot.kind, "pre-data-stack-v1");
  assert.equal(snapshot.counts.issues, 1);
  assert.equal(snapshot.counts.copies, 2);
  assert.equal(snapshot.settings.theme, "dark");
  assert.equal("coverMedia" in snapshot, false);
});

test("Schema-Upgrade von Datenbank 5 auf 6 erhält alle alten Stores und legt die Foundation-Stores an", () => {
  const existingStores = [
    "comics", "settings", "coverMedia", "metadataCache", "seriesCatalog", "issues", "copies", "archiveMeta", "migrationSnapshots"
  ];
  const { database, transaction, stores } = createFakeUpgradeDatabase(existingStores);
  upgradeDatabaseSchema(database, transaction, 5, { upgradedAt: "2026-08-09T20:00:00.000Z" });

  for (const name of existingStores) assert.ok(stores.has(name), `alter Store ${name} fehlt`);
  for (const name of [
    "preferences", "calendarState", "missingState", "fleaMarketState", "releaseRadarState", "collectorState", "dataStackMeta", "dataStackSnapshots"
  ]) assert.ok(stores.has(name), `neuer Store ${name} fehlt`);

  const upgradeMeta = stores.get("dataStackMeta").records.get("schema-upgrade-v6");
  assert.deepEqual(upgradeMeta, {
    key: "schema-upgrade-v6",
    fromDatabaseVersion: 5,
    toDatabaseVersion: 6,
    upgradedAt: "2026-08-09T20:00:00.000Z"
  });
  assert.ok(stores.get("dataStackSnapshots").indexes.has("createdAt"));
  assert.ok(stores.get("dataStackSnapshots").indexes.has("kind"));
});

test("Schema 6 bereitet getrennte Data-Stack-Stores vor, ohne Legacy-Stores zu entfernen", async () => {
  const [storage, config, worker, build] = await Promise.all([
    read("storage.js"), read("config.js"), read("service-worker.js"), read("scripts/build-static.mjs")
  ]);
  assert.match(storage, /const DATABASE_VERSION = 6/);
  for (const store of [
    "comics", "settings", "preferences", "calendarState", "missingState", "fleaMarketState", "releaseRadarState", "collectorState", "dataStackMeta", "dataStackSnapshots"
  ]) assert.match(storage, new RegExp(`"${store}"`));
  assert.match(storage, /restoreLatestDataStackSnapshot/);
  assert.match(storage, /verifyDataStackParity/);
  assert.match(config, /DATA_STACK_VERSION = 2/);
  assert.match(worker, /\.\/data-stack\.js/);
  assert.match(build, /"data-stack\.js"/);
});

function createFakeUpgradeDatabase(existingNames) {
  const stores = new Map(existingNames.map((name) => [name, createFakeStore(name)]));
  const objectStoreNames = { contains: (name) => stores.has(name) };
  const database = {
    objectStoreNames,
    createObjectStore(name, options) {
      assert.equal(stores.has(name), false, `Store ${name} wurde doppelt erstellt`);
      const store = createFakeStore(name, options);
      stores.set(name, store);
      return store;
    }
  };
  const transaction = {
    objectStore(name) {
      const store = stores.get(name);
      assert.ok(store, `Transaktion findet Store ${name} nicht`);
      return store;
    }
  };
  return { database, transaction, stores };
}

function createFakeStore(name, options = {}) {
  const records = new Map();
  return {
    name,
    options,
    indexes: new Map(),
    records,
    createIndex(indexName, keyPath, indexOptions) {
      this.indexes.set(indexName, { keyPath, options: indexOptions });
      return this.indexes.get(indexName);
    },
    put(record) {
      const keyPath = options.keyPath || "key";
      records.set(record[keyPath], structuredClone(record));
      return record;
    }
  };
}

test("Settings Split verteilt alle normalisierten Settings genau einmal auf sechs Bereiche", () => {
  const expectedFields = [
    "theme", "lastBackupAt", "lastMediaBackupAt", "customSeries", "customSeriesConfigs",
    "knownHighestBandBySeries", "missingBandDetails", "fleaMarketSession", "changesSinceBackup",
    "mediaChangesSinceBackup", "lastBackupComicCount", "showCovers", "duckipediaAutoEnrich",
    "calendarEvents", "calendarSourceUrl", "calendarSourceName", "calendarLastImportAt",
    "calendarImportedSources", "calendarCatalogLastCheckAt", "calendarAutoSync", "calendarSelectedYear",
    "calendarSelectedMonth", "calendarReminderTime", "releaseRadarDecisions", "releaseRadarKnownSignatures",
    "releaseRadarInitializedAt", "releaseRadarLastOpenedAt", "releaseRadarFilter", "releaseRadarBadgeEnabled",
    "releaseSeriesAliases", "releaseEventLinks", "archiveMigrationAcknowledgedAt", "scannerMode",
    "milestoneSeenIds", "milestonesInitializedAt"
  ].sort();
  const actualFields = Object.values(SETTINGS_GROUP_FIELDS).flat().sort();
  assert.deepEqual(actualFields, expectedFields);
  assert.equal(new Set(actualFields).size, actualFields.length);
  assert.equal(Object.keys(SETTINGS_GROUP_FIELDS).length, 6);
});

test("Settings Split lässt sich verlustfrei spiegeln und wieder zusammensetzen", () => {
  const settings = Object.fromEntries(
    Object.values(SETTINGS_GROUP_FIELDS).flat().map((field, index) => [field, { field, index }])
  );
  const groups = splitAppSettings(settings);
  assert.equal(compareSettingsSplit(settings, groups).valid, true);
  assert.deepEqual(mergeSplitSettings(groups), settings);
});

test("Settings Split erkennt fehlende und abweichende Gruppen", () => {
  const settings = { theme: "dark", calendarSelectedMonth: 7, fleaMarketSession: { active: true } };
  const groups = splitAppSettings(settings);
  delete groups.calendarState;
  groups.preferences.theme = "light";
  const parity = compareSettingsSplit(settings, groups);
  assert.equal(parity.valid, false);
  assert.deepEqual(parity.missingGroups, ["calendarState"]);
  assert.deepEqual(parity.mismatchedGroups, ["preferences"]);
  assert.equal(parity.splitVersion, SETTINGS_SPLIT_VERSION);
  assert.equal(SETTINGS_SPLIT_SNAPSHOT_KIND, "pre-settings-split-v1");
});

test("Settings Cutover erkennt vollständige und beschädigte Feld-Datensätze", () => {
  const values = Object.fromEntries(
    Object.values(SETTINGS_GROUP_FIELDS).flat().map((field, index) => [field, index])
  );
  const healthy = validateSettingsFieldValues(values);
  assert.equal(healthy.valid, true);
  assert.equal(healthy.fieldCount, 35);

  delete values.calendarSelectedMonth;
  const broken = validateSettingsFieldValues(values);
  assert.equal(broken.valid, false);
  assert.deepEqual(broken.missingFields.calendarState, ["calendarSelectedMonth"]);
  assert.equal(SETTINGS_CUTOVER_VERSION, 1);
  assert.equal(SETTINGS_CUTOVER_SNAPSHOT_KIND, "pre-settings-cutover-v1");
});

test("Settings Cutover erkennt Änderungen auf Feldebene statt ganze Gruppen neu zu schreiben", () => {
  const current = {
    theme: "dark",
    calendarSelectedMonth: 7,
    releaseRadarFilter: "open",
    milestoneSeenIds: ["first-50"]
  };
  const calendarChange = { ...current, calendarSelectedMonth: 8 };
  assert.deepEqual(findChangedSettingsFields(current, calendarChange), [
    { groupName: "calendarState", field: "calendarSelectedMonth" }
  ]);

  const multiChange = { ...current, theme: "light", milestoneSeenIds: ["first-50", "first-100"] };
  assert.deepEqual(findChangedSettingsFields(current, multiChange), [
    { groupName: "preferences", field: "theme" },
    { groupName: "collectorState", field: "milestoneSeenIds" }
  ]);
});

test("Storage liest nach dem Cutover Feld-Datensätze und schreibt nur geänderte Felder", async () => {
  const [storage, app] = await Promise.all([read("storage.js"), read("app.js")]);
  assert.match(storage, /const SETTINGS_CUTOVER_META_KEY = "settings-cutover"/);
  assert.match(storage, /SETTINGS_CUTOVER_SNAPSHOT_KIND/);
  assert.match(storage, /ensureSettingsCutoverReady/);
  assert.match(storage, /return await readCutoverSettingsValue\(database\)/);
  assert.match(storage, /findChangedSettingsFields\(currentSettings, normalizedSettings\)/);
  assert.match(storage, /database\.transaction\(changedStores, "readwrite"\)/);
  assert.match(storage, /putSettingsFieldRecords\(transaction, normalizedSettings, changes\)/);
  assert.match(storage, /layout: "field-record"/);
  assert.match(storage, /statischer Legacy-Fallback/);
  assert.match(storage, /legacyComparisonSkipped: true/);
  assert.match(app, /Einstellungen getrennt aktiv/);
});

test("Legacy-Settings bleiben nach dem Cutover ein Fallback statt Live-Mirror", async () => {
  const storage = await read("storage.js");
  const saveStart = storage.indexOf("export async function saveAppSettings(settings)");
  const saveEnd = storage.indexOf("export async function getCoverMedia", saveStart);
  const saveBody = storage.slice(saveStart, saveEnd);
  const cutoverBranchEnd = saveBody.indexOf("// Sicherheitsfallback vor einem erfolgreichen Cutover");
  const cutoverBranch = saveBody.slice(0, cutoverBranchEnd);
  assert.doesNotMatch(cutoverBranch, /objectStore\(SETTINGS_STORE\)\.put/);
  assert.match(saveBody.slice(cutoverBranchEnd), /objectStore\(SETTINGS_STORE\)\.put/);
});


test("Data-Stack-Rollback setzt aktive Settings-Felder und Cutover-Status sicher zurück", async () => {
  const storage = await read("storage.js");
  const restoreStart = storage.indexOf("export async function restoreLatestDataStackSnapshot()");
  const restoreEnd = storage.indexOf("export async function getArchiveCoreStatus()", restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
  const restoreBlock = storage.slice(restoreStart, restoreEnd);
  assert.match(restoreBlock, /SETTINGS_SPLIT_STORES\.forEach\(\(storeName\) => transaction\.objectStore\(storeName\)\.clear\(\)\)/);
  assert.match(restoreBlock, /dataStackMetaStore\.delete\(SETTINGS_CUTOVER_META_KEY\)/);
  assert.match(restoreBlock, /putSettingsSplitRecords\(transaction, restoredSettings\)/);
});


test("Legacy-Mirror-Reparatur ist nur bei identischen IDs und validem Archivgraph erlaubt", () => {
  const { archive, mirror } = createFoundationFixture();
  const changedMirror = mirror.map((comic) => ({ ...comic, series: "Alter Reihenname" }));
  const mismatch = validateDataStackFoundation({ ...archive, legacyComics: changedMirror });
  assert.equal(mismatch.graphValid, true);
  assert.equal(mismatch.parity.mismatchedIds.length, 1);
  assert.equal(canSafelyRepairLegacyMirror(mismatch), true);

  const missing = validateDataStackFoundation({ ...archive, legacyComics: [] });
  assert.equal(missing.parity.missingInMirror.length, 1);
  assert.equal(canSafelyRepairLegacyMirror(missing), false);
});

test("Legacy-Mirror-Diagnose benennt die abweichenden Felder ohne Daten zu veraendern", () => {
  const { mirror } = createFoundationFixture();
  const changedMirror = mirror.map((comic) => ({ ...comic, series: "Alter Reihenname", title: "Alter Titel" }));
  const report = describeLegacyMirrorDifferences(mirror, changedMirror);
  assert.equal(report.mismatchCount, 1);
  assert.deepEqual(report.entries, [{ id: mirror[0].id, fields: ["series", "title"] }]);
  assert.deepEqual(report.fieldCounts, { series: 1, title: 1 });
});

test("Storage repariert nur den abgeleiteten Mirror und synchronisiert Reihen-Aenderungen kuenftig mit", async () => {
  const storage = await read("storage.js");
  assert.match(storage, /canSafelyRepairLegacyMirror\(validation\)/);
  assert.match(storage, /LEGACY_MIRROR_REPAIR_SNAPSHOT_KIND/);
  assert.match(storage, /legacyStore\.clear\(\);/);
  assert.match(storage, /projectedComics\.forEach\(\(record\) => legacyStore\.put\(record\)\)/);
  assert.match(storage, /const projected = materializeLegacyComics\(affectedIssues, affectedCopies, nextSeries\);/);
  assert.match(storage, /database\.transaction\(\[SERIES_STORE, COMICS_STORE\], "readwrite"\)/);
});
