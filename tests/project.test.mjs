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

test("Archivkern, Migrationsbericht und getrennte physische Exemplare sind eingebunden", async () => {
  const [html, storage, archiveModel, exportSource, recovery] = await Promise.all([
    read("index.html"),
    read("storage.js"),
    read("archive-model.js"),
    read("export.js"),
    read("recovery.js")
  ]);
  assert.match(html, /id="archive-migration-modal"/);
  assert.match(html, /id="copy-manager-list"/);
  for (const store of ["seriesCatalog", "issues", "copies", "archiveMeta", "migrationSnapshots"]) {
    assert.match(storage, new RegExp(`"${store}"`));
  }
  assert.match(archiveModel, /migrateLegacyComicsToArchive/);
  assert.match(archiveModel, /materializeLegacyComics/);
  assert.match(exportSource, /archiveCore/);
  assert.match(recovery, /backup\.archiveCore/);
});


test("Version 4.1, Datenformat 9 und Datenbank 5 sind durchgängig verdrahtet", async () => {
  const [config, storage, recovery, version, serviceWorker] = await Promise.all([
    read("config.js"),
    read("storage.js"),
    read("recovery.js"),
    read("version.json"),
    read("service-worker.js")
  ]);
  const versionData = JSON.parse(version);
  assert.equal(versionData.appVersion, "4.1.0");
  assert.equal(versionData.dataFormatVersion, 9);
  assert.equal(versionData.archiveModelVersion, 1);
  assert.match(config, /appVersion:\s*"4\.1\.0"/);
  assert.match(config, /dataFormatVersion:\s*9/);
  assert.match(storage, /const DATABASE_VERSION = 5/);
  assert.match(recovery, /const APP_VERSION = "4\.1\.0"/);
  assert.match(recovery, /const DATA_FORMAT_VERSION = 9/);
  assert.match(serviceWorker, /const APP_VERSION = "4\.1\.0"/);
});

test("Service Worker hält den Archivkern im kritischen Offline-Paket", async () => {
  const source = await read("service-worker.js");
  const coreBlock = source.match(/const CORE_SHELL = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.match(coreBlock, /\.\/archive-model\.js/);
  assert.match(coreBlock, /\.\/storage\.js/);
  assert.match(coreBlock, /\.\/export\.js/);
});


test("Digitales Regal, Reihenbibliothek und Sammelbearbeitung sind eingebunden", async () => {
  const [html, app, shelf, shelfUi, serviceWorker] = await Promise.all([
    read("index.html"),
    read("app.js"),
    read("shelf.js"),
    read("shelf-ui.js"),
    read("service-worker.js")
  ]);
  assert.match(html, /id="library-page"/);
  assert.match(html, /id="series-page"/);
  assert.match(html, /id="series-bulk-bar"/);
  assert.match(html, /id="issue-detail-modal"/);
  assert.match(app, /createShelfUI/);
  assert.match(shelf, /buildShelfSlots/);
  assert.match(shelf, /applyBulkPatch/);
  assert.match(shelfUi, /openSeries/);
  assert.match(shelfUi, /getAllCoverMediaKeys/);
  assert.match(shelfUi, /initialSnapshot\.localCoverIds/);
  assert.match(serviceWorker, /\.\/shelf-ui\.js/);
});
