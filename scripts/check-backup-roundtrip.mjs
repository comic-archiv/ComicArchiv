import assert from "node:assert/strict";
import { createArchiveEntry, getEntryCopies, getEntryId, getEntrySeriesId, getEntryVolumeNumber } from "../archive-entry.js";
import { createArchiveRuntimeCollection } from "../archive-runtime.js";
import { createJsonBackup, parseAndValidateBackup } from "../export.js";

const now = "2026-08-12T05:00:00.000Z";
const seriesMain = { id: "ltb-main", name: "Lustiges Taschenbuch", isCustom: false, createdAt: now, updatedAt: now };
const seriesCustom = { id: "custom-test", name: "Test Sonderreihe", isCustom: true, createdAt: now, updatedAt: now };

const entries = [
  createArchiveEntry({
    series: seriesMain,
    issue: {
      id: "ltb-main:42", seriesId: seriesMain.id, volumeNumber: "42", numericBandNumber: 42,
      title: "Testband", publicationYear: 1972, metadataStatus: "complete",
      duckipediaPageUrl: "https://example.invalid/42", createdAt: now, updatedAt: now
    },
    copies: [
      { id: "copy-42-a", issueId: "ltb-main:42", condition: "1", isRead: true, isSealed: false, notes: "Erstexemplar", displayOrder: 1, createdAt: now, updatedAt: now },
      { id: "copy-42-b", issueId: "ltb-main:42", condition: "2", isRead: false, isSealed: true, notes: "Doppelt", displayOrder: 2, createdAt: now, updatedAt: now },
      { id: "copy-42-c", issueId: "ltb-main:42", condition: "3", isRead: false, isSealed: false, notes: "Tausch", displayOrder: 3, createdAt: now, updatedAt: now }
    ]
  }),
  createArchiveEntry({
    series: seriesCustom,
    issue: {
      id: "custom-test:7", seriesId: seriesCustom.id, volumeNumber: "7", numericBandNumber: 7,
      title: "Sonderband", publicationYear: 2024, metadataStatus: "manual",
      createdAt: now, updatedAt: now
    },
    copies: [
      { id: "copy-custom-7", issueId: "custom-test:7", condition: "0-1", isRead: false, isSealed: false, notes: "", displayOrder: 1, createdAt: now, updatedAt: now }
    ]
  })
];

const settings = {
  theme: "light",
  customSeriesConfigs: [{ id: seriesCustom.id, name: seriesCustom.name, targetBand: 10 }],
  knownHighestBandBySeries: { "Test Sonderreihe": 10 },
  missingBandDetails: { "Test Sonderreihe::8": { priority: "wanted", title: "Gesucht" } },
  fleaMarketSession: { items: { "custom-test:7": { found: true } }, updatedAt: now },
  calendarEvents: [{ id: "event-1", title: "Release", startDate: "2026-08-18", source: "test" }],
  calendarSelectedYear: 2026,
  calendarSelectedMonth: 7,
  releaseRadarFilter: "open",
  releaseRadarDecisions: { "sig-1": "planned" },
  milestoneSeenIds: ["copies-100"]
};
const metadataCache = [{ key: "ltb-main:42", title: "Testband", fetchedAt: now }];

const backupText = createJsonBackup(entries, settings, metadataCache);
const parsed = parseAndValidateBackup(backupText);
assert.equal(parsed.hasArchiveCore, true);
assert.equal(parsed.archiveCore.counts.issues, 2);
assert.equal(parsed.archiveCore.counts.copies, 4);
assert.equal(parsed.settings.theme, "light");
assert.equal(parsed.settings.calendarSelectedMonth, 7);
assert.deepEqual(parsed.settings.milestoneSeenIds, ["copies-100"]);
assert.equal(parsed.metadataCache.length, 1);

const restoredRuntime = createArchiveRuntimeCollection(parsed.archiveCore);
const restoredEntries = restoredRuntime.entries;
assert.deepEqual(
  restoredEntries.map((entry) => ({
    id: getEntryId(entry),
    seriesId: getEntrySeriesId(entry),
    volumeNumber: getEntryVolumeNumber(entry),
    copies: getEntryCopies(entry).map((copy) => ({
      id: copy.id,
      condition: copy.condition,
      isRead: copy.isRead,
      isSealed: copy.isSealed,
      notes: copy.notes
    }))
  })),
  entries.map((entry) => ({
    id: getEntryId(entry),
    seriesId: getEntrySeriesId(entry),
    volumeNumber: getEntryVolumeNumber(entry),
    copies: getEntryCopies(entry).map((copy) => ({
      id: copy.id,
      condition: copy.condition,
      isRead: copy.isRead,
      isSealed: copy.isSealed,
      notes: copy.notes
    }))
  }))
);

const secondBackup = parseAndValidateBackup(createJsonBackup(restoredEntries, parsed.settings, parsed.metadataCache));
assert.equal(secondBackup.archiveCore.counts.issues, parsed.archiveCore.counts.issues);
assert.equal(secondBackup.archiveCore.counts.copies, parsed.archiveCore.counts.copies);
assert.deepEqual(secondBackup.settings.customSeriesConfigs, parsed.settings.customSeriesConfigs);

console.log("✓ Backup → Validierung → Archive-Runtime → erneutes Backup semantisch konsistent");
console.log("✓ 2 Ausgaben, 4 Exemplare, Custom Series, Settings und Metadata-Cache geprüft");
