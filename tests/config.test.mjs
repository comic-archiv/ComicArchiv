import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_CONFIG,
  createDuckipediaUrl,
  getAvailableSeries,
  getConditionRank,
  normalizeConditionCode
} from "../config.js";

test("Version und Zustandssystem sind konsistent", () => {
  assert.equal(APP_CONFIG.appVersion, "4.6.19");
  assert.equal(APP_CONFIG.dataFormatVersion, 9);
  assert.deepEqual(APP_CONFIG.conditions.map((entry) => entry.code), [
    "0", "0-1", "1", "1-2", "2", "2-3", "3", "3-4", "4", "5"
  ]);
  assert.equal(getConditionRank("0"), 0);
  assert.equal(getConditionRank("5"), 9);
});

test("Alte Zustände werden verlustfrei auf das deutsche Raster übertragen", () => {
  assert.equal(normalizeConditionCode("N"), "0-1");
  assert.equal(normalizeConditionCode("NM"), "1");
  assert.equal(normalizeConditionCode("VF"), "1-2");
  assert.equal(normalizeConditionCode("FN"), "2");
  assert.equal(normalizeConditionCode("VG"), "2-3");
  assert.equal(normalizeConditionCode("GD"), "3");
  assert.equal(normalizeConditionCode("FR"), "3-4");
  assert.equal(normalizeConditionCode("PR"), "4");
});

test("Duckipedia-Pfade erhalten Umlaute korrekt", () => {
  assert.equal(
    createDuckipediaUrl("LTB präsentiert", 8),
    "https://de.duckipedia.org/LTB_pr%C3%A4sentiert_8"
  );
});

test("Reihenliste wird ohne doppelte Einträge zusammengeführt", () => {
  const result = getAvailableSeries({
    customSeries: ["Eigene Reihe"],
    customSeriesConfigs: [{ name: "Eigene Reihe", duckipediaPattern: "" }]
  }, [{ series: "Eigene Reihe" }, { series: "Archiv-Reihe" }]);
  assert.equal(result.filter((entry) => entry === "Eigene Reihe").length, 1);
  assert.ok(result.includes("Archiv-Reihe"));
});
