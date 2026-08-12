import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(resolve(root, file), "utf8");

test("4.6.22 verankert Hardening-Prüfungen in der normalen CI", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.version, "4.6.22");
  assert.match(packageJson.scripts.ci, /npm run hardening/);
  assert.match(packageJson.scripts.hardening, /quality:budget/);
  assert.match(packageJson.scripts.hardening, /quality:dead/);
  assert.match(packageJson.scripts.hardening, /backup:roundtrip/);
  assert.match(packageJson.scripts.hardening, /repo:hygiene/);
});

test("Service Worker hält große Installationsicons aus dem Core-Precache und wartet bei Updates", async () => {
  const worker = await read("service-worker.js");
  const core = worker.match(/const CORE_SHELL = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.doesNotMatch(core, /icon-512\.png/);
  assert.doesNotMatch(core, /apple-touch-icon\.png/);
  assert.match(core, /app-update\.js/);
  assert.match(worker, /if \(!self\.registration\.active\) await self\.skipWaiting\(\)/);
});

test("Update-Hinweis ist sichtbar verdrahtet und alter Worker-State ist aus App-State entfernt", async () => {
  const [html, app, elements, state] = await Promise.all([
    read("index.html"), read("app.js"), read("app-elements.js"), read("app-state.js")
  ]);
  assert.match(html, /id="app-update-banner"/);
  assert.match(elements, /appUpdateAction/);
  assert.match(app, /createAppUpdateController/);
  assert.doesNotMatch(app, /function registerServiceWorker/);
  assert.doesNotMatch(state, /waitingServiceWorker/);
});

test("Legacy-Kompatibilität ist dokumentiert und alte Hotfix-Zwischenberichte sind entfernt", async () => {
  const legacy = await read("LEGACY-COMPATIBILITY.md");
  assert.match(legacy, /Leere IndexedDB-Schema-Hüllen/);
  assert.match(legacy, /Backup-Kompatibilitätsprojektion/);
  assert.match(legacy, /Recovery-Modus/);
});
