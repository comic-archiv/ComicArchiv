import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBulkPatch,
  buildSeriesSummaries,
  buildShelfSlots,
  buildSmartListCounts,
  filterSeriesComics,
  getShelfRanges,
  matchesSmartList,
  sortSeriesComics,
  sortSeriesSummaries,
  summarizeMissingRanges
} from "../shelf.js";

function comic({
  id,
  series = "Lustiges Taschenbuch",
  seriesId = "ltb-main",
  band,
  title = "",
  year = 2026,
  condition = "2",
  isRead = false,
  isSealed = false,
  copies = 1,
  cover = ""
}) {
  const copyList = Array.from({ length: copies }, (_, index) => ({
    id: `${id}-copy-${index + 1}`,
    issueId: id,
    condition: index === 0 ? condition : "2-3",
    isRead: index === 0 ? isRead : false,
    isSealed: index === 0 ? isSealed : false,
    notes: "",
    displayOrder: index + 1
  }));
  return {
    id,
    series,
    seriesId,
    volumeNumber: String(band),
    numericBandNumber: Number.isInteger(band) ? band : null,
    title,
    publicationYear: year,
    condition,
    isRead,
    isSealed,
    isDuplicate: copies > 1,
    copies: copyList,
    copyCount: copyList.length,
    duckipediaPageUrl: title ? `https://de.duckipedia.org/${id}` : "",
    duckipediaCoverUrl: cover,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: `2026-01-${String(Math.min(28, Number(band) || 1)).padStart(2, "0")}T10:00:00.000Z`
  };
}

test("intelligente Listen erkennen ungelesene, doppelte und unvollständige Metadaten", () => {
  const unread = comic({ id: "a", band: 1, title: "Erster Band", isRead: false });
  const duplicate = comic({ id: "b", band: 2, title: "Zweiter Band", copies: 2, isRead: true });
  const incomplete = comic({ id: "c", band: 3, title: "", year: null });
  const counts = buildSmartListCounts([unread, duplicate, incomplete]);
  assert.equal(counts.unread, 2);
  assert.equal(counts.duplicates, 1);
  assert.equal(counts.metadata, 1);
  assert.equal(matchesSmartList(duplicate, "duplicates"), true);
});

test("Reihenzusammenfassung nutzt Ziel, Lücken, Exemplare und Vollständigkeit", () => {
  const summaries = buildSeriesSummaries({
    comics: [comic({ id: "a", band: 1 }), comic({ id: "b", band: 3, copies: 2 })],
    missingGroups: [{ series: "Lustiges Taschenbuch", missingBands: [2, 4] }],
    targets: { "Lustiges Taschenbuch": 4 }
  });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].issueCount, 2);
  assert.equal(summaries[0].copyCount, 3);
  assert.equal(summaries[0].missingCount, 2);
  assert.equal(summaries[0].completionPercentage, 50);
});

test("Hauptreihe bleibt bei Sortierungen immer an erster Stelle", () => {
  const sorted = sortSeriesSummaries([
    { seriesId: "x", series: "Andere Reihe", completionPercentage: 100, issueCount: 20, copyCount: 20 },
    { seriesId: "ltb-main", series: "Lustiges Taschenbuch", completionPercentage: 10, issueCount: 1, copyCount: 1 }
  ], "completion");
  assert.equal(sorted[0].seriesId, "ltb-main");
});

test("digitales Regal mischt vorhandene Bände und sichtbare Lücken korrekt", () => {
  const result = buildShelfSlots([
    comic({ id: "a", band: 1 }),
    comic({ id: "b", band: 3 })
  ], { target: 5 });
  assert.deepEqual(result.slots.map((slot) => [slot.bandNumber, slot.type]), [
    [1, "owned"], [2, "missing"], [3, "owned"], [4, "missing"], [5, "missing"]
  ]);
});

test("lange Reihen werden in kompakte Bandbereiche aufgeteilt", () => {
  assert.deepEqual(getShelfRanges(125, 60), [
    { start: 1, end: 60, label: "1–60" },
    { start: 61, end: 120, label: "61–120" },
    { start: 121, end: 125, label: "121–125" }
  ]);
});

test("Sammelbearbeitung ändert nur ausgewählte Ausgaben und alle ihre Exemplare", () => {
  const first = comic({ id: "a", band: 1, copies: 2, isRead: false });
  const second = comic({ id: "b", band: 2, isRead: false });
  const result = applyBulkPatch([first, second], new Set(["a"]), { isRead: true, condition: "1-2" }, {
    now: "2026-08-07T12:00:00.000Z"
  });
  assert.equal(result.changed, 1);
  assert.ok(result.comics[0].copies.every((copy) => copy.isRead && copy.condition === "1-2"));
  assert.equal(result.comics[1].isRead, false);
});


test("Coverlisten berücksichtigen lokale Cover-IDs ohne Bilddateien zu laden", () => {
  const withoutCover = comic({ id: "cover-local", band: 7, title: "Lokales Cover" });
  withoutCover.duckipediaCoverUrl = "";
  assert.equal(matchesSmartList(withoutCover, "no-cover", { localCoverIds: new Set() }), true);
  assert.equal(matchesSmartList(withoutCover, "no-cover", { localCoverIds: new Set(["cover-local"]) }), false);
});

test("Reihenfilter unterscheiden ungelesene, folierte, mehrfache und schwächere Ausgaben", () => {
  const unread = comic({ id: "unread", band: 1, isRead: false });
  const sealed = comic({ id: "sealed", band: 2, isRead: true, isSealed: true });
  const duplicate = comic({ id: "duplicate", band: 3, copies: 2, isRead: true });
  const care = comic({ id: "care", band: 4, condition: "3", isRead: true });
  const source = [unread, sealed, duplicate, care];
  assert.deepEqual(filterSeriesComics(source, "unread").map((entry) => entry.id), ["unread"]);
  assert.deepEqual(filterSeriesComics(source, "sealed").map((entry) => entry.id), ["sealed"]);
  assert.deepEqual(filterSeriesComics(source, "duplicates").map((entry) => entry.id), ["duplicate"]);
  assert.deepEqual(filterSeriesComics(source, "needs-care").map((entry) => entry.id), ["care"]);
});

test("Reihenlisten sortieren Bandnummern natürlich und fassen Lücken kompakt zusammen", () => {
  const source = [
    comic({ id: "ten", band: 10 }),
    comic({ id: "two", band: 2 }),
    comic({ id: "one", band: 1 })
  ];
  assert.deepEqual(sortSeriesComics(source, "volume-asc").map((entry) => entry.volumeNumber), ["1", "2", "10"]);
  assert.equal(summarizeMissingRanges([2, 3, 4, 8, 10, 11]), "2–4, 8, 10–11");
});
