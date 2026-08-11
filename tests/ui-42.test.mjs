import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readAppStyles } from "./test-helpers.mjs";

const [html, css, app, scannerFeature, sw] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readAppStyles(),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../scanner-feature.js", import.meta.url), "utf8"),
  readFile(new URL("../service-worker.js", import.meta.url), "utf8")
]);

test("Unterseiten-Header liegen undurchlässig über scrollenden Inhalten", () => {
  assert.match(css, /\.app-header,\s*\n\.app-page-header\s*\{[\s\S]*?z-index:\s*120/);
  assert.match(css, /\.app-page-header[\s\S]*?background:\s*var\(--page-bg\)/);
  assert.match(css, /\.app-page\s*\{[\s\S]*?isolation:\s*isolate/);
});

test("Scanner Pro und Zustandsassistent sind in Oberfläche und App verdrahtet", () => {
  for (const id of ["scanner-mode-fast", "scanner-mode-review", "scanner-stat-scanned", "condition-assistant-modal"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /import\("\.\/scanner-feature\.js"\)/);
  assert.match(scannerFeature, /mergeScannerQueueItem/);
  assert.match(scannerFeature, /renderScannerSessionStats/);
  assert.match(app, /openConditionAssistant/);
  assert.match(sw, /\.\/scanner-pro\.js/);
  assert.match(sw, /\.\/condition-assistant\.js/);
});
