import test from "node:test";
import assert from "node:assert/strict";
import { calculateMissingBands, countMissingBands } from "../missing.js";

test("Fehlende Bände werden pro Reihe korrekt erkannt", () => {
  const result = calculateMissingBands([
    { series: "Lustiges Taschenbuch", volumeNumber: "1" },
    { series: "Lustiges Taschenbuch", volumeNumber: "2" },
    { series: "Lustiges Taschenbuch", volumeNumber: "3" },
    { series: "Lustiges Taschenbuch", volumeNumber: "5" },
    { series: "Lustiges Taschenbuch", volumeNumber: "6" },
    { series: "Lustiges Taschenbuch", volumeNumber: "9" }
  ]);
  assert.deepEqual(result[0].missingBands, [4, 7, 8]);
  assert.equal(countMissingBands(result), 3);
});

test("Mehrere Exemplare derselben Ausgabe zählen nur einmal", () => {
  const result = calculateMissingBands([
    { series: "LTB Fantasy", volumeNumber: "1" },
    { series: "LTB Fantasy", volumeNumber: "1" },
    { series: "LTB Fantasy", volumeNumber: "3" }
  ]);
  assert.deepEqual(result[0].missingBands, [2]);
  assert.equal(result[0].presentCount, 2);
});

test("Nicht numerische Bandnummern erzeugen keinen Fehler", () => {
  const result = calculateMissingBands([
    { series: "Sonstige", volumeNumber: "Sonderband A" },
    { series: "Sonstige", volumeNumber: "2" }
  ]);
  assert.deepEqual(result[0].missingBands, [1]);
});

test("Eine entfernte Reihenziel-Konfiguration erzeugt keine Geisterreihe", () => {
  const withTarget = calculateMissingBands([], { "Gelöschte Reihe": 5 });
  assert.equal(withTarget.length, 1);
  const withoutTarget = calculateMissingBands([], {});
  assert.deepEqual(withoutTarget, []);
});
