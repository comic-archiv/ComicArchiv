import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReleaseRadarItems,
  createReleaseEventSignature,
  filterReleaseRadarItems,
  getReleaseCollectionState,
  getReleaseRadarBadgeCount,
  getReleaseTimingLabel,
  mergeKnownReleaseSignatures,
  normalizeReleaseDecisionMap,
  normalizeReleaseSeriesCatalog,
  resolveReleaseIdentity,
  summarizeReleaseRadar
} from "../release-radar.js";

const seriesCatalog = [
  { id: "ltb-main", name: "Lustiges Taschenbuch", aliases: ["LTB", "Lustiges Taschenbuch"] },
  { id: "ltb-ostern", name: "LTB Ostern", aliases: ["LTB Frohe Ostern", "LTB Ostern"] },
  { id: "ltb-fantasy-entenhausen", name: "LTB Fantasy Entenhausen", aliases: ["LTB Fantasy Entenhausen"] }
];

const event = (title, startDate, uid = "") => ({
  id: `${title}-${startDate}`,
  uid,
  source: "publisher",
  sourceId: "ltb-2026-v2",
  category: "release",
  title,
  startDate,
  allDay: true
});

test("Erscheinungsradar ordnet LTB-Aliasse stabil einer Ausgabe zu", () => {
  assert.deepEqual(resolveReleaseIdentity(event("LTB 614", "2026-08-25"), seriesCatalog), {
    seriesId: "ltb-main",
    series: "Lustiges Taschenbuch",
    bandNumber: 614,
    key: "ltb-main:614",
    matchedAlias: "LTB",
    title: "LTB 614"
  });
  const ostern = resolveReleaseIdentity(event("LTB Frohe Ostern 18", "2026-03-10"), seriesCatalog);
  assert.equal(ostern?.seriesId, "ltb-ostern");
  assert.equal(ostern?.bandNumber, 18);
});

test("längere Reihenaliase gewinnen vor dem allgemeinen LTB-Alias", () => {
  const result = resolveReleaseIdentity(event("LTB Fantasy Entenhausen 5", "2026-05-01"), seriesCatalog);
  assert.equal(result?.seriesId, "ltb-fantasy-entenhausen");
  assert.equal(result?.bandNumber, 5);
});

test("nicht eindeutig zuordenbare Verlagstermine bleiben im Radar sichtbar", () => {
  const items = buildReleaseRadarItems([event("Donald Duck Sonderheft 464", "2026-09-02")], {
    seriesCatalog,
    today: "2026-08-08"
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].identity, null);
  assert.match(items[0].key, /^event:/);
  assert.equal(items[0].collection.type, "unlinked");
});

test("Sammlungsstatus unterscheidet vorhanden, fehlend und nicht vorgemerkt", () => {
  const identity = resolveReleaseIdentity(event("LTB 614", "2026-08-25"), seriesCatalog);
  assert.equal(getReleaseCollectionState(identity, [{ seriesId: "ltb-main", numericBandNumber: 614 }], []).type, "owned");
  assert.equal(getReleaseCollectionState(identity, [], [{ seriesId: "ltb-main", missingBands: [614] }]).type, "missing");
  assert.equal(getReleaseCollectionState(identity, [], []).type, "unplanned");
});

test("bekannte Signaturen verhindern alte Termine als neu zu markieren", () => {
  const release = event("LTB 614", "2026-08-25", "ltb-614@example");
  const signature = createReleaseEventSignature(release);
  const [known] = buildReleaseRadarItems([release], {
    seriesCatalog,
    knownSignatures: [signature],
    today: "2026-08-08"
  });
  const [fresh] = buildReleaseRadarItems([release], {
    seriesCatalog,
    knownSignatures: [],
    today: "2026-08-08"
  });
  assert.equal(known.isNew, false);
  assert.equal(fresh.isNew, true);
});

test("Entscheidungen werden validiert und steuern Filter sowie Kennzahlen", () => {
  const decisions = normalizeReleaseDecisionMap({
    "ltb-main:614": { status: "ordered", updatedAt: "2026-08-01T10:00:00.000Z" },
    "ltb-main:615": { status: "kaputt", updatedAt: "2026-08-01T10:00:00.000Z" },
    "": { status: "watch" }
  });
  assert.deepEqual(Object.keys(decisions), ["ltb-main:614"]);

  const releases = [
    event("LTB 614", "2026-08-25", "614"),
    event("LTB 615", "2026-09-15", "615"),
    event("LTB 613", "2026-08-08", "613")
  ];
  const items = buildReleaseRadarItems(releases, {
    seriesCatalog,
    decisions,
    knownSignatures: [createReleaseEventSignature(releases[1])],
    today: "2026-08-08"
  });
  assert.equal(filterReleaseRadarItems(items, "ordered").length, 1);
  assert.equal(filterReleaseRadarItems(items, "new").length, 2);
  assert.equal(summarizeReleaseRadar(items, "2026-08-08").orderedCount, 1);
  assert.equal(summarizeReleaseRadar(items, "2026-08-08").todayCount, 1);
  assert.equal(getReleaseRadarBadgeCount(items, "2026-08-08"), 2);
});

test("vorhandene und ignorierte Ausgaben erzeugen weder offene Treffer noch App-Badges", () => {
  const releases = [event("LTB 614", "2026-08-25", "614"), event("LTB 615", "2026-09-15", "615")];
  const items = buildReleaseRadarItems(releases, {
    seriesCatalog,
    comics: [{ seriesId: "ltb-main", numericBandNumber: 614 }],
    decisions: { "ltb-main:615": { status: "ignored", updatedAt: "2026-08-01T10:00:00.000Z" } },
    today: "2026-08-08"
  });
  assert.equal(filterReleaseRadarItems(items, "open").length, 0);
  assert.equal(getReleaseRadarBadgeCount(items, "2026-08-08"), 0);
  assert.equal(summarizeReleaseRadar(items, "2026-08-08").next, null);
});

test("Signaturen werden dedupliziert und Zeitlabels sind verständlich", () => {
  const release = event("LTB 614", "2026-08-25", "614");
  const signature = createReleaseEventSignature(release);
  assert.deepEqual(mergeKnownReleaseSignatures([signature], [release]), [signature]);
  const items = buildReleaseRadarItems([
    event("LTB 613", "2026-08-08", "613"),
    event("LTB 614", "2026-08-09", "614"),
    event("LTB 612", "2026-08-07", "612")
  ], { seriesCatalog, today: "2026-08-08" });
  assert.equal(getReleaseTimingLabel(items.find((item) => item.event.uid === "613")), "Heute");
  assert.equal(getReleaseTimingLabel(items.find((item) => item.event.uid === "614")), "Morgen");
  assert.equal(getReleaseTimingLabel(items.find((item) => item.event.uid === "612")), "Seit gestern erhältlich");
});

test("Reihenkatalog entfernt doppelte IDs und bewahrt Aliasse", () => {
  const result = normalizeReleaseSeriesCatalog([
    { id: "ltb-main", name: "Lustiges Taschenbuch", aliases: ["LTB"] },
    { id: "ltb-main", name: "Doppelt", aliases: ["Nope"] },
    { id: "custom", name: "Eigene Reihe" }
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].aliases, ["Lustiges Taschenbuch", "LTB"]);
});
