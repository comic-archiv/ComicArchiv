import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConditionBadge } from "../condition-ui.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFile(resolve(root, file), "utf8");

test("4.6.19 teilt den Zustands-Badge als explizites UI-Modul", async () => {
  const [app, collection, helper, build, worker] = await Promise.all([
    source("app.js"),
    source("collection-feature.js"),
    source("condition-ui.js"),
    source("scripts/build-static.mjs"),
    source("service-worker.js")
  ]);
  assert.match(app, /import \{ createConditionBadge \} from "\.\/condition-ui\.js";/);
  assert.match(collection, /import \{ createConditionBadge \} from "\.\/condition-ui\.js";/);
  assert.match(helper, /export function createConditionBadge\(conditionCode, contextLabel\)/);
  assert.match(build, /"condition-ui\.js"/);
  assert.match(worker, /"\.\/condition-ui\.js"/);
});

test("4.6.19 hinterlaesst keine nackten Kalender-Modal-Referenzen im App-Shell", async () => {
  const [app, calendar] = await Promise.all([source("app.js"), source("calendar-feature.js")]);
  assert.doesNotMatch(app, /return closeReleaseLinkModal\(\);/);
  assert.doesNotMatch(app, /return closeCalendarEventModal\(\);/);
  assert.match(app, /calendarFeature\.closeReleaseLinkModal\(\)/);
  assert.match(app, /calendarFeature\.closeEventModal\(\)/);
  assert.match(calendar, /closeReleaseLinkModal,/);
  assert.match(calendar, /closeEventModal: closeCalendarEventModal/);
});

test("createConditionBadge laeuft ausserhalb des Collection-Closures wirklich zur Runtime", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        textContent: "",
        title: "",
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
      };
    }
  };

  try {
    const badge = createConditionBadge("1-2", "Bewertung");
    assert.equal(badge.className, "condition-badge condition-1-2");
    assert.equal(badge.textContent, "1-2");
    assert.match(badge.title, /^Bewertung: Zustand 1-2/);
    assert.equal(badge.attributes["aria-label"], badge.title);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
