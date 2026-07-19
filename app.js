import { APP_CONFIG, getConditionLabel } from "./config.js";
import { deleteComic, getAllComics, saveComic } from "./storage.js";

const THEME_STORAGE_KEY = "comicarchiv-theme";

const state = {
  comics: [],
  editingId: null,
  editingComic: null
};

const elements = {
  html: document.documentElement,
  form: document.querySelector("#comic-form"),
  formTitle: document.querySelector("#form-title"),
  formMessage: document.querySelector("#form-message"),
  series: document.querySelector("#series"),
  volumeNumber: document.querySelector("#volume-number"),
  publicationYear: document.querySelector("#publication-year"),
  title: document.querySelector("#title"),
  condition: document.querySelector("#condition"),
  isRead: document.querySelector("#is-read"),
  isDuplicate: document.querySelector("#is-duplicate"),
  isSealed: document.querySelector("#is-sealed"),
  notes: document.querySelector("#notes"),
  saveNext: document.querySelector("#save-next"),
  cancelEdit: document.querySelector("#cancel-edit"),
  comicList: document.querySelector("#comic-list"),
  emptyState: document.querySelector("#empty-state"),
  collectionCount: document.querySelector("#collection-count"),
  statTotal: document.querySelector("#stat-total"),
  statRead: document.querySelector("#stat-read"),
  statSealed: document.querySelector("#stat-sealed"),
  statDuplicate: document.querySelector("#stat-duplicate"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  connectionStatus: document.querySelector("#connection-status"),
  toast: document.querySelector("#toast")
};

let toastTimer;

initializeApp();

async function initializeApp() {
  populateConfiguration();
  applyStoredTheme();
  bindEvents();
  updateConnectionStatus();
  await refreshCollection();
  registerServiceWorker();
}

function populateConfiguration() {
  elements.series.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Reihe auswählen";
  elements.series.append(placeholder);

  APP_CONFIG.series.forEach((seriesName) => {
    const option = document.createElement("option");
    option.value = seriesName;
    option.textContent = seriesName;
    elements.series.append(option);
  });

  elements.condition.replaceChildren();

  APP_CONFIG.conditions.forEach((condition) => {
    const option = document.createElement("option");
    option.value = condition.code;
    option.textContent = `${condition.label} – ${condition.code}`;
    elements.condition.append(option);
  });

  elements.condition.value = "VG";
}

function bindEvents() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.cancelEdit.addEventListener("click", resetForm);
  elements.comicList.addEventListener("click", handleCardAction);
  elements.themeToggle.addEventListener("click", toggleTheme);
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearValidationErrors();
  setFormBusy(true);

  try {
    const action = event.submitter?.dataset.action || "save";
    const wasEditing = Boolean(state.editingId);
    const comic = buildComicFromForm();
    await saveComic(comic);
    await refreshCollection();

    if (action === "save-next" && !state.editingId) {
      prepareNextComic(comic);
      showToast("Comic gespeichert. Der nächste Band ist vorbereitet.");
    } else {
      resetForm();
      showToast(wasEditing ? "Änderungen gespeichert." : "Comic gespeichert.");
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      showFormMessage("Bitte prüfe die markierten Eingaben.", "error");
    } else {
      console.error(error);
      showFormMessage(`Speichern fehlgeschlagen: ${error.message}`, "error");
    }
  } finally {
    setFormBusy(false);
  }
}

function buildComicFromForm() {
  const series = elements.series.value.trim();
  const volumeNumber = elements.volumeNumber.value.trim();
  const title = elements.title.value.trim();
  const publicationYearRaw = elements.publicationYear.value.trim();
  const condition = elements.condition.value;
  const notes = elements.notes.value.trim();
  const errors = {};

  if (!APP_CONFIG.series.includes(series)) {
    errors.series = "Bitte wähle eine gültige Reihe aus.";
  }

  if (!volumeNumber) {
    errors.volumeNumber = "Bitte gib eine Bandnummer ein.";
  } else if (volumeNumber.length > 30) {
    errors.volumeNumber = "Die Bandnummer darf höchstens 30 Zeichen enthalten.";
  } else if (/^\d+$/.test(volumeNumber)) {
    const numericValue = Number(volumeNumber);

    if (!Number.isSafeInteger(numericValue) || numericValue < 1 || numericValue > 99999) {
      errors.volumeNumber = "Eine numerische Bandnummer muss zwischen 1 und 99.999 liegen.";
    }
  }

  let publicationYear = null;

  if (publicationYearRaw) {
    publicationYear = Number(publicationYearRaw);
    const maximumYear = new Date().getFullYear() + 1;

    if (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > maximumYear) {
      errors.publicationYear = `Bitte gib ein Jahr zwischen 1800 und ${maximumYear} ein.`;
    }
  }

  if (title.length > 200) {
    errors.title = "Der Titel darf höchstens 200 Zeichen enthalten.";
  }

  if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
    errors.condition = "Bitte wähle einen gültigen Zustand aus.";
  }

  if (notes.length > 2000) {
    errors.notes = "Die Notizen dürfen höchstens 2.000 Zeichen enthalten.";
  }

  if (Object.keys(errors).length > 0) {
    renderValidationErrors(errors);
    const validationError = new Error("Formular enthält ungültige Eingaben.");
    validationError.name = "ValidationError";
    throw validationError;
  }

  const now = new Date().toISOString();

  return {
    id: state.editingId || createStableId(),
    dataFormatVersion: APP_CONFIG.dataFormatVersion,
    series,
    volumeNumber,
    numericBandNumber: parseStrictPositiveInteger(volumeNumber),
    title,
    publicationYear,
    condition,
    isRead: elements.isRead.checked,
    isDuplicate: elements.isDuplicate.checked,
    isSealed: elements.isSealed.checked,
    notes,
    createdAt: state.editingComic?.createdAt || now,
    updatedAt: now
  };
}

