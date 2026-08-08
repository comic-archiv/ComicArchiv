import test from "node:test";
import assert from "node:assert/strict";
import { buildShareCardPayload } from "../share-cards.js";

const context = {
  dna: {
    physicalCopies: 681,
    uniqueIssues: 642,
    extraCopies: 39,
    strongestYear: { year: 1997, copies: 38 },
    bestQualitySeries: { series: "LTB History", qualityRate: 87.4 },
    series: [{ series: "Lustiges Taschenbuch" }]
  },
  mainProgress: { presentWithinTarget: 428, target: 610, missing: 182, percentage: 70.16 },
  milestone: { eyebrow: "Reihe vollständig", title: "LTB History komplett", copy: "20 von 20 Zielbänden vorhanden." },
  totalSeries: 27,
  totalMissing: 182,
  generatedAt: new Date("2026-08-08T10:00:00Z")
};

test("Share Card Meine Sammlung verwendet ausschließlich Sammlungsdaten", () => {
  const payload = buildShareCardPayload("collection", context);
  assert.equal(payload.headline, "681 Bücher");
  assert.deepEqual(payload.stats.map((entry) => entry.value), ["27", "182", "39"]);
});

test("Share Card Hauptreihe bildet Reihenziel und Vollständigkeit ab", () => {
  const payload = buildShareCardPayload("main-series", context);
  assert.equal(payload.headline, "428 / 610");
  assert.match(payload.subline, /70,2 % vollständig/);
});

test("Meilenstein- und DNA-Karten bleiben feste Editorial-Templates", () => {
  const milestone = buildShareCardPayload("milestone", context);
  const dna = buildShareCardPayload("dna", context);
  assert.equal(milestone.headline, "LTB History komplett");
  assert.equal(milestone.note, "Aus meinem Entenarchiv.");
  assert.equal(dna.headline, "1997");
  assert.equal(dna.stats[2].value, "87 %");
});
