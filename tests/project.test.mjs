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


test("Version 4.2.0, Datenformat 9 und Datenbank 5 sind durchgängig verdrahtet", async () => {
  const [config, storage, recovery, version, serviceWorker] = await Promise.all([
    read("config.js"),
    read("storage.js"),
    read("recovery.js"),
    read("version.json"),
    read("service-worker.js")
  ]);
  const versionData = JSON.parse(version);
  assert.equal(versionData.appVersion, "4.2.0");
  assert.equal(versionData.dataFormatVersion, 9);
  assert.equal(versionData.archiveModelVersion, 1);
  assert.match(config, /appVersion:\s*"4\.2\.0"/);
  assert.match(config, /dataFormatVersion:\s*9/);
  assert.match(storage, /const DATABASE_VERSION = 5/);
  assert.match(recovery, /const APP_VERSION = "4\.2\.0"/);
  assert.match(recovery, /const DATA_FORMAT_VERSION = 9/);
  assert.match(serviceWorker, /const APP_VERSION = "4\.2\.0"/);
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

test("Cover-Hotfix nutzt die Duckipedia-Infobox, lädt Regale selbstständig und öffnet Banddetails vollflächig", async () => {
  const [html, css, shelfUi, duckipedia, app] = await Promise.all([
    read("index.html"),
    read("style.css"),
    read("shelf-ui.js"),
    read("duckipedia.js"),
    read("app.js")
  ]);

  assert.doesNotMatch(html, /id="series-range"/);
  assert.match(html, /id="series-load-more"/);
  assert.match(shelfUi, /seriesVisibleLimit/);
  assert.match(shelfUi, /root:\s*elements\.seriesPage/);
  assert.match(shelfUi, /root:\s*elements\.libraryPage/);
  assert.match(shelfUi, /scheduleCoverPriming/);
  assert.match(shelfUi, /isNearScrollViewport/);
  assert.match(shelfUi, /\[0, 120, 420\]/);
  assert.match(shelfUi, /requestRemoteCover/);
  assert.doesNotMatch(shelfUi, /image\.loading\s*=\s*"lazy"/);
  assert.match(duckipedia, /DUCKIPEDIA_LOOKUP_VERSION\s*=\s*3/);
  assert.match(duckipedia, /extractPublicationInfobox/);
  assert.match(duckipedia, /readField\("BILD"/);
  assert.match(duckipedia, /prop:\s*"imageinfo"/);
  assert.match(app, /cachedLookupVersion\s*>=\s*DUCKIPEDIA_LOOKUP_VERSION/);
  assert.match(css, /\.issue-detail-cover\s*\{[\s\S]*?position:\s*relative;/);
  assert.match(css, /#issue-detail-modal \.issue-detail-card\s*\{[\s\S]*?height:\s*min\(90dvh, 840px\)/);
  assert.match(css, /@media \(max-width:\s*620px\)[\s\S]*?#issue-detail-modal \.issue-detail-card\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(css, /#issue-detail-modal \.issue-detail-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.series-hero-summary\s*\{/);
  assert.match(css, /\.series-next-release-date\s*\{/);
});

test("Version 4.2 bindet Scanner Pro, Zustandsassistent und einen überlagerungsfreien Seitenkopf ein", async () => {
  const [html, app, css, serviceWorker, buildScript] = await Promise.all([
    read("index.html"),
    read("app.js"),
    read("style.css"),
    read("service-worker.js"),
    read("scripts/build-static.mjs")
  ]);

  assert.match(html, /id="scanner-mode-fast"/);
  assert.match(html, /id="scanner-mode-review"/);
  assert.match(html, /id="condition-assistant-modal"/);
  assert.match(html, /id="scanner-stat-scanned"/);
  assert.match(app, /mergeScannerQueueItem/);
  assert.match(app, /renderScannerSessionStats/);
  assert.match(app, /evaluateConditionAssessment/);
  assert.match(css, /\.app-page\s*\{[\s\S]*?isolation:\s*isolate/);
  assert.match(css, /\.app-page-header\s*\{[\s\S]*?z-index:\s*1000/);
  assert.match(css, /\.scanner-pro-modal \.scanner-modal-card\s*\{[\s\S]*?height:\s*min\(94dvh, 920px\)/);
  assert.match(css, /\.condition-assistant-card\s*\{[\s\S]*?height:\s*min\(92dvh, 860px\)/);
  assert.match(serviceWorker, /\.\/condition-assistant\.js/);
  assert.match(serviceWorker, /\.\/scanner-pro\.js/);
  assert.match(buildScript, /"condition-assistant\.js"/);
  assert.match(buildScript, /"scanner-pro\.js"/);
});
