import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFile(resolve(root, file), "utf8");

test("4.6.0 nutzt einen schlanken, strategiegetrennten Service Worker", async () => {
  const worker = await source("service-worker.js");
  const core = worker.match(/const CORE_SHELL = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.doesNotMatch(core, /"\.\/",/);
  assert.doesNotMatch(core, /icon-1024\.png/);
  assert.match(core, /scanner\.js/);
  assert.match(core, /share-cards\.js/);
  assert.match(worker, /async function cacheFirst\(request\)/);
  assert.match(worker, /shouldUseNetworkFirst\(request, requestUrl\)/);
});

test("versteckte Vollansichten werden nicht bei jedem Collection-Refresh gerendert", async () => {
  const app = await source("app.js");
  assert.match(app, /if \(!elements\.collectionPage\.classList\.contains\("hidden"\)\) renderCollection\(\);/);
  assert.match(app, /if \(!elements\.missingPage\.classList\.contains\("hidden"\)\) renderMissingBands\(\);/);
  assert.match(app, /if \(!elements\.progressPage\.classList\.contains\("hidden"\)\) renderSeriesProgress\(\);/);
  assert.match(app, /if \(elements\.statisticsPage\.classList\.contains\("hidden"\)\) return;/);
  assert.match(app, /function openStatisticsPage\(\) \{\s+elements\.statisticsPage\.classList\.remove\("hidden"\);\s+renderStats\(\);/);
  assert.match(app, /from "\.\/scanner\.js"/);
  assert.match(app, /from "\.\/share-cards\.js"/);
});

test("Bulk-Speicherung und Metadaten-GC sind im Storage-Layer vorhanden", async () => {
  const storage = await source("storage.js");
  const app = await source("app.js");
  assert.match(storage, /export async function saveArchiveEntriesBatch\(comics\)/);
  assert.match(storage, /database\.transaction\(stores, "readwrite"\)/);
  assert.match(storage, /export async function pruneMetadataCache/);
  assert.match(app, /await upsertArchiveEntries\(entries\);/);
});

test("Release-Versionstests werden beim Versionsbump synchron gehalten", async () => {
  const script = await source("ComicArchiv-4.6.0-cleanup.mjs").catch(() => "");
  if (!script) return;
  assert.match(script, /syncCurrentReleaseVersionTests/);
});

test("private Exporte und generiertes dist sind von Git ausgeschlossen", async () => {
  const gitignore = await source(".gitignore");
  assert.match(gitignore, /^dist\/$/m);
  assert.match(gitignore, /^Entenarchiv-Medien-Backup-\*\.json$/m);
  assert.match(gitignore, /^Entenarchiv-Diagnose-\*\.json$/m);
});
