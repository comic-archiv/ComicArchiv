import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("4.5.1 bündelt Radien und Abstände in einem Design-System", async () => {
  const css = await read("style.css");
  assert.match(css, /--radius-card:\s*18px/);
  assert.match(css, /--radius-control:\s*14px/);
  assert.match(css, /--radius-sheet:\s*24px/);
  assert.match(css, /Entenarchiv 4\.5\.1: Design-System & Layout-Polish/);
});

test("Zurück-Buttons sind auf allen Unterseiten quadratische Icon-Aktionen", async () => {
  const css = await read("style.css");
  assert.match(css, /\.app-page-back\s*\{[\s\S]*?width:\s*48px[\s\S]*?height:\s*48px[\s\S]*?padding:\s*0/);
  assert.match(css, /\.app-page-back span\s*\{[\s\S]*?display:\s*none\s*!important/);
});

test("Share Cards verwenden ein dichtes 2x2-Faktenraster statt einer leeren Mittelzone", async () => {
  const source = await read("share-cards.js");
  assert.match(source, /drawStatsGrid/);
  assert.match(source, /const cellWidth = \(width - gap\) \/ 2/);
  assert.match(source, /stats\.slice\(0, 4\)/);
  assert.match(source, /SAMMLUNGSKARTE/);
});

test("App-Version und Cache-Version sind synchron", async () => {
  const [config, worker, metadata, recovery] = await Promise.all([
    read("config.js"), read("service-worker.js"), read("version.json"), read("recovery.js")
  ]);
  assert.match(config, /appVersion:\s*"4\.6\.5"/);
  assert.match(worker, /APP_VERSION\s*=\s*"4\.6\.5"/);
  assert.match(worker, /v4-6-5/);
  assert.match(recovery, /const APP_VERSION = "4\.6\.5"/);
  assert.equal(JSON.parse(metadata).appVersion, "4.6.5");
});
