import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");

const runtimeEntries = [
  "index.html",
  "style.css",
  "app.js",
  "archive-model.js",
  "asset-loader.js",
  "calendar.js",
  "condition-assistant.js",
  "collector-goals.js",
  "config.js",
  "diagnostics.js",
  "duckipedia.js",
  "export.js",
  "manifest.webmanifest",
  "media.js",
  "missing.js",
  "recovery.js",
  "release-radar.js",
  "scanner.js",
  "scanner-pro.js",
  "shelf.js",
  "shelf-ui.js",
  "share-cards.js",
  "statistics-dna.js",
  "service-worker.js",
  "storage.js",
  "version.json",
  "icons",
  "data",
  "vendor",
  "THIRD-PARTY-NOTICES.md"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of runtimeEntries) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}
console.log(`✓ Produktionspaket mit ${runtimeEntries.length} Laufzeit-Einträgen erstellt: dist/`);
