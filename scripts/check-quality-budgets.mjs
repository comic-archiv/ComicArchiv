import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(await readFile(join(root, "quality-budgets.json"), "utf8"));
const [html, worker] = await Promise.all([
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "service-worker.js"), "utf8")
]);

const failures = [];
const results = [];

const appBytes = await fileSize("app.js");
check("app.js", appBytes, budgets.appJsMaxBytes, "Bytes");

const activeDomElements = countActiveDomElements(html);
check("Initial aktives DOM", activeDomElements, budgets.activeDomMaxElements, "Elemente");

const coreAssets = extractArrayStrings(worker, "CORE_SHELL");
check("Core-Precache", coreAssets.length, budgets.coreShellMaxAssets, "Assets");
let coreBytes = 0;
for (const asset of coreAssets) coreBytes += await fileSize(asset.replace(/^\.\//, ""));
check("Core-Precache", coreBytes, budgets.coreShellMaxBytes, "Bytes");

const styleFiles = (await readdir(join(root, "styles"))).filter((file) => file.endsWith(".css"));
let cssBytes = await fileSize("style.css");
for (const file of styleFiles) cssBytes += await fileSize(join("styles", file));
check("Runtime-CSS", cssBytes, budgets.runtimeCssMaxBytes, "Bytes");

const runtimeJs = (await readdir(root)).filter((file) => file.endsWith(".js"));
let jsBytes = 0;
let largest = { file: "", bytes: 0 };
for (const file of runtimeJs) {
  const bytes = await fileSize(file);
  jsBytes += bytes;
  if (bytes > largest.bytes) largest = { file, bytes };
}
check("Runtime-JavaScript", jsBytes, budgets.runtimeJavaScriptMaxBytes, "Bytes");
check(`Größtes Runtime-Modul (${largest.file})`, largest.bytes, budgets.largestRuntimeModuleMaxBytes, "Bytes");

for (const result of results) console.log(`✓ ${result}`);
if (failures.length) {
  console.error("\nPerformance-/Architektur-Budget überschritten:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

function check(label, actual, maximum, unit) {
  const detail = `${label}: ${format(actual, unit)} / max. ${format(maximum, unit)}`;
  results.push(detail);
  if (actual > maximum) failures.push(detail);
}

async function fileSize(relativePath) {
  return (await stat(join(root, relativePath))).size;
}

function extractArrayStrings(source, name) {
  const match = source.match(new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) throw new Error(`${name} fehlt im Service Worker.`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function countActiveDomElements(source) {
  const withoutTemplates = source.replace(/<template\b[\s\S]*?<\/template>/gi, "");
  return (withoutTemplates.match(/<([a-zA-Z][\w:-]*)(?:\s|>|\/)/g) || []).length;
}

function format(value, unit) {
  if (unit === "Bytes") return `${(value / 1024).toFixed(1)} KB`;
  return `${value} ${unit}`;
}
