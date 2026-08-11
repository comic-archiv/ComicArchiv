import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const notes = [];

const requiredFiles = [
  ".gitignore",
  "index.html",
  "style.css",
  "styles/tokens.css",
  "styles/base.css",
  "styles/components.css",
  "styles/calendar.css",
  "styles/collection.css",
  "styles/scanner.css",
  "styles/statistics.css",
  "styles/refinements.css",
  "app.js",
  "app-elements.js",
  "archive-model.js",
  "archive-entry.js",
  "data-stack.js",
  "config.js",
  "storage.js",
  "missing.js",
  "missing-feature.js",
  "collection-feature.js",
  "calendar-feature.js",
  "export.js",
  "scanner-feature.js",
  "scanner.js",
  "scanner-pro.js",
  "shelf.js",
  "shelf-ui.js",
  "statistics-dna.js",
  "duckipedia.js",
  "media.js",
  "calendar.js",
  "condition-assistant.js",
  "condition-ui.js",
  "asset-loader.js",
  "diagnostics.js",
  "recovery.js",
  "release-radar.js",
  "service-worker.js",
  "manifest.webmanifest",
  "version.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-1024.png",
  "icons/apple-touch-icon.png",
  "vendor/quagga.min.js",
  "vendor/jspdf.umd.min.js",
  "data/kalender-index.json",
  "data/ltb-2026.ics",
  "scripts/sync-release-calendars.mjs",
  ".github/workflows/deploy-pages.yml"
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) errors.push(`Pflichtdatei fehlt: ${file}`);
}

