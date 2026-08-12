import test from "node:test";
import assert from "node:assert/strict";
import { createAppUpdateController } from "../app-update.js";

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }
}

function createButton() {
  const target = new FakeTarget();
  return Object.assign(target, { disabled: false, textContent: "", classList: { add() {}, remove() {} } });
}

function createHarness({ waiting = null, controlled = true } = {}) {
  const serviceWorker = new FakeTarget();
  serviceWorker.controller = controlled ? {} : null;
  const registration = new FakeTarget();
  registration.waiting = waiting;
  registration.installing = null;
  registration.updateCalls = 0;
  registration.update = async () => { registration.updateCalls += 1; };
  serviceWorker.register = async () => registration;

  const bannerClasses = new Set(["hidden"]);
  const elements = {
    appUpdateBanner: { classList: { add: (value) => bannerClasses.add(value), remove: (value) => bannerClasses.delete(value) } },
    appUpdateText: { textContent: "" },
    appUpdateAction: createButton(),
    appUpdateDismiss: createButton()
  };
  const documentRef = new FakeTarget();
  documentRef.visibilityState = "visible";
  const windowRef = new FakeTarget();
  windowRef.location = { reloadCalls: 0, reload() { this.reloadCalls += 1; } };

  return { serviceWorker, registration, elements, bannerClasses, documentRef, windowRef };
}

test("wartendes Update wird sichtbar angeboten und erst nach Nutzeraktion aktiviert", async () => {
  const messages = [];
  const waiting = { postMessage: (message) => messages.push(message) };
  const harness = createHarness({ waiting, controlled: true });
  const controller = createAppUpdateController({
    elements: harness.elements,
    currentVersion: "4.6.22",
    navigatorRef: { serviceWorker: harness.serviceWorker },
    windowRef: harness.windowRef,
    documentRef: harness.documentRef
  });

  await controller.register();
  assert.equal(harness.bannerClasses.has("hidden"), false);
  assert.match(harness.elements.appUpdateText.textContent, /v4\.6\.22/);
  assert.deepEqual(messages, []);

  harness.elements.appUpdateAction.dispatch("click");
  assert.deepEqual(messages, [{ type: "SKIP_WAITING" }]);
  assert.equal(harness.elements.appUpdateAction.disabled, true);
});

test("controllerchange lädt nach einer Update-Aktivierung nur einmal neu", async () => {
  const harness = createHarness({ controlled: true });
  const controller = createAppUpdateController({
    elements: harness.elements,
    currentVersion: "4.6.22",
    navigatorRef: { serviceWorker: harness.serviceWorker },
    windowRef: harness.windowRef,
    documentRef: harness.documentRef
  });
  await controller.register();
  harness.serviceWorker.dispatch("controllerchange");
  harness.serviceWorker.dispatch("controllerchange");
  assert.equal(harness.windowRef.location.reloadCalls, 1);
});

test("Erstinstallation aktiviert einen wartenden Worker ohne Update-Banner", async () => {
  const messages = [];
  const waiting = { postMessage: (message) => messages.push(message) };
  const harness = createHarness({ waiting, controlled: false });
  const controller = createAppUpdateController({
    elements: harness.elements,
    currentVersion: "4.6.22",
    navigatorRef: { serviceWorker: harness.serviceWorker },
    windowRef: harness.windowRef,
    documentRef: harness.documentRef
  });
  await controller.register();
  assert.deepEqual(messages, [{ type: "SKIP_WAITING" }]);
  assert.equal(harness.bannerClasses.has("hidden"), true);
});
