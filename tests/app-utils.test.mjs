import test from "node:test";
import assert from "node:assert/strict";
import { compareBandNumbers, formatBytes, normalizeHttpUrl, normalizeSearchText, parseStrictPositiveInteger } from "../app-utils.js";

test("App-Utilities sind zustandsfrei ausgelagert", () => {
  assert.equal(parseStrictPositiveInteger("42"), 42);
  assert.equal(parseStrictPositiveInteger("0"), null);
  assert.equal(compareBandNumbers({ numericBandNumber: 2, volumeNumber: "2" }, { numericBandNumber: 10, volumeNumber: "10" }) < 0, true);
  assert.equal(normalizeSearchText("Äpfel & Öl"), "apfel & ol");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(normalizeHttpUrl("https://example.com/x"), "https://example.com/x");
});
