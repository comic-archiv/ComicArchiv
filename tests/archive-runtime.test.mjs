import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createSeriesDefinition,
  materializeLegacyComics,
  normalizeCopyRecord,
  normalizeIssueRecord
} from "../archive-model.js";
import {
  ARCHIVE_RUNTIME_VERSION,
  createArchiveRuntimeCollection,
  createArchiveRuntimeIndex
} from "../archive-runtime.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const NOW = "2026-08-10T00:00:00.000Z";

function createGraphFixture() {
  const main = createSeriesDefinition({
    id: "ltb-main",
    name: "Lustiges Taschenbuch",
    category: "main",
    isSystem: true,
    createdAt: NOW,
    updatedAt: NOW
  }, { now: NOW });
  const special = createSeriesDefinition({
    id: "special-test",
    name: "LTB Spezial",
    category: "special",
    isSystem: true,
    createdAt: NOW,
    updatedAt: NOW
  }, { now: NOW });

  const issues = [
    normalizeIssueRecord({
      id: "issue-240",
      seriesId: main.id,
      volumeNumber: "240",
      numericBandNumber: 240,
      title: "Band 240",
      publicationYear: 1998,
      createdAt: NOW,
      updatedAt: NOW
    }, { now: NOW }),
    normalizeIssueRecord({
      id: "issue-special-2",
      seriesId: special.id,
      volumeNumber: "2",
      numericBandNumber: 2,
      title: "Spezial 2",
      publicationYear: 1999,
      createdAt: NOW,
      updatedAt: NOW
    }, { now: NOW })
  ];

  const copies = [
    normalizeCopyRecord({
      id: "copy-240-b",
      issueId: "issue-240",
      condition: "2",
      isRead: false,
      isSealed: true,
      notes: "Zweites Exemplar",
      displayOrder: 2,
      createdAt: NOW,
      updatedAt: NOW
    }, { now: NOW }),
    normalizeCopyRecord({
      id: "copy-240-a",
      issueId: "issue-240",
      condition: "1",
      isRead: true,
      isSealed: false,
      notes: "Erstes Exemplar",
      displayOrder: 1,
      createdAt: NOW,
      updatedAt: NOW
    }, { now: NOW }),
    normalizeCopyRecord({
      id: "copy-special-2",
      issueId: "issue-special-2",
      condition: "0-1",
      isRead: true,
      isSealed: false,
      displayOrder: 1,
      createdAt: NOW,
      updatedAt: NOW
    }, { now: NOW })
  ];

  return { series: [main, special], issues, copies };
}

test("Archive Runtime erzeugt aus einem validen Graph dieselbe UI-Sicht wie die bisherige Legacy-Materialisierung", () => {
  const graph = createGraphFixture();
  const runtime = createArchiveRuntimeCollection(graph, { dataFormatVersion: 9 });
  const legacyProjection = materializeLegacyComics(graph.issues, graph.copies, graph.series, { dataFormatVersion: 9 });

  assert.equal(runtime.runtimeVersion, ARCHIVE_RUNTIME_VERSION);
  assert.equal(runtime.source, "archive-graph");
  assert.deepEqual(runtime.entries, legacyProjection);
  assert.deepEqual(runtime.counts, { series: 2, issues: 2, copies: 3 });
});

test("Archive Runtime sortiert Exemplare stabil und baut direkte Indizes", () => {
  const runtime = createArchiveRuntimeCollection(createGraphFixture(), { dataFormatVersion: 9 });
  const mainEntry = runtime.entries.find((entry) => entry.id === "issue-240");
  assert.deepEqual(mainEntry.copies.map((copy) => copy.id), ["copy-240-a", "copy-240-b"]);
  assert.equal(mainEntry.copyCount, 2);
  assert.equal(mainEntry.condition, "1");
  assert.equal(mainEntry.duplicateCondition, "2");

  const index = createArchiveRuntimeIndex(runtime);
  assert.equal(index.issueById.get("issue-240").title, "Band 240");
  assert.equal(index.entryById.get("issue-special-2").series, "LTB Spezial");
  assert.equal(index.copiesByIssue.get("issue-240").length, 2);
});

test("Archive Runtime verweigert einen unvollständigen Graph statt auf Legacy-Daten zurückzufallen", () => {
  const graph = createGraphFixture();
  assert.throws(
    () => createArchiveRuntimeCollection({ ...graph, copies: graph.copies.filter((copy) => copy.issueId !== "issue-special-2") }),
    /besitzt kein Exemplar/
  );
});

test("4.6.4 liest die laufende Sammlung ausschließlich aus dem Archivgraph", async () => {
  const [app, storage, runtimeSource, worker, build] = await Promise.all([
    read("app.js"),
    read("storage.js"),
    read("archive-runtime.js"),
    read("service-worker.js"),
    read("scripts/build-static.mjs")
  ]);

  assert.match(app, /getArchiveRuntimeCollection/);
  assert.doesNotMatch(app, /\bgetAllComics\b/);
  assert.doesNotMatch(app, /state\.comics\b/);
  assert.match(app, /collectionEntries:\s*\[\]/);
  assert.match(app, /archiveRuntimeSource:\s*""/);
  assert.match(app, /runtimeLabel = state\.archiveRuntimeSource === "archive-graph"/);

  const runtimeReader = storage.match(/export async function getArchiveRuntimeCollection\(\)[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(runtimeReader, /readArchiveGraph\(database\)/);
  assert.match(runtimeReader, /createArchiveRuntimeCollection/);
  assert.doesNotMatch(runtimeReader, /COMICS_STORE|getAllComics|materializeLegacyComics/);

  assert.doesNotMatch(runtimeSource, /materializeLegacyComics/);
  assert.match(worker, /\.\/archive-runtime\.js/);
  assert.match(build, /"archive-runtime\.js"/);
});

test("Legacy-comics bleibt in 4.6.4 nur als expliziter Kompatibilitätsadapter bestehen", async () => {
  const storage = await read("storage.js");
  assert.match(storage, /Kompatibilitätsadapter für alte Backup-\/Migrationspfade/);
  assert.match(storage, /export async function getAllComics\(\)/);
  assert.match(storage, /legacyStore\.put\(runtimeEntry\)/);
  assert.match(storage, /legacyWrites\.set\(String\(runtimeEntry\.id\), runtimeEntry\)/);
});
