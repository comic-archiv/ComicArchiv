import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readAppStyles } from "./test-helpers.mjs";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("4.6.18 nutzt den Archivgraph direkt statt einer comic-förmigen Runtime-Projektion", async () => {
  const [app, runtime, entry] = await Promise.all([
    read("app.js"), read("archive-runtime.js"), read("archive-entry.js")
  ]);
  assert.match(runtime, /createArchiveEntry/);
  assert.doesNotMatch(runtime, /materializeLegacyComics/);
  assert.match(entry, /export function toLegacyComic/);
  assert.match(app, /getArchiveRuntimeCollection/);
  assert.doesNotMatch(app, /materializeLegacyComics|getAllComics/);
});

test("Collection, Missing und Kalender sind eigene Feature-Module", async () => {
  const [app, collection, missing, calendar] = await Promise.all([
    read("app.js"), read("collection-feature.js"), read("missing-feature.js"), read("calendar-feature.js")
  ]);
  assert.match(app, /createCollectionFeature/);
  assert.match(app, /createMissingFeature/);
  assert.match(app, /createCalendarFeature/);
  assert.match(collection, /export function createCollectionFeature/);
  assert.match(missing, /export function createMissingFeature/);
  assert.match(calendar, /export function createCalendarFeature/);
  assert.ok(app.length < 220_000, `app.js ist noch ${app.length} Bytes groß`);
});

test("Scanner wird erst beim Öffnen als Feature geladen", async () => {
  const [app, scannerFeature, worker, build] = await Promise.all([
    read("app.js"), read("scanner-feature.js"), read("service-worker.js"), read("scripts/build-static.mjs")
  ]);
  assert.match(app, /import\("\.\/scanner-feature\.js"\)/);
  assert.doesNotMatch(app, /from "\.\/scanner(?:-pro)?\.js"/);
  assert.match(scannerFeature, /from "\.\/scanner\.js"/);
  assert.match(scannerFeature, /from "\.\/scanner-pro\.js"/);
  const core = worker.match(/const CORE_SHELL = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const onDemand = worker.match(/const ON_DEMAND_ASSETS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.doesNotMatch(core, /scanner(?:-feature|-pro)?\.js/);
  assert.match(onDemand, /scanner-feature\.js/);
  assert.match(onDemand, /scanner\.js/);
  assert.match(onDemand, /scanner-pro\.js/);
  assert.match(build, /"scanner-feature\.js"/);
});

test("CSS ist in geordnete Architekturdateien aufgeteilt", async () => {
  const manifest = await read("style.css");
  const imports = [...manifest.matchAll(/@import\s+url\("(.+?)"\);/g)].map((match) => match[1]);
  assert.deepEqual(imports, [
    "./styles/tokens.css",
    "./styles/base.css",
    "./styles/components.css",
    "./styles/calendar.css",
    "./styles/collection.css",
    "./styles/scanner.css",
    "./styles/statistics.css",
    "./styles/refinements.css"
  ]);
  const css = await readAppStyles();
  assert.match(css, /--page-bg:/);
  assert.match(css, /\.comic-card/);
  assert.match(css, /\.calendar-page-content/);
  assert.match(css, /\.scanner-pro-modal/);
  assert.match(css, /\.statistics-page/);
  assert.ok(manifest.length < 1000);
});
