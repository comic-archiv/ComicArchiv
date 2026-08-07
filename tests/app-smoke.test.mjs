import test from "node:test";
import assert from "node:assert/strict";

class FakeClassList {
  constructor() { this.values = new Set(["hidden"]); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.textContent = "";
    this.innerText = "";
    this.hidden = false;
    this.files = [];
    this.options = [];
    this.scrollTop = 0;
  }
  addEventListener() {}
  removeEventListener() {}
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  remove() {}
  focus() {}
  click() {}
  setAttribute() {}
  removeAttribute() {}
  getAttribute() { return null; }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  closest() { return null; }
  contains() { return false; }
  scrollIntoView() {}
  appendChild(node) { this.children.push(node); return node; }
  get lastElementChild() { return this.children.at(-1) || null; }
}

test("app.js bindet die Oberfläche ohne fehlende Handler oder Start-ReferenceErrors", async () => {
  const elements = new Map();
  const fakeDocument = {
    documentElement: new FakeElement("html"),
    body: new FakeElement("body"),
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, new FakeElement());
      return elements.get(selector);
    },
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const localValues = new Map();
  const fakeLocalStorage = {
    getItem: (key) => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key)
  };
  const errors = [];
  const warnings = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  const globals = {
    document: fakeDocument,
    window: globalThis,
    navigator: {
      onLine: true,
      language: "de-DE",
      userAgent: "Entenarchiv-Test",
      storage: null
    },
    location: {
      search: "",
      href: "https://example.test/Entenarchiv/",
      origin: "https://example.test",
      pathname: "/Entenarchiv/",
      assign() {},
      reload() {}
    },
    localStorage: fakeLocalStorage,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    HTMLElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLSelectElement: FakeElement,
    HTMLTextAreaElement: FakeElement,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    confirm: () => false,
    alert() {},
    isSecureContext: true
  };
  Object.entries(globals).forEach(([key, value]) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  });
  window.EntenarchivRecovery = { reportFatal() {}, markReady() {} };
  window.addEventListener = () => {};

  try {
    await import(`../app.js?smoke=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const unexpected = [...errors, ...warnings].filter((entry) => /ReferenceError|is not defined/.test(entry));
    assert.equal(unexpected.length, 0, unexpected.join("\n"));
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
});
