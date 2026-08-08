import test from "node:test";
import assert from "node:assert/strict";
import { createMissingDetailKey } from "../config.js";
import {
  buildCollectorMission,
  buildMilestones,
  collectMissingWishlistEntries,
  compareWishlistEntries,
  normalizeWishlistPriority
} from "../collector-goals.js";

test("Wunschlisten-Prioritäten werden normalisiert und sinnvoll sortiert", () => {
  assert.equal(normalizeWishlistPriority("WANTED"), "wanted");
  assert.equal(normalizeWishlistPriority("unbekannt"), "");
  const entries = [
    { series: "A", bandNumber: 1, priority: "someday" },
    { series: "A", bandNumber: 2, priority: "wanted" },
    { series: "A", bandNumber: 3, priority: "" },
    { series: "A", bandNumber: 4, priority: "pickup" },
    { series: "A", bandNumber: 5, priority: "ignore" }
  ].sort(compareWishlistEntries);
  assert.deepEqual(entries.map((entry) => entry.bandNumber), [2, 4, 3, 1, 5]);
});

test("Fehlbanddetails übernehmen Prioritäten in die Wunschliste", () => {
  const entries = collectMissingWishlistEntries([
    { series: "Lustiges Taschenbuch", missingBands: [2, 3] }
  ], {
    missingBandDetails: {
      [createMissingDetailKey("Lustiges Taschenbuch", 2)]: { priority: "wanted", title: "Zwei" },
      [createMissingDetailKey("Lustiges Taschenbuch", 3)]: { priority: "ignore" }
    }
  });
  assert.equal(entries[0].bandNumber, 2);
  assert.equal(entries[0].priority, "wanted");
  assert.equal(entries[1].priority, "ignore");
});

test("Mission priorisiert fast vollständige Reihen vor Einzelwünschen", () => {
  const mission = buildCollectorMission({
    progressData: [
      { series: "LTB History", configuredTarget: 10, target: 10, presentWithinTarget: 9, missing: 1, percentage: 90 }
    ],
    missingGroups: [{ series: "Lustiges Taschenbuch", missingBands: [4] }],
    settings: { missingBandDetails: { [createMissingDetailKey("Lustiges Taschenbuch", 4)]: { priority: "wanted" } } }
  });
  assert.equal(mission.action.type, "missing-series");
  assert.equal(mission.action.series, "LTB History");
});

test("Ignorierte Fehlbände werden nicht als nächste Mission vorgeschlagen", () => {
  const mission = buildCollectorMission({
    progressData: [],
    missingGroups: [{ series: "LTB Fantasy", missingBands: [1] }],
    settings: { missingBandDetails: { [createMissingDetailKey("LTB Fantasy", 1)]: { priority: "ignore" } } }
  });
  assert.equal(mission.action, null);
});

test("Meilensteine entstehen nur aus echten Bestandsmarken oder expliziten Reihenzielen", () => {
  const comics = Array.from({ length: 100 }, (_, index) => ({
    id: `c-${index}`,
    series: "Lustiges Taschenbuch",
    volumeNumber: String(index + 1),
    numericBandNumber: index + 1,
    condition: "1",
    isRead: false,
    isSealed: false,
    isDuplicate: false
  }));
  const milestones = buildMilestones({
    comics,
    progressData: [
      { series: "Lustiges Taschenbuch", configuredTarget: 200, target: 200, presentWithinTarget: 100, percentage: 50 },
      { series: "Ohne Ziel", configuredTarget: 0, target: 3, presentWithinTarget: 3, percentage: 100 }
    ]
  });
  assert.ok(milestones.some((entry) => entry.id === "copies:100"));
  assert.ok(milestones.some((entry) => entry.id === "main-progress:50"));
  assert.ok(!milestones.some((entry) => entry.id === "series-complete:Ohne Ziel"));
});
