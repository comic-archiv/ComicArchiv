import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("Statistikseite enthält Sammlungs-DNA, Fast geschafft und Qualitätslandkarte", async () => {
  const html = await read("index.html");
  for (const id of ["dna-summary", "dna-insights", "near-complete-list", "quality-map", "quality-map-legend"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("Statistikmodul ist im App-Code und im Offline-Paket verdrahtet", async () => {
  const [app, serviceWorker, build] = await Promise.all([
    read("app.js"), read("service-worker.js"), read("scripts/build-static.mjs")
  ]);
  assert.match(app, /from "\.\/statistics-dna\.js"/);
  assert.match(serviceWorker, /\.\/statistics-dna\.js/);
  assert.match(build, /"statistics-dna\.js"/);
});

test("Statistikdiagramme können direkt in zugrunde liegende Listen springen", async () => {
  const app = await read("app.js");
  assert.match(app, /function openStatisticsCollection/);
  assert.match(app, /conditionCodes/);
  assert.match(app, /openStatisticsMissingSeries/);
  assert.match(app, /horizontal-chart-row\$\{item\.action \? " is-interactive"/);
});
