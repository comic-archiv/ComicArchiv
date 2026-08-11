import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("globale Kopfzeile verdeckt keine Zurück-Buttons mehr", async () => {
  const css = await read("style.css");
  assert.match(css, /body\.app-page-open\s*>\s*\.app-header\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.app-page-header\s*\{[\s\S]*?z-index:\s*1000;/);
  assert.match(css, /\.app-page-header\s+\.app-page-back\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*2;/);
});

test("Erscheinungsradar ist auf Startseite, Kalenderseite und in der Navigation erreichbar", async () => {
  const [html, app, css] = await Promise.all([read("index.html"), read("app.js"), read("style.css")]);
  for (const id of [
    "open-release-radar-home",
    "open-release-radar-calendar",
    "release-radar-page",
    "close-release-radar",
    "release-radar-list",
    "release-radar-filter-tabs",
    "release-radar-badge-enabled",
    "calendar-nav-badge"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /createReleaseRadarItems/);
  assert.match(app, /openReleaseRadarPage/);
  assert.match(app, /renderReleaseRadarIndicators/);
  assert.match(app, /exportWatchedReleaseReminders/);
  assert.match(css, /\.release-radar-card/);
  assert.match(css, /\.release-radar-home-card/);
  assert.match(css, /\.bottom-nav-badge/);
});

test("Erscheinungsradar bleibt bei Data Stack v2 mit Datenformat 9 und Archivmodell 1 kompatibel", async () => {
  const [config, storage, version] = await Promise.all([read("config.js"), read("storage.js"), read("version.json")]);
  const metadata = JSON.parse(version);
  assert.equal(metadata.appVersion, "4.6.12");
  assert.equal(metadata.dataFormatVersion, 9);
  assert.equal(metadata.archiveModelVersion, 1);
  assert.match(config, /releaseRadarDecisions:\s*Object\.freeze\(\{\}\)/);
  assert.match(config, /releaseRadarKnownSignatures:\s*Object\.freeze\(\[\]\)/);
  assert.match(config, /releaseSeriesAliases:\s*Object\.freeze\(\{\}\)/);
  assert.match(config, /releaseEventLinks:\s*Object\.freeze\(\{\}\)/);
  assert.match(storage, /const DATABASE_VERSION = 6/);
  assert.match(storage, /normalizeReleaseDecisionMap/);
  assert.match(storage, /normalizeKnownReleaseSignatures/);
});

test("Service Worker und Produktions-Build enthalten das Radar-Modul", async () => {
  const [worker, build] = await Promise.all([read("service-worker.js"), read("scripts/build-static.mjs")]);
  assert.match(worker, /\.\/release-radar\.js/);
  assert.match(build, /"release-radar\.js"/);
});

test("GitHub Actions prüft wöchentlich auf offizielle Jahrespläne", async () => {
  const [workflow, sync, catalog, packageJson] = await Promise.all([
    read(".github/workflows/deploy-pages.yml"),
    read("scripts/sync-release-calendars.mjs"),
    read("data/kalender-index.json"),
    read("package.json")
  ]);
  const index = JSON.parse(catalog);
  const pkg = JSON.parse(packageJson);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:\s*['"]17 4 \* \* 1['"]/);
  assert.match(workflow, /npm run calendar:sync/);
  assert.match(sync, /lustiges-taschenbuch\.de\/downloads/);
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.discovery.pageUrl, "https://www.lustiges-taschenbuch.de/downloads");
  assert.equal(pkg.scripts["calendar:sync"], "node scripts/sync-release-calendars.mjs");
});

test("App-Badge ist optional und wird nur über die Plattform-API gesetzt", async () => {
  const app = await read("app.js");
  assert.match(app, /navigator\.setAppBadge/);
  assert.match(app, /navigator\.clearAppBadge/);
  assert.match(app, /Notification\.requestPermission/);
  assert.match(app, /releaseRadarBadgeEnabled/);
});


test("nicht zugeordnete Neuerscheinungen können direkt einer Reihe zugeordnet werden", async () => {
  const [html, app, css] = await Promise.all([read("index.html"), read("app.js"), read("style.css")]);
  for (const id of [
    "release-link-modal",
    "release-link-form",
    "release-link-existing-series",
    "release-link-new-name",
    "release-link-alias",
    "release-link-band"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /openReleaseLinkModal/);
  assert.match(app, /handleReleaseLinkSubmit/);
  assert.match(app, /dataset\.calendarReleaseLink/);
  assert.match(css, /\.release-link-card/);
});
