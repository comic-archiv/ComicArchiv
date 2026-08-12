import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("Version 4.5 enthält genau eine Missionsfläche, Meilensteine und Share Cards", async () => {
  const html = await read("index.html");
  for (const id of [
    "collector-mission", "milestone-panel", "milestone-list", "open-share-card",
    "share-card-modal", "share-card-canvas", "missing-detail-priority", "flea-market-priority-filter"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.equal((html.match(/id="collector-mission"/g) || []).length, 1);
});

test("Sammelziele und Share Cards sind App-, Build- und Offline-Bestandteil", async () => {
  const [app, serviceWorker, build] = await Promise.all([
    read("app.js"), read("service-worker.js"), read("scripts/build-static.mjs")
  ]);
  assert.match(app, /from "\.\/collector-goals\.js"/);
  assert.match(app, /from "\.\/share-cards\.js"/);
  assert.match(serviceWorker, /\.\/collector-goals\.js/);
  assert.match(serviceWorker, /\.\/share-cards\.js/);
  assert.match(build, /"collector-goals\.js"/);
  assert.match(build, /"share-cards\.js"/);
});

test("Flohmarkt und Fehlbanddetails sind mit Suchprioritäten verdrahtet", async () => {
  const [app, missingFeature, calendarFeature, exportCode] = await Promise.all([
    read("app.js"), read("missing-feature.js"), read("calendar-feature.js"), read("export.js")
  ]);
  assert.match(missingFeature, /normalizeWishlistPriority\(detail\.priority\)/);
  assert.match(app, /fleaMarketPriorityFilter/);
  assert.match(calendarFeature, /data-radar-priority/);
  assert.match(calendarFeature, /handleReleaseRadarPriorityChange/);
  assert.match(exportCode, /"Priorität"/);
  assert.match(exportCode, /doc\.text\("Prio"/);
});

test("App-Version und Cache-Version sind synchron", async () => {
  const [config, worker, metadata] = await Promise.all([read("config.js"), read("service-worker.js"), read("version.json")]);
  assert.match(config, /appVersion:\s*"4\.6\.21"/);
  assert.match(worker, /APP_VERSION\s*=\s*"4\.6\.21"/);
  assert.match(worker, /v4-6-21/);
  assert.equal(JSON.parse(metadata).appVersion, "4.6.21");
});
