import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("Dashboard nutzt eine volle Fehlbandzeile und kompakte Mission ohne sichtbare Dachzeile", async () => {
  const [html, css] = await Promise.all([read("index.html"), read("style.css")]);
  assert.match(html, /stat-card-highlight stat-card-wide/);
  assert.match(css, /\.stat-card-wide[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(html, /class="visually-hidden" id="collector-mission-eyebrow"/);
});

test("Sammelziel und Neuerscheinung verwenden dasselbe Icon-Raster", async () => {
  const [html, css] = await Promise.all([read("index.html"), read("style.css")]);
  assert.match(html, /collector-mission-mark dashboard-feature-icon/);
  assert.match(html, /release-radar-home-icon dashboard-feature-icon/);
  assert.match(css, /\.dashboard-feature-icon[\s\S]*?width:\s*46px[\s\S]*?height:\s*46px/);
  assert.match(css, /stroke-width:\s*1\.9/);
});

test("Startseiten-Sektionstitel verzichten auf redundante Dachzeilen", async () => {
  const html = await read("index.html");
  assert.doesNotMatch(html, /Gespeicherte Einträge/);
  assert.doesNotMatch(html, /Automatische Prüfung/);
});

test("Backup-Aktionen nutzen ein gleichmäßiges Zweispaltenraster", async () => {
  const css = await read("style.css");
  const polish = css.slice(css.lastIndexOf("Entenarchiv 4.5.2"));
  assert.match(polish, /\.backup-actions \.primary-button\s*\{\s*grid-column:\s*auto/);
});

test("Share-Card-Dialog respektiert die iOS-Safe-Area und Karten besitzen ein Archivmotiv", async () => {
  const [css, cards] = await Promise.all([read("style.css"), read("share-cards.js")]);
  assert.match(css, /#share-card-modal[\s\S]*?env\(safe-area-inset-top\)/);
  assert.match(cards, /drawArchiveMotif/);
  assert.match(cards, /const labels = payload\.template === "main-series"/);
});

test("Sammlungs-DNA reserviert Platz für den Navigationspfeil", async () => {
  const css = await read("style.css");
  const polish = css.slice(css.lastIndexOf("Entenarchiv 4.5.2"));
  assert.match(polish, /\.dna-insight-card\s*\{\s*padding-right:\s*46px/);
  assert.match(polish, /\.dna-insight-card > strong[\s\S]*?white-space:\s*normal/);
});

test("Meilensteine besitzen Seltenheitsstufen", async () => {
  const [app, css] = await Promise.all([read("app.js"), read("style.css")]);
  assert.match(app, /function getMilestoneVisual/);
  assert.match(app, /rarity:\s*"legendary"/);
  assert.match(css, /\.milestone-rarity-legendary/);
});

test("Kalender priorisiert Monatsansicht und versteckt Verwaltung in aufklappbaren Werkzeugen", async () => {
  const html = await read("index.html");
  assert.match(html, /class="calendar-command-bar"/);
  assert.match(html, /<details class="panel calendar-tools-panel">/);
  assert.match(html, /<strong>Suche &amp; Filter<\/strong>/);
  assert.match(html, /<strong>Kalender verwalten<\/strong>/);
  assert.ok(html.indexOf('id="calendar-grid"') < html.indexOf('id="calendar-search"'));
});

test("4.5.2-Version und Cache-Version sind synchron", async () => {
  const [config, worker, metadata, recovery, packageSource] = await Promise.all([
    read("config.js"), read("service-worker.js"), read("version.json"), read("recovery.js"), read("package.json")
  ]);
  assert.match(config, /appVersion:\s*"4\.5\.3"/);
  assert.match(worker, /APP_VERSION\s*=\s*"4\.5\.3"/);
  assert.match(worker, /v4-5-3/);
  assert.match(recovery, /const APP_VERSION = "4\.5\.3"/);
  assert.equal(JSON.parse(metadata).appVersion, "4.5.3");
  assert.equal(JSON.parse(packageSource).version, "4.5.3");
});
