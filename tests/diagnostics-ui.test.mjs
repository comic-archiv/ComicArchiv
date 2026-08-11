import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("Diagnose-UI ist aus app.js ausgelagert", async () => {
  const [app, ui] = await Promise.all([read("app.js"), read("diagnostics-ui.js")]);
  assert.match(app, /createDiagnosticsUI/);
  assert.doesNotMatch(app, /function renderDiagnosticReport/);
  assert.match(ui, /collectDiagnosticReport/);
  assert.match(ui, /downloadDiagnosticReport/);
});
