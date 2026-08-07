import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class FakeClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  toString() { return [...this.values].join(" "); }
}

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.options = [];
    this.scrollTop = 0;
    this.isConnected = true;
    this.listeners = new Map();
    this._className = "";
    this.classList = new FakeClassList();
  }
  set className(value) {
    this._className = String(value || "");
    this.classList = new FakeClassList(this._className.split(/\s+/).filter(Boolean));
  }
  get className() { return this._className || this.classList.toString(); }
  append(...nodes) {
    nodes.filter(Boolean).forEach((node) => {
      node.parentElement = this;
      this.children.push(node);
      if (this.tagName === "SELECT" && node.tagName === "OPTION") this.options.push(node);
    });
  }
  replaceChildren(...nodes) { this.children = []; this.options = []; this.append(...nodes); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    const value = event && typeof event === "object" ? event : { type: String(event || "") };
    value.target ||= this;
    value.currentTarget ||= this;
    (this.listeners.get(value.type) || []).forEach((callback) => callback(value));
    return true;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() {}
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const descendants = [];
    const visit = (node) => {
      node.children.forEach((child) => { descendants.push(child); visit(child); });
    };
    visit(this);
    if (selector === "button, select") return descendants.filter((node) => ["BUTTON", "SELECT"].includes(node.tagName));
    if (selector === "strong") return descendants.filter((node) => node.tagName === "STRONG");
    if (selector === "select") return descendants.filter((node) => node.tagName === "SELECT");
    if (selector === "[data-close-issue-detail]") return descendants.filter((node) => "closeIssueDetail" in node.dataset);
    const issueMatch = selector.match(/^\[data-issue-id="(.+)"\]$/);
    if (issueMatch) return descendants.filter((node) => node.dataset.issueId === issueMatch[1]);
    const seriesMatch = selector.match(/^\[data-series-id="(.+)"\]$/);
    if (seriesMatch) return descendants.filter((node) => node.dataset.seriesId === seriesMatch[1]);
    return [];
  }
}

function makeComic(id, seriesId, series, band, { copies = 1, read = false } = {}) {
  const copyList = Array.from({ length: copies }, (_, index) => ({
    id: `${id}-copy-${index + 1}`,
    issueId: id,
    condition: index ? "2-3" : "2",
    isRead: index ? false : read,
    isSealed: false,
    notes: "",
    displayOrder: index + 1
  }));
  return {
    id,
    seriesId,
    series,
    volumeNumber: String(band),
    numericBandNumber: band,
    title: `Titel ${band}`,
    publicationYear: 2026,
    condition: "2",
    isRead: read,
    isDuplicate: copies > 1,
    isSealed: false,
    copies: copyList,
    copyCount: copyList.length,
    duckipediaPageUrl: `https://de.duckipedia.org/${seriesId}_${band}`,
    duckipediaCoverUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  };
}

test("Reihenbibliothek und digitales Regal rendern mit echten Modulaufrufen", async () => {
  const source = await readFile(new URL("../shelf-ui.js", import.meta.url), "utf8");
  const ids = [...source.matchAll(/byId\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
  const elements = new Map(ids.map((id) => [id, new FakeElement("div", id)]));
  const selectIds = ["library-sort", "series-filter", "series-bulk-condition"];
  selectIds.forEach((id) => { elements.set(id, new FakeElement("select", id)); });
  const buttonIds = ids.filter((id) => /^(close-|library-all-list|series-select-mode|series-target-button|series-bulk-|issue-detail-)/.test(id));
  buttonIds.forEach((id) => {
    if (!["issue-detail-title", "issue-detail-series", "issue-detail-meta", "issue-detail-copies", "issue-detail-notes", "issue-detail-cover-image", "issue-detail-cover-fallback"].includes(id)) {
      elements.set(id, new FakeElement("button", id));
    }
  });
  ["library-page", "series-page", "issue-detail-modal", "library-empty", "series-empty", "series-bulk-bar", "series-next-release", "series-nonnumeric-section", "series-list-view"].forEach((id) => elements.get(id)?.classList.add("hidden"));
  elements.get("issue-detail-cover-fallback").append(new FakeElement("span"), new FakeElement("strong"));

  const viewShelf = new FakeElement("button"); viewShelf.dataset.seriesView = "shelf";
  const viewList = new FakeElement("button"); viewList.dataset.seriesView = "list";
  const body = new FakeElement("body");
  const appPages = [elements.get("library-page"), elements.get("series-page")];
  const modals = [elements.get("issue-detail-modal")];

  const fakeDocument = {
    body,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_namespace, tag) => new FakeElement(tag),
    querySelectorAll: (selector) => {
      if (selector === "[data-series-view]") return [viewShelf, viewList];
      if (selector === ".app-page") return appPages;
      if (selector === ".modal") return modals;
      return [];
    }
  };

  Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  globalThis.addEventListener = () => {};

  const { createShelfUI } = await import(`../shelf-ui.js?dom=${Date.now()}`);
  const snapshot = {
    comics: [
      makeComic("main-1", "ltb-main", "Lustiges Taschenbuch", 1, { read: true }),
      makeComic("main-3", "ltb-main", "Lustiges Taschenbuch", 3, { copies: 2 }),
      makeComic("special-1", "ltb-spezial", "LTB Spezial", 1)
    ],
    missingGroups: [
      { series: "Lustiges Taschenbuch", missingBands: [2, 4, 5] },
      { series: "LTB Spezial", missingBands: [2] }
    ],
    settings: {
      knownHighestBandBySeries: { "Lustiges Taschenbuch": 5, "LTB Spezial": 2 },
      calendarEvents: []
    },
    localCoverIds: new Set()
  };

  const ui = createShelfUI({
    getSnapshot: () => snapshot,
    getCoverMedia: async () => null,
    getAllCoverMediaKeys: async () => [],
    onOpenCollection() {},
    onOpenMissingDetail() {},
    onEditComic() {},
    onManageCopies() {},
    onEnrichComic: async () => {},
    onBulkSave: async () => {},
    onOpenProgress() {},
    onToast() {}
  });

  ui.openLibrary("other");
  assert.equal(elements.get("series-library-grid").children.length, 1);
  assert.equal(elements.get("smart-list-grid").children.length, 8);
  assert.equal(elements.get("library-page").classList.contains("hidden"), false);

  ui.openSeries("ltb-main");
  assert.equal(elements.get("series-page-title").textContent, "Lustiges Taschenbuch");
  assert.equal(elements.get("series-shelf-grid").children.length, 5);
  assert.equal(elements.get("series-page").classList.contains("hidden"), false);

  snapshot.comics.push(makeComic("main-75", "ltb-main", "Lustiges Taschenbuch", 75));
  snapshot.settings.knownHighestBandBySeries["Lustiges Taschenbuch"] = 80;
  snapshot.missingGroups[0].missingBands = [2, 4, 5, 6, 7, 8, 9, 10];
  ui.refresh(snapshot);
  assert.equal(elements.get("series-shelf-grid").children.length, 80, "Das Regal muss alle Bandnummern kontinuierlich rendern");
  elements.get("series-search").value = "Titel 75";
  elements.get("series-search").dispatchEvent({ type: "input" });
  assert.equal(elements.get("series-shelf-grid").children.length, 1, "Titelsuche muss das gesamte kontinuierliche Regal durchsuchen");
});
