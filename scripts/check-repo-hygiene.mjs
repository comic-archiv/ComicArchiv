import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const forbiddenRootPatterns = [
  /^ComicArchiv-.*\.(?:mjs|zip|txt)$/i,
  /^QUALITY-4\./i,
  /^CHECKSUMS-SHA256\.txt$/i
];

for (const entry of await readdir(root)) {
  if (forbiddenRootPatterns.some((pattern) => pattern.test(entry))) failures.push(`Einmalige/alte Root-Datei: ${entry}`);
}

const workflows = await readdir(join(root, ".github", "workflows"));
const unexpectedWorkflows = workflows.filter((name) => name !== "deploy-pages.yml");
if (unexpectedWorkflows.length) failures.push(`Einmalige Workflows vorhanden: ${unexpectedWorkflows.join(", ")}`);

for (const required of ["LEGACY-COMPATIBILITY.md", "QUALITY-REPORT.md", "quality-budgets.json"]) {
  if (!existsSync(join(root, required))) failures.push(`Hygiene-Pflichtdatei fehlt: ${required}`);
}
if (existsSync(join(root, "dist"))) {
  // Ein lokaler Build darf dist erzeugen; in der CI vor dem Build ist es nicht vorhanden.
  // Deshalb ist das allein kein Fehler.
}

if (failures.length) {
  console.error("Repo-Hygiene fehlgeschlagen:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("✓ Repo-Hygiene: nur permanenter Deploy-Workflow und aktuelle Qualitätsdokumente vorhanden");
