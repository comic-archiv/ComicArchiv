import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("schwere Scanner- und PDF-Bibliotheken werden nicht beim App-Start geladen", async () => {
  const html = await read("index.html");
  assert.doesNotMatch(html, /vendor\/quagga[^"']*\.js/);
  assert.doesNotMatch(html, /vendor\/jspdf[^"']*\.js/);
  assert.match(html, /<script src="\.\/recovery\.js"><\/script>\s*<script src="\.\/app\.js" type="module"><\/script>/);
});

test("Sicherer Modus, Diagnose und getrennte Testdatenbank sind vorhanden", async () => {
  const [html, storage, recovery] = await Promise.all([
    read("index.html"),
    read("storage.js"),
    read("recovery.js")
  ]);
  assert.match(html, /id="recovery-panel"/);
  assert.match(html, /id="diagnostics-modal"/);
  assert.match(html, /id="test-mode-banner"/);
  assert.match(storage, /comicarchiv-db-test/);
  assert.match(recovery, /Notfall-Backup/);
});

test("Service Worker unterscheidet kritische und optionale Offline-Dateien", async () => {
  const source = await read("service-worker.js");
  assert.match(source, /const CORE_SHELL/);
  assert.match(source, /const OPTIONAL_SHELL/);
  assert.match(source, /const ON_DEMAND_ASSETS/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /GET_STATUS/);
});
