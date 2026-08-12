import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules", "vendor"]);
const files = await walk(root);
const searchableFiles = files.filter((file) => [".js", ".mjs", ".html"].includes(extname(file)));
const runtimeFiles = searchableFiles.filter((file) => extname(file) === ".js" && !file.includes(`${join(root, "tests")}`) && !file.includes(`${join(root, "scripts")}`));
const sources = new Map(await Promise.all(searchableFiles.map(async (file) => [file, await readFile(file, "utf8")])));
const dead = [];

for (const file of runtimeFiles) {
  const source = sources.get(file) || "";
  const exports = [
    ...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g),
    ...source.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)
  ].map((match) => match[1]);

  for (const name of new Set(exports)) {
    const ownOccurrences = countIdentifier(source, name);
    if (ownOccurrences > 1) continue;
    const referencedElsewhere = searchableFiles.some((other) => other !== file && countIdentifier(sources.get(other) || "", name) > 0);
    if (!referencedElsewhere) dead.push(`${relative(file)}: ${name}`);
  }
}

if (dead.length) {
  console.error("Tote exportierte Runtime-Symbole gefunden:");
  dead.forEach((entry) => console.error(`- ${entry}`));
  process.exit(1);
}
console.log("✓ Keine vollständig unreferenzierten Runtime-Exports gefunden");

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else result.push(absolute);
  }
  return result;
}

function countIdentifier(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (source.match(new RegExp(`\\b${escaped}\\b`, "g")) || []).length;
}

function relative(file) {
  return file.slice(root.length + 1).replace(/\\/g, "/");
}
