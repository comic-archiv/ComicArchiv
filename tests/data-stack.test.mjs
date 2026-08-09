import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildSeriesCatalog,
  materializeLegacyComics,
  migrateLegacyComicsToArchive
} from "../archive-model.js";
import {
  compareLegacyMirror,
  createDataStackSnapshotRecord,
  DATA_STACK_FOUNDATION_KIND,
  validateDataStackFoundation
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
  assert.match(config, /DATA_STACK_VERSION = 1/);
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