function parseStrictPositiveInteger(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function createStableId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `comic-${Date.now()}-${randomPart}`;
}

async function refreshCollection() {
  try {
    state.comics = await getAllComics();
    renderCollection();
    renderStats();
  } catch (error) {
    console.error(error);
    showFormMessage(`Lokale Daten konnten nicht geladen werden: ${error.message}`, "error");
  }
}

function renderCollection() {
  elements.comicList.replaceChildren();
  elements.emptyState.classList.toggle("hidden", state.comics.length > 0);
  elements.collectionCount.textContent = formatEntryCount(state.comics.length);

  state.comics.forEach((comic) => {
    elements.comicList.append(createComicCard(comic));
  });
}

function createComicCard(comic) {
  const article = document.createElement("article");
  article.className = "comic-card";
  article.dataset.comicId = comic.id;

  const top = document.createElement("div");
  top.className = "comic-card-top";

  const headingGroup = document.createElement("div");

  const series = document.createElement("p");
  series.className = "comic-series";
  series.textContent = comic.series;

  const title = document.createElement("h3");
  title.className = "comic-title";
  title.textContent = comic.title || `Band ${comic.volumeNumber}`;

  const subtitle = document.createElement("p");
  subtitle.className = "comic-subtitle";
  subtitle.textContent = comic.title
    ? `Band ${comic.volumeNumber}${comic.publicationYear ? ` · ${comic.publicationYear}` : ""}`
    : comic.publicationYear
      ? `Erscheinungsjahr ${comic.publicationYear}`
      : "Titel nicht eingetragen";

  headingGroup.append(series, title, subtitle);

  const condition = document.createElement("span");
  condition.className = "condition-badge";
  condition.textContent = getConditionLabel(comic.condition);

  top.append(headingGroup, condition);

  const tags = document.createElement("div");
  tags.className = "tag-list";
  tags.append(
    createTag(comic.isRead ? "Gelesen" : "Ungelesen", comic.isRead),
    createTag("Foliert", comic.isSealed),
    createTag("Doppelt", comic.isDuplicate)
  );

  article.append(top, tags);

  if (comic.notes) {
    const notes = document.createElement("p");
    notes.className = "comic-notes";
    notes.textContent = comic.notes;
    article.append(notes);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "secondary-button compact-button";
  editButton.dataset.action = "edit";
  editButton.textContent = "Bearbeiten";
  editButton.setAttribute("aria-label", `${comic.series}, Band ${comic.volumeNumber} bearbeiten`);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button compact-button";
  deleteButton.dataset.action = "delete";
  deleteButton.textContent = "Löschen";
  deleteButton.setAttribute("aria-label", `${comic.series}, Band ${comic.volumeNumber} löschen`);

  actions.append(editButton, deleteButton);
  article.append(actions);

  return article;
}

function createTag(label, active) {
  const tag = document.createElement("span");
  tag.className = active ? "tag tag-active" : "tag";
  tag.textContent = label;
  return tag;
}

function renderStats() {
  elements.statTotal.textContent = state.comics.length;
  elements.statRead.textContent = state.comics.filter((comic) => comic.isRead).length;
  elements.statSealed.textContent = state.comics.filter((comic) => comic.isSealed).length;
  elements.statDuplicate.textContent = state.comics.filter((comic) => comic.isDuplicate).length;
}

async function handleCardAction(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const card = button.closest("[data-comic-id]");
  const comic = state.comics.find((entry) => entry.id === card?.dataset.comicId);

  if (!comic) {
    showToast("Der Eintrag wurde nicht gefunden.", "error");
    return;
  }

  if (button.dataset.action === "edit") {
    startEditing(comic);
    return;
  }

  if (button.dataset.action === "delete") {
    await confirmAndDelete(comic);
  }
}

function startEditing(comic) {
  state.editingId = comic.id;
  state.editingComic = comic;

  elements.series.value = comic.series;
  elements.volumeNumber.value = comic.volumeNumber;
  elements.publicationYear.value = comic.publicationYear ?? "";
  elements.title.value = comic.title;
  elements.condition.value = comic.condition;
  elements.isRead.checked = comic.isRead;
  elements.isDuplicate.checked = comic.isDuplicate;
  elements.isSealed.checked = comic.isSealed;
  elements.notes.value = comic.notes;

  elements.formTitle.textContent = "Comic bearbeiten";
  elements.cancelEdit.classList.remove("hidden");
  elements.saveNext.classList.add("hidden");
  clearValidationErrors();
  showFormMessage("Du bearbeitest einen vorhandenen Eintrag.");

  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.series.focus({ preventScroll: true });
}

async function confirmAndDelete(comic) {
  const label = comic.title
    ? `${comic.series}, Band ${comic.volumeNumber} „${comic.title}“`
    : `${comic.series}, Band ${comic.volumeNumber}`;

  const confirmed = window.confirm(`Möchtest du ${label} wirklich löschen? Dieser Schritt kann in Version 1 nicht rückgängig gemacht werden.`);

  if (!confirmed) {
    return;
  }

  try {
    await deleteComic(comic.id);

    if (state.editingId === comic.id) {
      resetForm();
    }

    await refreshCollection();
    showToast("Comic gelöscht.");
  } catch (error) {
    console.error(error);
    showToast(`Löschen fehlgeschlagen: ${error.message}`, "error");
  }
}

function prepareNextComic(savedComic) {
  const selectedSeries = savedComic.series;
  const nextBandNumber = savedComic.numericBandNumber
    ? String(savedComic.numericBandNumber + 1)
    : "";

  elements.form.reset();
  elements.series.value = selectedSeries;
  elements.volumeNumber.value = nextBandNumber;
  elements.condition.value = savedComic.condition;
  state.editingId = null;
  state.editingComic = null;
  clearValidationErrors();
  showFormMessage("Reihe und Zustand bleiben ausgewählt. Die Bandnummer wurde nach Möglichkeit erhöht.", "success");
  elements.volumeNumber.focus();
}

function resetForm() {
  elements.form.reset();
  elements.condition.value = "VG";
  state.editingId = null;
  state.editingComic = null;
  elements.formTitle.textContent = "Comic hinzufügen";
  elements.cancelEdit.classList.add("hidden");
  elements.saveNext.classList.remove("hidden");
  clearValidationErrors();
  showFormMessage("");
}

function renderValidationErrors(errors) {
  Object.entries(errors).forEach(([fieldName, message]) => {
    const errorElement = document.querySelector(`#${toKebabCase(fieldName)}-error`);
    const inputElement = elements[fieldName];

    if (errorElement) {
      errorElement.textContent = message;
    }

    if (inputElement) {
      inputElement.setAttribute("aria-invalid", "true");
    }
  });

  const firstInvalidField = Object.keys(errors)[0];
  elements[firstInvalidField]?.focus();
}

function clearValidationErrors() {
  document.querySelectorAll(".field-error").forEach((errorElement) => {
    errorElement.textContent = "";
  });

  [
    elements.series,
    elements.volumeNumber,
    elements.publicationYear,
    elements.title,
    elements.condition,
    elements.notes
  ].forEach((inputElement) => inputElement.removeAttribute("aria-invalid"));
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setFormBusy(isBusy) {
  elements.form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
}

function showFormMessage(message, type = "info") {
  elements.formMessage.textContent = message;
  elements.formMessage.dataset.type = type;
}

function showToast(message, type = "success") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.type = type;
  elements.toast.classList.add("toast-visible");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast-visible");
  }, 3200);
}

function formatEntryCount(count) {
  return count === 1 ? "1 Eintrag" : `${count} Einträge`;
}

function applyStoredTheme() {
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht gelesen werden:", error);
  }

  const theme = storedTheme === "light" ? "light" : "dark";
  applyTheme(theme);
}

function toggleTheme() {
  const nextTheme = elements.html.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht gespeichert werden:", error);
  }
}

function applyTheme(theme) {
  elements.html.dataset.theme = theme;
  elements.themeIcon.textContent = theme === "dark" ? "☀︎" : "☾";
  elements.themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Helle Darstellung aktivieren" : "Dunkle Darstellung aktivieren"
  );

  const themeColor = theme === "dark" ? "#111827" : "#f7f4ee";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", themeColor);
}

function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  elements.connectionStatus.textContent = isOnline ? "Online" : "Offline";
  elements.connectionStatus.dataset.status = isOnline ? "online" : "offline";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", {
        updateViaCache: "none"
      });

      await registration.update();

      let hasReloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloaded) {
          return;
        }

        hasReloaded = true;
        window.location.reload();
      });
    } catch (error) {
      console.error("Service Worker konnte nicht registriert werden:", error);
    }
  });
}
