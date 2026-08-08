import test from "node:test";
import assert from "node:assert/strict";
import {
  QUALITY_BUCKETS,
  buildStatisticsDNA,
  findLargestMissingRun,
  formatMissingRun,
  getQualityBucketForCondition
} from "../statistics-dna.js";

function comic(id, series, band, year, condition, extra = {}) {
  return {
    id,
    issueId: id,
    series,
    volumeNumber: String(band),
    numericBandNumber: band,
    publicationYear: year,
    condition,
    isRead: Boolean(extra.isRead),
    isSealed: Boolean(extra.isSealed),
    isDuplicate: Boolean(extra.duplicate),
    duplicateCondition: extra.duplicateCondition || condition,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

test("Sammlungs-DNA zählt Ausgaben und physische Exemplare getrennt", () => {
  const dna = buildStatisticsDNA({
    comics: [
      comic("a", "Lustiges Taschenbuch", 1, 1990, "1", { isRead: true, duplicate: true, duplicateCondition: "2" }),
      comic("b", "Lustiges Taschenbuch", 2, 1990, "3"),
      comic("c", "LTB History", 1, 2010, "0-1", { isSealed: true })
    ],
    progressData: [],
    missingGroups: []
  });
  assert.equal(dna.uniqueIssues, 3);
  assert.equal(dna.physicalCopies, 4);
  assert.equal(dna.extraCopies, 1);
  assert.equal(dna.duplicateIssues, 1);
  assert.equal(dna.readIssues, 1);
  assert.equal(dna.strongestYear.year, 1990);
  assert.equal(dna.strongestYear.copies, 3);
});

test("Fast geschafft zeigt nur Reihen mit ein bis fünf fehlenden Zielbänden", () => {
  const dna = buildStatisticsDNA({
    comics: [],
    progressData: [
      { series: "A", target: 10, presentWithinTarget: 9, missing: 1, percentage: 90 },
      { series: "B", target: 10, presentWithinTarget: 5, missing: 5, percentage: 50 },
      { series: "C", target: 10, presentWithinTarget: 4, missing: 6, percentage: 40 },
      { series: "D", target: 10, presentWithinTarget: 10, missing: 0, percentage: 100 }
    ],
    missingGroups: []
  });
  assert.deepEqual(dna.nearComplete.map((entry) => entry.series), ["A", "B"]);
});

test("Größte zusammenhängende Lücke wird korrekt erkannt", () => {
  const gap = findLargestMissingRun([
    { series: "A", missingBands: [2, 3, 4, 8] },
    { series: "B", missingBands: [10, 11] }
  ]);
  assert.deepEqual(gap, { series: "A", start: 2, end: 4, length: 3 });
  assert.equal(formatMissingRun(gap), "Band 2–4");
});

test("Qualitätslandkarte verwendet alle offiziellen Zustandsstufen genau einmal", () => {
  const flattened = QUALITY_BUCKETS.flatMap((bucket) => bucket.codes);
  assert.deepEqual(flattened, ["0", "0-1", "1", "1-2", "2", "2-3", "3", "3-4", "4", "5"]);
  assert.equal(getQualityBucketForCondition("0-1").id, "excellent");
  assert.equal(getQualityBucketForCondition("2").id, "good");
  assert.equal(getQualityBucketForCondition("3").id, "used");
  assert.equal(getQualityBucketForCondition("5").id, "weak");
});

test("Qualitätsquote Zustand 1-2 oder besser wird pro Reihe berechnet", () => {
  const dna = buildStatisticsDNA({
    comics: [
      comic("a", "A", 1, 2000, "0"),
      comic("b", "A", 2, 2000, "1-2"),
      comic("c", "A", 3, 2000, "2"),
      comic("d", "A", 4, 2000, "3")
    ]
  });
  const series = dna.series.find((entry) => entry.series === "A");
  assert.equal(series.qualityGood, 2);
  assert.equal(series.copies, 4);
  assert.equal(series.qualityRate, 50);
  assert.deepEqual(series.qualityBuckets, { excellent: 1, good: 2, used: 1, weak: 0 });
});