const [html, appSource, appElementsSource, shelfUiSource, configSource, storageSource, archiveModelSource, exportSource, recoverySource, serviceWorkerSource, styleManifestSource, releaseRadarSource, calendarFeatureSource, syncSource, workflowSource, calendarCatalog, packageJson, versionJson, manifest] = await Promise.all([
  readText("index.html"),
  readText("app.js"),
  readText("app-elements.js"),
  readText("shelf-ui.js"),
  readText("config.js"),
  readText("storage.js"),
  readText("archive-model.js"),
  readText("export.js"),
  readText("recovery.js"),
  readText("service-worker.js"),
  readText("style.css"),
  readText("release-radar.js"),
  readText("calendar-feature.js"),
  readText("scripts/sync-release-calendars.mjs"),
  readText(".github/workflows/deploy-pages.yml"),
  readJson("data/kalender-index.json"),
  readJson("package.json"),
  readJson("version.json"),
  readJson("manifest.webmanifest")
]);
const styleImportPaths = [...styleManifestSource.matchAll(/@import\s+url\(["'](.+?)["']\)/g)].map((match) => match[1].replace(/^\.\//, ""));
const styleSource = styleImportPaths.length
  ? (await Promise.all(styleImportPaths.map((file) => readText(file)))).join("\n")
  : styleManifestSource;

const configVersion = matchOne(configSource, /appVersion:\s*"([^"]+)"/, "App-Version in config.js");
const configDataVersion = Number(matchOne(configSource, /dataFormatVersion:\s*(\d+)/, "Datenformat in config.js"));
const configArchiveModelVersion = Number(matchOne(configSource, /export const ARCHIVE_MODEL_VERSION = (\d+)/, "Archivmodell-Version in config.js"));
const configDataStackVersion = Number(matchOne(configSource, /export const DATA_STACK_VERSION = (\d+)/, "Data-Stack-Version in config.js"));
const swVersion = matchOne(serviceWorkerSource, /const APP_VERSION = "([^"]+)"/, "App-Version im Service Worker");
const htmlVersion = matchOne(html, /id="app-version">v([^<]+)</, "sichtbare Version in index.html");
const versions = new Set([packageJson.version, versionJson.appVersion, configVersion, swVersion, htmlVersion]);
if (versions.size !== 1) {
  errors.push(`Versionsnummern sind uneinheitlich: ${[...versions].join(", ")}`);
}
if (Number(versionJson.dataFormatVersion) !== configDataVersion) {
  errors.push(`Datenformat ist uneinheitlich: version.json=${versionJson.dataFormatVersion}, config.js=${configDataVersion}`);
}
if (Number(versionJson.archiveModelVersion) !== configArchiveModelVersion) {
  errors.push(`Archivmodell ist uneinheitlich: version.json=${versionJson.archiveModelVersion}, config.js=${configArchiveModelVersion}`);
}
if (Number(versionJson.dataStackVersion) !== configDataStackVersion) {
  errors.push(`Data Stack ist uneinheitlich: version.json=${versionJson.dataStackVersion}, config.js=${configDataStackVersion}`);
}
const recoveryVersion = matchOne(recoverySource, /const APP_VERSION = "([^"]+)"/, "App-Version im sicheren Modus");
const recoveryDataVersion = Number(matchOne(recoverySource, /const DATA_FORMAT_VERSION = (\d+)/, "Datenformat im sicheren Modus"));
const recoveryArchiveVersion = Number(matchOne(recoverySource, /const ARCHIVE_MODEL_VERSION = (\d+)/, "Archivmodell im sicheren Modus"));
if (recoveryVersion !== configVersion || recoveryDataVersion !== configDataVersion || recoveryArchiveVersion !== configArchiveModelVersion) {
  errors.push("Versionen im sicheren Modus stimmen nicht mit config.js überein.");
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) errors.push(`Doppelte HTML-IDs: ${[...new Set(duplicateIds)].join(", ")}`);
const idSet = new Set(ids);
const queriedIds = [...`${appSource}\n${appElementsSource}\n${shelfUiSource}`.matchAll(/document\.querySelector\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
const queriedElementIds = [...shelfUiSource.matchAll(/byId\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
queriedIds.push(...queriedElementIds);
const missingIds = [...new Set(queriedIds.filter((id) => !idSet.has(id)))];
if (missingIds.length) errors.push(`App-JavaScript referenziert fehlende HTML-IDs: ${missingIds.join(", ")}`);

if (/vendor\/(?:quagga|jspdf)[^"']*\.js/.test(html)) {
  errors.push("Scanner- oder PDF-Bibliothek wird noch direkt in index.html geladen. Sie soll nur bei Bedarf geladen werden.");
}
const recoveryIndex = html.indexOf('<script src="./recovery.js"></script>');
const appIndex = html.indexOf('<script src="./app.js" type="module"></script>');
if (recoveryIndex < 0 || appIndex < 0 || recoveryIndex > appIndex) {
  errors.push("recovery.js muss vor app.js eingebunden werden.");
}
const uiSource = `${appSource}\n${shelfUiSource}`;
if (/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(uiSource)) {
  errors.push("Die App-Oberfläche verwendet eine unsichere HTML-Einfügung. Nutzereingaben müssen über textContent/DOM-Knoten ausgegeben werden.");
}
if (!html.includes('id="recovery-panel"') || !html.includes('id="diagnostics-modal"')) {
  errors.push("Sicherer Modus oder Diagnoseoberfläche fehlt in index.html.");
}
if (!html.includes('id="test-mode-banner"') || !appSource.includes("comicarchiv-db-test") && !styleSource.includes("test-mode-banner")) {
  errors.push("Der getrennte Testmodus ist nicht vollständig eingebunden.");
}

const archiveStores = ["seriesCatalog", "issues", "copies", "archiveMeta", "migrationSnapshots"];
for (const store of archiveStores) {
  if (!storageSource.includes(`"${store}"`)) errors.push(`Archivkern-Speicher fehlt in storage.js: ${store}`);
}
const dataStackStores = ["preferences", "calendarState", "missingState", "fleaMarketState", "releaseRadarState", "collectorState", "dataStackMeta", "dataStackSnapshots"];
for (const store of dataStackStores) {
  if (!storageSource.includes(`"${store}"`)) errors.push(`Data-Stack-Speicher fehlt in storage.js: ${store}`);
}
if (!storageSource.includes("const DATABASE_VERSION = 6")) errors.push("Data Stack v2 Foundation benötigt Datenbankversion 6.");
if (!html.includes('id="archive-migration-modal"') || !html.includes('id="copy-manager-list"')) {
  errors.push("Migrationsbericht oder Exemplarmanager fehlt in index.html.");
}
if (!archiveModelSource.includes("migrateLegacyComicsToArchive") || !archiveModelSource.includes("validateArchiveGraph")) {
  errors.push("Der modulare Archivkern ist unvollständig.");
}
if (!exportSource.includes("archiveCore")) {
  errors.push("JSON-Backups enthalten keinen expliziten Archivkern.");
}

if (!html.includes('id="release-radar-page"') || !html.includes('id="open-release-radar-home"')) {
  errors.push("Erscheinungsradar oder Startseiten-Einstieg fehlt in index.html.");
}
if (!calendarFeatureSource.includes("createReleaseRadarItems") || !releaseRadarSource.includes("buildReleaseRadarItems")) {
  errors.push("Erscheinungsradar ist nicht vollständig in App und Modul verdrahtet.");
}
if (!styleSource.includes("body.app-page-open > .app-header") || !styleSource.includes("visibility: hidden")) {
  errors.push("Der Hotfix gegen verdeckte Unterseiten-Zurück-Buttons fehlt.");
}
if (!workflowSource.includes("npm run calendar:sync") || !workflowSource.includes("schedule:")) {
  errors.push("GitHub Actions enthält keine automatische Jahresplan-Prüfung.");
}
if (!syncSource.includes("extractIcsLinks") || Number(calendarCatalog.schemaVersion) !== 2) {
  errors.push("Kalender-Synchronisierung oder Kalenderindex Version 2 fehlt.");
}

const shellAssets = [
  ...extractArrayStrings(serviceWorkerSource, "CORE_SHELL"),
  ...extractArrayStrings(serviceWorkerSource, "OPTIONAL_SHELL"),
  ...extractArrayStrings(serviceWorkerSource, "ON_DEMAND_ASSETS")
];
for (const asset of shellAssets) {
  if (!asset.startsWith("./") || asset === "./") continue;
  const localPath = asset.slice(2).split(/[?#]/)[0];
  if (!existsSync(join(root, localPath))) errors.push(`Service Worker referenziert fehlende Datei: ${asset}`);
}
const coreShellAssets = extractArrayStrings(serviceWorkerSource, "CORE_SHELL");
if (coreShellAssets.includes("./")) errors.push("Service Worker darf ./ und ./index.html nicht doppelt precachen.");
if (coreShellAssets.includes("./icons/icon-1024.png")) errors.push("Das 1024er Icon darf nicht Teil des Core-Precaches sein.");
if (coreShellAssets.includes("./scanner.js") || coreShellAssets.includes("./scanner-pro.js") || coreShellAssets.includes("./scanner-feature.js")) errors.push("Scanner-Module dürfen nicht Teil des Core-Precaches sein.");
for (const cssFile of styleImportPaths) {
  if (!coreShellAssets.includes(`./${cssFile}`)) errors.push(`CSS-Modul fehlt im Core-Precache: ${cssFile}`);
}
if (!serviceWorkerSource.includes("async function cacheFirst(request)")) errors.push("Cache-first-Strategie für statische Assets fehlt im Service Worker.");

for (const icon of manifest.icons || []) {
  const src = String(icon.src || "").replace(/^\.\//, "");
  if (!src || !existsSync(join(root, src))) errors.push(`Manifest-Icon fehlt: ${icon.src || "(leer)"}`);
}
if (!String(manifest.name || "").startsWith("Entenarchiv") || manifest.short_name !== "Entenarchiv") {
  errors.push("Manifest-Name ist nicht vollständig auf Entenarchiv gesetzt.");
}

const sourceFiles = await walk(root);
const privateExportPatterns = [
  /^Entenarchiv-(?:Backup|Medien-Backup|Diagnose|TEST-Diagnose|Migrationsbericht)-.*\.json$/i,
  /^Entenarchiv-(?:Sammlung|Fehlende-Baende)-.*\.csv$/i,
  /^Entenarchiv-Flohmarkt-Suchliste-.*\.pdf$/i,
  /^Entenarchiv-Share-.*\.png$/i,
  /^Entenarchiv-Erscheinungsradar-.*\.ics$/i
];
const privateExports = sourceFiles.filter((file) => {
  const name = relative(root, file).split(/[\\/]/).pop() || "";
  return privateExportPatterns.some((pattern) => pattern.test(name));
});
if (privateExports.length) {
  errors.push(`Private Entenarchiv-Exporte im Repository gefunden: ${privateExports.map((file) => relative(root, file)).join(", ")}`);
}
const syntaxFiles = sourceFiles.filter((file) => [".js", ".mjs"].includes(extname(file)) && !file.includes(`${join(root, "vendor")}`));
for (const file of syntaxFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    errors.push(`JavaScript-Syntaxfehler in ${relative(root, file)}: ${String(error.stderr || error.message).trim()}`);
  }
}

if (appSource.length > 260_000) notes.push(`app.js ist mit ${Math.round(appSource.length / 1024)} KB noch groß; weitere Feature-Extraktion bleibt sinnvoll.`);
if (!styleImportPaths.length) errors.push("CSS-Architektur ist nicht modularisiert: style.css enthält keine Imports.");

if (errors.length) {
  console.error("\nEntenarchiv-Validierung fehlgeschlagen:\n");
  errors.forEach((entry) => console.error(`  ✗ ${entry}`));
  process.exitCode = 1;
} else {
  console.log(`✓ ${requiredFiles.length} Pflichtdateien vorhanden`);
  console.log(`✓ Version ${configVersion} und Datenformat ${configDataVersion} konsistent`);
  console.log(`✓ ${ids.length} eindeutige HTML-IDs und ${queriedIds.length} statische App-Selektoren geprüft`);
  console.log(`✓ ${shellAssets.length} Offline-Dateien geprüft`);
  console.log(`✓ ${syntaxFiles.length} JavaScript-Dateien syntaktisch geprüft`);
  console.log("✓ Scanner und PDF-Modul werden erst bei Bedarf geladen");
  console.log("✓ Diagnose, sicherer Modus und Testmodus sind eingebunden");
  console.log("✓ Archivkern, digitales Regal und Version-4-Backupformat sind eingebunden");
  console.log("✓ Erscheinungsradar, Zurück-Button-Hotfix und automatische Jahrespläne sind eingebunden");
  notes.forEach((entry) => console.log(`Hinweis: ${entry}`));
}

async function readText(file) {
  try {
    return await readFile(join(root, file), "utf8");
  } catch (error) {
    errors.push(`${file} konnte nicht gelesen werden: ${error.message}`);
    return "";
  }
}

async function readJson(file) {
  const text = await readText(file);
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${file} enthält kein gültiges JSON: ${error.message}`);
    return {};
  }
}

function matchOne(text, expression, label) {
  const match = text.match(expression);
  if (!match) {
    errors.push(`${label} wurde nicht gefunden.`);
    return "";
  }
  return match[1];
}

function extractArrayStrings(source, name) {
  const match = source.match(new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) {
    errors.push(`${name} wurde im Service Worker nicht gefunden.`);
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}
