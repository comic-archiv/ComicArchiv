import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSeriesCatalog,
  createCustomSeriesId,
  createIssueIdentityKey,
  materializeLegacyComics,
  mergeCopyLists,
  mergeFormValuesIntoCopies,
  migrateLegacyComicsToArchive,
  validateArchiveGraph
} from "../archive-model.js";

test("alte Sammlungsdaten werden in Ausgaben und beliebig viele Exemplare überführt", () => {
  const legacy = [
    {
      id: "comic-1",
      series: "Lustiges Taschenbuch",
      volumeNumber: "239",
      numericBandNumber: 239,
      title: "Testband",
      condition: "1",
      duplicateCondition: "2",
      isDuplicate: true,
      isRead: true,
      isSealed: false,
      notes: "Erstes Exemplar",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T00:00:00.000Z"
    },
    {
      id: "comic-2",
      series: "LTB",
      volumeNumber: "239",
      numericBandNumber: 239,
      condition: "3",
      isDuplicate: false,
      isRead: false,
      isSealed: true,
      notes: "Drittes Exemplar",
      createdAt: "2021-01-01T00:00:00.000Z",
      updatedAt: "2021-01-02T00:00:00.000Z"
    }
  ];
  const catalog = buildSeriesCatalog({ legacyComics: legacy });
  const archive = migrateLegacyComicsToArchive(legacy, catalog.series, { now: "2026-01-01T00:00:00.000Z" });
  assert.equal(archive.issues.length, 1);
  assert.equal(archive.copies.length, 3);
  assert.equal(archive.issues[0].seriesId, "ltb-main");
  assert.equal(archive.report.collapsedLegacyDuplicates, 1);
  assert.equal(validateArchiveGraph(archive).valid, true);

  const [comic] = materializeLegacyComics(archive.issues, archive.copies, archive.series);
  assert.equal(comic.copyCount, 3);
  assert.equal(comic.copies.length, 3);
  assert.equal(comic.isDuplicate, true);
  assert.equal(comic.series, "Lustiges Taschenbuch");
});

test("eigene Reihen erhalten deterministische stabile IDs", () => {
  const first = createCustomSeriesId("Meine seltene Reihe");
  const second = createCustomSeriesId("Meine seltene Reihe");
  const other = createCustomSeriesId("Andere Reihe");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^custom-meine-seltene-reihe-[a-f0-9]{8}$/);
});

test("Ausgabenidentität hängt an Reihen-ID und Bandnummer statt am sichtbaren Namen", () => {
  assert.equal(createIssueIdentityKey("ltb-main", "00239"), "ltb-main::239");
  assert.equal(createIssueIdentityKey("ltb-main", "00239"), createIssueIdentityKey("ltb-main", "239"));
  assert.notEqual(createIssueIdentityKey("ltb-main", "239"), createIssueIdentityKey("ltb-special", "239"));
});

test("Backups mit expliziter Exemplarliste behalten mehr als zwei Exemplare", () => {
  const legacy = [{
    id: "issue-a",
    seriesId: "ltb-main",
    series: "Lustiges Taschenbuch",
    volumeNumber: "1",
    copies: [
      { id: "copy-a", issueId: "issue-a", condition: "0-1", isRead: true, displayOrder: 1 },
      { id: "copy-b", issueId: "issue-a", condition: "2", isSealed: true, displayOrder: 2 },
      { id: "copy-c", issueId: "issue-a", condition: "3", notes: "Tausch", displayOrder: 3 }
    ]
  }];
  const catalog = buildSeriesCatalog({ legacyComics: legacy });
  const archive = migrateLegacyComicsToArchive(legacy, catalog.series);
  assert.equal(archive.copies.length, 3);
  assert.deepEqual(archive.copies.map((copy) => copy.condition), ["0-1", "2", "3"]);
});

test("doppelte Legacy-IDs werden ohne Datenverlust eindeutig gemacht", () => {
  const legacy = [
    {
      id: "same-id",
      series: "Lustiges Taschenbuch",
      volumeNumber: "1",
      copies: [{ id: "same-copy", condition: "1", displayOrder: 1 }]
    },
    {
      id: "same-id",
      series: "LTB Spezial",
      volumeNumber: "1",
      copies: [{ id: "same-copy", condition: "2", displayOrder: 1 }]
    }
  ];
  const catalog = buildSeriesCatalog({ legacyComics: legacy });
  const archive = migrateLegacyComicsToArchive(legacy, catalog.series);
  assert.equal(archive.issues.length, 2);
  assert.equal(new Set(archive.issues.map((issue) => issue.id)).size, 2);
  assert.equal(new Set(archive.copies.map((copy) => copy.id)).size, 2);
  assert.equal(validateArchiveGraph(archive).valid, true);
});

test("der Archivgraph lehnt verwaiste Exemplare ab", () => {
  const result = validateArchiveGraph({
    series: [{ id: "ltb-main", name: "Lustiges Taschenbuch" }],
    issues: [{ id: "issue-1", seriesId: "ltb-main", volumeNumber: "1" }],
    copies: [{ id: "copy-orphan", issueId: "issue-missing", condition: "1" }]
  });
  assert.equal(result.valid, false);
  assert.match(result.problems.join(" "), /unbekannte Ausgabe/);
});


test("gleich bewertete physische Exemplare bleiben anhand ihrer IDs getrennt", () => {
  const merged = mergeCopyLists(
    [{ id: "copy-a", issueId: "issue-1", condition: "2", isRead: false, isSealed: false, notes: "", updatedAt: "2026-01-01T00:00:00.000Z" }],
    [{ id: "copy-b", issueId: "issue-1", condition: "2", isRead: false, isSealed: false, notes: "", updatedAt: "2026-01-02T00:00:00.000Z" }],
    { issueId: "issue-1" }
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((copy) => copy.id), ["copy-a", "copy-b"]);
});

test("das kompakte Formular verliert vorhandene dritte und weitere Exemplare nicht", () => {
  const existing = {
    id: "issue-1",
    issueId: "issue-1",
    condition: "1",
    isRead: false,
    isSealed: false,
    notes: "",
    copies: [
      { id: "copy-1", issueId: "issue-1", condition: "1", displayOrder: 1 },
      { id: "copy-2", issueId: "issue-1", condition: "2", displayOrder: 2 },
      { id: "copy-3", issueId: "issue-1", condition: "3", displayOrder: 3 }
    ]
  };
  const merged = mergeFormValuesIntoCopies(existing, {
    id: "issue-1",
    issueId: "issue-1",
    condition: "0-1",
    isRead: true,
    isSealed: true,
    notes: "Primär aktualisiert",
    isDuplicate: false,
    updatedAt: "2026-08-07T00:00:00.000Z"
  });
  assert.equal(merged.length, 3);
  assert.equal(merged[0].condition, "0-1");
  assert.deepEqual(merged.slice(1).map((copy) => copy.id), ["copy-2", "copy-3"]);
});

test("der Archivgraph lehnt Ausgaben ohne physisches Exemplar ab", () => {
  const result = validateArchiveGraph({
    series: [{ id: "ltb-main", name: "Lustiges Taschenbuch" }],
    issues: [{ id: "issue-1", seriesId: "ltb-main", volumeNumber: "1" }],
    copies: []
  });
  assert.equal(result.valid, false);
  assert.match(result.problems.join(" "), /besitzt kein Exemplar/);
});
