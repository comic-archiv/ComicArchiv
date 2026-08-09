import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("seltene Modals liegen initial in Lazy-DOM-Templates", async () => {
  const html = await read("index.html");
  for (const [templateId, modalId] of [
    ["lazy-condition-assistant-template", "condition-assistant-modal"],
    ["lazy-import-template", "import-modal"],
    ["lazy-diagnostics-template", "diagnostics-modal"],
    ["lazy-share-card-template", "share-card-modal"]
  ]) {
    assert.match(html, new RegExp(`<template id="${templateId}">[\\s\\S]*?id="${modalId}"`));
    assert.equal((html.match(new RegExp(`id="${modalId}"`, "g")) || []).length, 1);
  }
});

test("Lazy-DOM-Bereiche werden erst in ihren Öffnen-Pfaden gemountet", async () => {
  const app = await read("app.js");
  assert.match(app, /createLazyDomManager/);
  assert.match(app, /async function openShareCardModal\(\) \{\s+lazyDom\.ensure\("shareCard"\)/);
  assert.match(app, /async function openDiagnosticsModal\(\) \{\s+lazyDom\.ensure\("diagnostics"\)/);
  assert.match(app, /function openImportModal\(event\) \{\s+lazyDom\.ensure\("import"\)/);
  assert.match(app, /function openConditionAssistant\([\s\S]*?\{\s+lazyDom\.ensure\("conditionAssistant"\)/);
  assert.doesNotMatch(app, /renderConditionGuide\(\);\s+renderConditionAssistantOptions\(\);/);
});

test("Escape und Body-Modalstatus vertragen noch nicht gemountete Bereiche", async () => {
  const app = await read("app.js");
  for (const ref of ["conditionAssistantModal", "diagnosticsModal", "shareCardModal", "importModal"]) {
    assert.match(app, new RegExp(`elements\\.${ref} && !elements\\.${ref}\\.classList\\.contains\\("hidden"\\)`));
  }
  assert.match(app, /\]\.filter\(Boolean\)\.some\(\(modal\) => !modal\.classList\.contains\("hidden"\)\)/);
});

test("Lazy-DOM-Helfer ist Build- und Offline-Bestandteil", async () => {
  const [worker, build] = await Promise.all([read("service-worker.js"), read("scripts/build-static.mjs")]);
  assert.match(worker, /\.\/lazy-dom\.js/);
  assert.match(build, /"lazy-dom\.js"/);
});

test("Lazy-DOM-Manager mountet jeden Bereich nur einmal und hydratisiert Referenzen", async () => {
  const { createLazyDomManager } = await import("../lazy-dom.js");
  const originalDocument = globalThis.document;
  let appendCount = 0;
  let removeCount = 0;
  let afterMountCount = 0;
  const mountedRoot = { id: "share-card-modal" };
  const fragment = { firstElementChild: mountedRoot };
  const template = {
    content: { cloneNode: () => fragment },
    remove: () => { removeCount += 1; }
  };
  const elements = { shareCardModal: null };

  globalThis.document = {
    body: { append: () => { appendCount += 1; } },
    getElementById: (id) => id === "lazy-share-card-template" ? template : null,
    querySelector: (selector) => ({ selector })
  };

  try {
    const manager = createLazyDomManager(elements, {
      afterMount: { shareCard: () => { afterMountCount += 1; } }
    });
    const first = manager.ensure("shareCard");
    const second = manager.ensure("shareCard");

    assert.equal(first, mountedRoot);
    assert.equal(second, elements.shareCardModal);
    assert.equal(appendCount, 1);
    assert.equal(removeCount, 1);
    assert.equal(afterMountCount, 1);
    assert.equal(elements.shareCardTemplate.selector, "#share-card-template");
    assert.equal(elements.shareCardCanvas.selector, "#share-card-canvas");
  } finally {
    globalThis.document = originalDocument;
  }
});
