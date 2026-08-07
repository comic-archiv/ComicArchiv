import test from "node:test";
import assert from "node:assert/strict";
import {
  createCollectionCsv,
  createJsonBackup,
  parseAndValidateBackup
} from "../export.js";

test("CSV behandelt Semikolon, Anführungszeichen, Umlaute und Zeilenumbrüche", () => {
  const csv = createCollectionCsv([{
    id: "comic-1",
    series: "Lustiges Taschenbuch",
    volumeNumber: "1",
    title: "Ärger; \"aber gut\"",
    publicationYear: 1967,
    condition: "1",
    duplicateCondition: null,
    isRead: true,
    isSealed: false,
    isDuplicate: false,
    notes: "Zeile 1\nZeile 2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /"Ärger; ""aber gut"""/);
  assert.match(csv, /"Zeile 1\nZeile 2"/);
});

test("Ein erzeugtes Backup lässt sich wieder validieren", () => {
  const now = new Date().toISOString();
  const comics = [{
    id: "comic-1",
    dataFormatVersion: 8,
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
    createdAt: now,
    updatedAt: now
  }];
  const text = createJsonBackup(comics, { theme: "dark" }, []);
  const parsed = parseAndValidateBackup(text);
  assert.equal(parsed.comics.length, 1);
  assert.equal(parsed.comics[0].condition, "1");
  assert.equal(parsed.backupType, "data");
});
