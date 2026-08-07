import test from "node:test";
import assert from "node:assert/strict";
import { parseSupplementToBandNumber } from "../scanner.js";

test("Zwei- und fünfstellige Zusatzcodes werden als Bandnummer erkannt", () => {
  assert.equal(parseSupplementToBandNumber("03"), 3);
  assert.equal(parseSupplementToBandNumber("00239"), 239);
});

test("Ungültige Zusatzcodes werden abgelehnt", () => {
  assert.equal(parseSupplementToBandNumber("0"), null);
  assert.equal(parseSupplementToBandNumber("00000"), null);
  assert.equal(parseSupplementToBandNumber("ABC"), null);
});
