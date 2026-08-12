const UPDATE_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function createAppUpdateController({
  elements,
  currentVersion,
  recordError = () => {},
  navigatorRef = globalThis.navigator,
  windowRef = globalThis.window,
  documentRef = globalThis.document
} = {}) {
  let registration = null;
  let waitingWorker = null;
  let lastCheckAt = 0;
  let reloading = false;
  let bound = false;

  function bind() {
    if (bound) return;
    bound = true;
    elements?.appUpdateAction?.addEventListener("click", activateWaitingUpdate);
    elements?.appUpdateDismiss?.addEventListener("click", hideUpdateBanner);
  }

  function showUpdateBanner(worker) {
    if (!worker || !elements?.appUpdateBanner) return;
    waitingWorker = worker;
    elements.appUpdateText.textContent = `Eine neue Entenarchiv-Version ist bereit. Aktuell geöffnet: v${currentVersion}.`;
    elements.appUpdateAction.disabled = false;
    elements.appUpdateAction.textContent = "Jetzt aktualisieren";
    elements.appUpdateBanner.classList.remove("hidden");
  }

  function hideUpdateBanner() {
    elements?.appUpdateBanner?.classList.add("hidden");
  }

  function activateWaitingUpdate() {
    if (!waitingWorker) return;
    elements.appUpdateAction.disabled = true;
    elements.appUpdateAction.textContent = "Wird aktualisiert …";
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  function observeInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state !== "installed") return;
      if (navigatorRef?.serviceWorker?.controller) showUpdateBanner(worker);
      else worker.postMessage({ type: "SKIP_WAITING" });
    });
  }

  async function checkForUpdate({ force = false } = {}) {
    if (!registration) return;
    const now = Date.now();
    if (!force && now - lastCheckAt < UPDATE_CHECK_MIN_INTERVAL_MS) return;
    lastCheckAt = now;
    try {
      await registration.update();
      if (registration.waiting && navigatorRef?.serviceWorker?.controller) {
        showUpdateBanner(registration.waiting);
      }
    } catch (error) {
      recordError(error, "App-Update prüfen", "warning");
    }
  }

  async function register() {
    bind();
    if (!navigatorRef?.serviceWorker || !windowRef) return null;

    try {
      registration = await navigatorRef.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });

      if (registration.waiting) {
        if (navigatorRef.serviceWorker.controller) showUpdateBanner(registration.waiting);
        else registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      registration.addEventListener("updatefound", () => observeInstallingWorker(registration.installing));

      navigatorRef.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        windowRef.location.reload();
      });

      documentRef?.addEventListener("visibilitychange", () => {
        if (documentRef.visibilityState === "visible") checkForUpdate();
      });
      windowRef.addEventListener("online", () => checkForUpdate());

      await checkForUpdate({ force: true });
      return registration;
    } catch (error) {
      recordError(error, "Service Worker registrieren", "warning");
      return null;
    }
  }

  return {
    register,
    checkForUpdate,
    activateWaitingUpdate,
    hideUpdateBanner,
    getRegistration: () => registration,
    getWaitingWorker: () => waitingWorker
  };
}
