import test from "node:test";
import assert from "node:assert/strict";
import {
  createCollectionCsv,
  createJsonBackup,
  mergeCollections,
  parseAndValidateBackup
} from "../export.js";

function buildComic(overrides = {}) {
  const now = "2026-08-07T12:00:00.000Z";
  return {
    id: "comic-1",
    issueId: "comic-1",
    seriesId: "ltb-main",
    dataFormatVersion: 9,
    archiveModelVersion: 1,
    series: "Lustiges Taschenbuch",
    volumeNumber: "1",
    numericBandNumber: 1,
    title: "",
    publicationYear: null,
    condition: "1",
    duplicateCondition: null,
    isRead: false,
    isDuplicate: false,
    isSealed: false,
    notes: "",
    copies: [{
      id: "copy-1",
      issueId: "comic-1",
      condition: "1",
      isRead: false,
      isSealed: false,
      notes: "",
      displayOrder: 1,
      createdAt: now,
      updatedAt: now
    }],
    copyCount: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test("CSV behandelt Semikolon, Anführungszeichen, Umlaute und Zeilenumbrüche", () => {
  const comic = buildComic({
    title: "Ärger; \"aber gut\"",
    publicationYear: 1967,
    copies: [{
      id: "copy-1",
      issueId: "comic-1",
      condition: "1",
      isRead: true,
      isSealed: false,
      notes: "Zeile 1\nZeile 2",
      displayOrder: 1,
      createdAt: "2026-08-07T12:00:00.000Z",
      updatedAt: "2026-08-07T12:00:00.000Z"
    }]
  });
  const csv = createCollectionCsv([comic]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /"Ärger; ""aber gut"""/);
  assert.match(csv, /"Zeile 1\nZeile 2"/);
});

test("CSV führt beliebig viele physische Exemplare in eigenen Zeilen", () => {
  const comic = buildComic({
    copies: [
      { id: "copy-1", issueId: "comic-1", condition: "0-1", isRead: true, isSealed: false, notes: "A", displayOrder: 1 },
      { id: "copy-2", issueId: "comic-1", condition: "2", isRead: false, isSealed: true, notes: "B", displayOrder: 2 },
      { id: "copy-3", issueId: "comic-1", condition: "3", isRead: false, isSealed: false, notes: "C", displayOrder: 3 }
    ],
    copyCount: 3,
    isDuplicate: true
  });
  const csv = createCollectionCsv([comic]);
  assert.equal(csv.trim().split("\r\n").length, 4);
  assert.match(csv, /"3";"3";"Nein";"Nein";"C"/);
});

test("Ein erzeugtes Backup behält drei Exemplare und stabile IDs", () => {
  const comic = buildComic({
    copies: [
      { id: "copy-1", issueId: "comic-1", condition: "1", isRead: false, isSealed: false, notes: "", displayOrder: 1 },
      { id: "copy-2", issueId: "comic-1", condition: "2", isRead: true, isSealed: false, notes: "Tausch", displayOrder: 2 },
      { id: "copy-3", issueId: "comic-1", condition: "3", isRead: false, isSealed: true, notes: "", displayOrder: 3 }
    ],
    copyCount: 3,
    isDuplicate: true
  });
  const text = createJsonBackup([comic], { theme: "dark" }, []);
  const parsed = parseAndValidateBackup(text);
  assert.equal(parsed.comics.length, 1);
  assert.equal(parsed.comics[0].seriesId, "ltb-main");
  assert.equal(parsed.comics[0].copies.length, 3);
  assert.deepEqual(parsed.comics[0].copies.map((copy) => copy.id), ["copy-1", "copy-2", "copy-3"]);
  assert.equal(parsed.backupType, "data");
});

test("Zusammenführen erzeugt bei derselben Ausgabe keinen zweiten Bandeintrag", () => {
  const existing = buildComic();
  const imported = buildComic({
    id: "andere-id",
    issueId: "andere-id",
    volumeNumber: "01",
    copies: [{
      id: "copy-import",
      issueId: "andere-id",
      condition: "2",
      isRead: false,
      isSealed: true,
      notes: "Zusätzliches Exemplar",
      displayOrder: 1,
      createdAt: "2026-08-08T12:00:00.000Z",
      updatedAt: "2026-08-08T12:00:00.000Z"
    }],
    updatedAt: "2026-08-08T12:00:00.000Z"
  });
  const result = mergeCollections([existing], [imported]);
  assert.equal(result.comics.length, 1);
  assert.equal(result.comics[0].copies.length, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.copiesAdded, 1);
  assert.equal(result.idMap["andere-id"], "comic-1");
});

test("Version-4-Backups enthalten einen validierten Archivkern", () => {
  const comic = buildComic({
    copies: [
      { id: "copy-1", issueId: "comic-1", condition: "1", isRead: false, isSealed: false, notes: "", displayOrder: 1 },
      { id: "copy-2", issueId: "comic-1", condition: "2", isRead: true, isSealed: false, notes: "Zweitexemplar", displayOrder: 2 },
      { id: "copy-3", issueId: "comic-1", condition: "3", isRead: false, isSealed: true, notes: "Tausch", displayOrder: 3 }
    ],
    copyCount: 3,
    isDuplicate: true
  });
  const raw = JSON.parse(createJsonBackup([comic], { theme: "dark" }, []));
  assert.equal(raw.archiveCore.modelVersion, 1);
  assert.equal(raw.archiveCore.issues.length, 1);
  assert.equal(raw.archiveCore.copies.length, 3);

  const parsed = parseAndValidateBackup(JSON.stringify(raw));
  assert.equal(parsed.hasArchiveCore, true);
  assert.equal(parsed.archiveCore.counts.issues, 1);
  assert.equal(parsed.archiveCore.counts.copies, 3);
  assert.equal(parsed.comics[0].copies.length, 3);
});

test("Backups mit neuerem Archivmodell werden verständlich abgelehnt", () => {
  const raw = JSON.parse(createJsonBackup([buildComic()], { theme: "dark" }, []));
  raw.archiveCore.modelVersion = 999;
  assert.throws(
    () => parseAndValidateBackup(JSON.stringify(raw)),
    /Backup ist nicht kompatibel|Archivmodell-Version/
  );
});

test("Merge liefert Cover-ID-Zuordnung und Zahl zusätzlicher Exemplare", () => {
  const existing = buildComic();
  const imported = buildComic({
    id: "import-issue",
    issueId: "import-issue",
    volumeNumber: "001",
    copies: [{
      id: "import-copy",
      issueId: "import-issue",
      condition: "2",
      isRead: false,
      isSealed: true,
      notes: "Fund",
      displayOrder: 1,
      updatedAt: "2026-08-08T12:00:00.000Z"
    }],
    updatedAt: "2026-08-08T12:00:00.000Z"
  });
  const result = mergeCollections([existing], [imported]);
  assert.equal(result.idMap["import-issue"], "comic-1");
  assert.equal(result.copiesAdded, 1);
});

test("ältere Backups ohne Archivkern bleiben importierbar", () => {
  const legacyBackup = {
    app: "ComicArchiv",
    appVersion: "3.8.0",
    backupType: "data",
    dataFormatVersion: 8,
    exportedAt: "2026-08-01T12:00:00.000Z",
    comics: [{
      id: "legacy-1",
      series: "Lustiges Taschenbuch",
      volumeNumber: "5",
      numericBandNumber: 5,
      title: "Altbestand",
      condition: "1-2",
      duplicateCondition: "2",
      isRead: true,
      isDuplicate: true,
      isSealed: false,
      notes: "",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z"
    }],
    settings: { theme: "dark" },
    metadataCache: []
  };
  const parsed = parseAndValidateBackup(JSON.stringify(legacyBackup));
  assert.equal(parsed.hasArchiveCore, false);
  assert.equal(parsed.comics.length, 1);
  assert.equal(parsed.comics[0].copies.length, 2);
});


test("Merge aktualisiert dasselbe Exemplar per ID statt es zu vervielfachen", () => {
  const existing = buildComic();
  const imported = buildComic({
    copies: [{
      id: "copy-1",
      issueId: "comic-1",
      condition: "2",
      isRead: true,
      isSealed: false,
      notes: "Aktualisiert",
      displayOrder: 1,
      createdAt: "2026-08-07T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z"
    }],
    updatedAt: "2026-08-09T12:00:00.000Z"
  });
  const result = mergeCollections([existing], [imported]);
  assert.equal(result.comics.length, 1);
  assert.equal(result.comics[0].copies.length, 1);
  assert.equal(result.comics[0].copies[0].condition, "2");
  assert.equal(result.copiesAdded, 0);
});

test("Backup-Import lehnt Textwerte in booleschen Exemplarfeldern ab", () => {
  const raw = JSON.parse(createJsonBackup([buildComic()], { theme: "dark" }, []));
  raw.archiveCore.copies[0].isRead = "false";
  assert.throws(
    () => parseAndValidateBackup(JSON.stringify(raw)),
    /Archivkern im Backup ist ungültig|true oder false|Exemplar/
  );
});


test("JSON-Backup behält validierte Duckipedia-Infobox-Cover", () => {
  const comic = buildComic({
    volumeNumber: "2",
    numericBandNumber: 2,
    title: "Hallo... hier Micky!",
    duckipediaPageUrl: "https://de.duckipedia.org/LTB_2",
    duckipediaCoverUrl: "https://example.invalid/Lutabu002.jpg",
    duckipediaCoverFileName: "Lutabu002.jpg",
    duckipediaCoverSource: "infobox-html",
    duckipediaCoverLookupVersion: 3,
    metadataStatus: "found",
    metadataFetchedAt: "2026-08-08T00:00:00.000Z"
  });
  const parsed = parseAndValidateBackup(createJsonBackup([comic], { theme: "dark" }, []));
  assert.equal(parsed.comics[0].duckipediaCoverFileName, "Lutabu002.jpg");
  assert.equal(parsed.comics[0].duckipediaCoverSource, "infobox-html");
  assert.equal(parsed.comics[0].duckipediaCoverLookupVersion, 3);
  assert.equal(parsed.archiveCore.issues[0].duckipediaCoverFileName, "Lutabu002.jpg");
  assert.equal(parsed.archiveCore.issues[0].duckipediaCoverSource, "infobox-html");
  assert.equal(parsed.archiveCore.issues[0].duckipediaCoverLookupVersion, 3);
});
