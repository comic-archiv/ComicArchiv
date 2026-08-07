import test from "node:test";
import assert from "node:assert/strict";
import {
  ContinuousDetectionGate,
  SCANNER_MODES,
  classifyScannerResult,
  createScannerQueueKey,
  mergeScannerQueueItem,
  normalizeScannerMode,
  summarizeScannerQueue
} from "../scanner-pro.js";

test("Scanner-Modus wird auf Schnellmodus normalisiert", () => {
  assert.equal(normalizeScannerMode("review"), SCANNER_MODES.REVIEW);
  assert.equal(normalizeScannerMode("unbekannt"), SCANNER_MODES.FAST);
});

test("wiederholte Scans derselben Ausgabe ergänzen Exemplare statt Ausgaben zu duplizieren", () => {
  const first = {
    queueId: "q1",
    series: "Lustiges Taschenbuch",
    numericBandNumber: 239,
    copyDrafts: [{ condition: "1", isRead: false, isSealed: false, notes: "" }],
    metadataStatus: "found",
    scanCount: 1
  };
  const second = {
    queueId: "q2",
    series: "Lustiges Taschenbuch",
    numericBandNumber: 239,
    copyDrafts: [{ condition: "2", isRead: true, isSealed: false, notes: "Flohmarktfund" }],
    metadataStatus: "queued",
    scanCount: 1
  };
  const initial = mergeScannerQueueItem([], first);
  const merged = mergeScannerQueueItem(initial.queue, second);
  assert.equal(merged.queue.length, 1);
  assert.equal(merged.item.copyDrafts.length, 2);
  assert.equal(merged.item.scanCount, 2);
  assert.equal(merged.item.metadataStatus, "found");
});

test("Scannerstatus unterscheidet vorhandene Ausgaben und Prüfbedarf", () => {
  assert.equal(classifyScannerResult({
    existingComicId: "issue-1",
    action: "additional-copy",
    metadataStatus: "found",
    copyDrafts: [{ condition: "2" }]
  }).id, "additional-copy");
  assert.equal(classifyScannerResult({
    recognitionSource: "manual",
    metadataStatus: "not-found",
    copyDrafts: [{ condition: "2" }]
  }).needsReview, true);
});

test("Sitzungsübersicht zählt Scans, Ausgaben und physische Exemplare getrennt", () => {
  const summary = summarizeScannerQueue([
    {
      series: "Lustiges Taschenbuch",
      numericBandNumber: 1,
      scanCount: 2,
      metadataStatus: "found",
      copyDrafts: [{ condition: "1" }, { condition: "2" }]
    },
    {
      series: "LTB Spezial",
      numericBandNumber: 1,
      scanCount: 1,
      existingComicId: "existing",
      action: "additional-copy",
      metadataStatus: "found",
      copyDrafts: [{ condition: "2-3" }]
    }
  ]);
  assert.deepEqual(
    { scans: summary.scans, total: summary.total, copies: summary.copies, new: summary.new, existing: summary.existing },
    { scans: 3, total: 2, copies: 3, new: 1, existing: 1 }
  );
});

test("Dauererkennung akzeptiert denselben Barcode erst nach einer leeren Szene erneut", () => {
  const gate = new ContinuousDetectionGate({ releaseAfterEmptyMs: 500 });
  const payload = { mainBarcode: "123", extension: "00239", bandNumber: 239 };
  assert.equal(gate.accept(payload, 0), true);
  assert.equal(gate.accept(payload, 100), false);
  gate.markEmpty(200);
  gate.markEmpty(800);
  assert.equal(gate.accept(payload, 900), true);
  assert.equal(createScannerQueueKey("Lustiges Taschenbuch", 239), "lustiges-taschenbuch::239");
});
