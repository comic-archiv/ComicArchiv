import {
  APP_CONFIG,
  DEFAULT_SETTINGS,
  getAvailableSeries,
  getConditionLabel,
  getConditionRank
} from "./config.js";
import {
  deleteComic,
  getAllComics,
  getAppSettings,
  replaceAllComics,
  saveAppSettings,
  saveComic
} from "./storage.js";
import { calculateMissingBands, countMissingBands } from "./missing.js";
import {
  BackupValidationError,
  createCollectionCsv,
  createDatedFilename,
  createJsonBackup,
  createMissingCsv,
  mergeCollections,
  readAndValidateBackupFile,
  shareOrDownloadText
} from "./export.js";

const THEME_STORAGE_KEY = "comicarchiv-theme";
const MAX_VISIBLE_MISSING_BANDS = 100;

const state = {
  comics: [],
  filteredComics: [],
  missingGroups: [],
  settings: { ...DEFAULT_SETTINGS, customSeries: [], knownHighestBandBySeries: {} },
  editingId: null,
  editingComic: null,
  importBackup: null,
  waitingServiceWorker: null
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
  noResults: document.querySelector("#no-results"),
  collectionCount: document.querySelector("#collection-count"),
  search: document.querySelector("#search"),
  filterSeries: document.querySelector("#filter-series"),
  filterCondition: document.querySelector("#filter-condition"),
  filterRead: document.querySelector("#filter-read"),
  filterSealed: document.querySelector("#filter-sealed"),
  filterDuplicate: document.querySelector("#filter-duplicate"),
  sortBy: document.querySelector("#sort-by"),
  resetFilters: document.querySelector("#reset-filters"),
  filterResult: document.querySelector("#filter-result"),
  statTotal: document.querySelector("#stat-total"),
  statSeries: document.querySelector("#stat-series"),
  statRead: document.querySelector("#stat-read"),
  statUnread: document.querySelector("#stat-unread"),
  statSealed: document.querySelector("#stat-sealed"),
  statDuplicate: document.querySelector("#stat-duplicate"),
  statMissing: document.querySelector("#stat-missing"),
  conditionStats: document.querySelector("#condition-stats"),
  conditionStatsTotal: document.querySelector("#condition-stats-total"),
  missingList: document.querySelector("#missing-list"),
  missingEmpty: document.querySelector("#missing-empty"),
  missingCount: document.querySelector("#missing-count"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  connectionStatus: document.querySelector("#connection-status"),
  appVersion: document.querySelector("#app-version"),
  updateApp: document.querySelector("#update-app"),
  exportJson: document.querySelector("#export-json"),
  exportCsv: document.querySelector("#export-csv"),
  exportMissingCsv: document.querySelector("#export-missing-csv"),
  exportMessage: document.querySelector("#export-message"),
  lastBackup: document.querySelector("#last-backup"),
  storagePersistence: document.querySelector("#storage-persistence"),
  storageUsage: document.querySelector("#storage-usage"),
  requestPersistence: document.querySelector("#request-persistence"),
  openImport: document.querySelector("#open-import"),
  importModal: document.querySelector("#import-modal"),
  closeImport: document.querySelector("#close-import"),
  importFile: document.querySelector("#import-file"),
  importSummary: document.querySelector("#import-summary"),
  importIssues: document.querySelector("#import-issues"),
  importModeMerge: document.querySelector("#import-mode-merge"),
  importModeReplace: document.querySelector("#import-mode-replace"),
  importSubmit: document.querySelector("#import-submit"),
  importMessage: document.querySelector("#import-message"),
  toast: document.querySelector("#toast")
};

let toastTimer;
let importInProgress = false;

initializeApp().catch((error) => {
  console.error(error);
  showToast(`ComicArchiv konnte nicht gestartet werden: ${error.message}`, "error");
});

async function initializeApp() {
  applyStoredTheme();
  bindEvents();
  updateConnectionStatus();
  elements.appVersion.textContent = `v${APP_CONFIG.appVersion}`;

  try {
    state.settings = await getAppSettings();
    applyTheme(state.settings.theme);
    persistThemeLocally(state.settings.theme);
  } catch (error) {
    console.warn("Einstellungen konnten nicht geladen werden:", error);
  }

  populateConfiguration();
  await refreshCollection();
  renderBackupStatus();
  await refreshStorageStatus();
  registerServiceWorker();
}

function populateConfiguration() {
  const availableSeries = getAvailableSeries(state.settings);
  const selectedSeries = elements.series.value;
  const selectedFilterSeries = elements.filterSeries.value;
  const selectedCondition = elements.condition.value || "VG";
  const selectedFilterCondition = elements.filterCondition.value;

  elements.series.replaceChildren();
  elements.series.append(createOption("", "Reihe auswählen"));
  availableSeries.forEach((seriesName) => {
    elements.series.append(createOption(seriesName, seriesName));
  });
  elements.series.value = availableSeries.includes(selectedSeries) ? selectedSeries : "";

  elements.filterSeries.replaceChildren();
  elements.filterSeries.append(createOption("all", "Alle Reihen"));
  availableSeries.forEach((seriesName) => {
    elements.filterSeries.append(createOption(seriesName, seriesName));
  });
  elements.filterSeries.value = availableSeries.includes(selectedFilterSeries)
    ? selectedFilterSeries
    : "all";

  elements.condition.replaceChildren();
  APP_CONFIG.conditions.forEach((condition) => {
    elements.condition.append(
      createOption(condition.code, `${condition.label} – ${condition.code}`)
    );
  });
  elements.condition.value = APP_CONFIG.conditions.some((entry) => entry.code === selectedCondition)
    ? selectedCondition
    : "VG";

  elements.filterCondition.replaceChildren();
  elements.filterCondition.append(createOption("all", "Alle Zustände"));
  APP_CONFIG.conditions.forEach((condition) => {
    elements.filterCondition.append(
      createOption(condition.code, `${condition.label} – ${condition.code}`)
    );
  });
  elements.filterCondition.value = APP_CONFIG.conditions.some(
    (entry) => entry.code === selectedFilterCondition
  )
    ? selectedFilterCondition
    : "all";
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function bindEvents() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.cancelEdit.addEventListener("click", resetForm);
  elements.comicList.addEventListener("click", handleCardAction);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.updateApp.addEventListener("click", activateWaitingServiceWorker);
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  [
    elements.search,
    elements.filterSeries,
    elements.filterCondition,
    elements.filterRead,
    elements.filterSealed,
    elements.filterDuplicate,
    elements.sortBy
  ].forEach((control) => {
    control.addEventListener(control === elements.search ? "input" : "change", renderCollection);
  });

  elements.resetFilters.addEventListener("click", resetFilters);
  elements.exportJson.addEventListener("click", handleJsonExport);
  elements.exportCsv.addEventListener("click", handleCollectionCsvExport);
  elements.exportMissingCsv.addEventListener("click", handleMissingCsvExport);
  elements.requestPersistence.addEventListener("click", handlePersistenceRequest);
  elements.openImport.addEventListener("click", openImportModal);
  elements.closeImport.addEventListener("click", closeImportModal);
  elements.importFile.addEventListener("change", handleImportFileSelection);
  elements.importSubmit.addEventListener("click", handleImportSubmit);
  elements.importModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-import]")) {
      closeImportModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.importModal.classList.contains("hidden")) {
      closeImportModal();
    }
  });
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

    if (action === "save-next" && !wasEditing) {
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
  const availableSeries = getAvailableSeries(state.settings);

  if (!availableSeries.includes(series)) {
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
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 && parsedValue <= 99999
    ? parsedValue
    : null;
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
    state.missingGroups = calculateMissingBands(
      state.comics,
      state.settings.knownHighestBandBySeries
    );
    renderCollection();
    renderStats();
    renderMissingBands();
  } catch (error) {
    console.error(error);
    showFormMessage(`Lokale Daten konnten nicht geladen werden: ${error.message}`, "error");
  }
}

function renderCollection() {
  state.filteredComics = getFilteredAndSortedComics();
  elements.comicList.replaceChildren();

  const hasComics = state.comics.length > 0;
  const hasResults = state.filteredComics.length > 0;
  elements.emptyState.classList.toggle("hidden", hasComics);
  elements.noResults.classList.toggle("hidden", !hasComics || hasResults);

  elements.collectionCount.textContent = hasComics
    ? `${state.filteredComics.length} von ${state.comics.length}`
    : "0 Einträge";
  elements.filterResult.textContent = hasComics
    ? `${formatEntryCount(state.filteredComics.length)} sichtbar.`
    : "";

  state.filteredComics.forEach((comic) => {
    elements.comicList.append(createComicCard(comic));
  });
}

function getFilteredAndSortedComics() {
  const searchTerm = normalizeSearchText(elements.search.value);
  const selectedSeries = elements.filterSeries.value;
  const selectedCondition = elements.filterCondition.value;
  const readFilter = elements.filterRead.value;
  const onlySealed = elements.filterSealed.checked;
  const onlyDuplicate = elements.filterDuplicate.checked;

  const filtered = state.comics.filter((comic) => {
    if (selectedSeries !== "all" && comic.series !== selectedSeries) {
      return false;
    }

    if (selectedCondition !== "all" && comic.condition !== selectedCondition) {
      return false;
    }

    if (readFilter === "read" && !comic.isRead) {
      return false;
    }

    if (readFilter === "unread" && comic.isRead) {
      return false;
    }

    if (onlySealed && !comic.isSealed) {
      return false;
    }

    if (onlyDuplicate && !comic.isDuplicate) {
      return false;
    }

    if (searchTerm) {
      const searchableText = normalizeSearchText([
        comic.title,
        comic.series,
        comic.volumeNumber,
        comic.notes
      ].join(" "));

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort(getSortComparator(elements.sortBy.value));
}

function getSortComparator(sortBy) {
  if (sortBy === "volume") {
    return (first, second) => compareBandNumbers(first, second) || compareSeries(first, second);
  }

  if (sortBy === "title") {
    return (first, second) => compareOptionalText(first.title, second.title) || compareSeriesAndBand(first, second);
  }

  if (sortBy === "condition") {
    return (first, second) => {
      const rankDifference = getConditionRank(first.condition) - getConditionRank(second.condition);
      return rankDifference || compareSeriesAndBand(first, second);
    };
  }

  return compareSeriesAndBand;
}

function compareSeriesAndBand(first, second) {
  return compareSeries(first, second) || compareBandNumbers(first, second);
}

function compareSeries(first, second) {
  return String(first.series).localeCompare(String(second.series), "de", { sensitivity: "base" });
}

function compareBandNumbers(first, second) {
  const firstNumber = Number.isSafeInteger(first.numericBandNumber)
    ? first.numericBandNumber
    : Number.POSITIVE_INFINITY;
  const secondNumber = Number.isSafeInteger(second.numericBandNumber)
    ? second.numericBandNumber
    : Number.POSITIVE_INFINITY;

  if (firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return String(first.volumeNumber).localeCompare(String(second.volumeNumber), "de", {
    numeric: true,
    sensitivity: "base"
  });
}

function compareOptionalText(firstValue, secondValue) {
  const first = String(firstValue || "").trim();
  const second = String(secondValue || "").trim();

  if (!first && second) {
    return 1;
  }

  if (first && !second) {
    return -1;
  }

  return first.localeCompare(second, "de", { sensitivity: "base", numeric: true });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .trim();
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
  const total = state.comics.length;
  const read = state.comics.filter((comic) => comic.isRead).length;
  const sealed = state.comics.filter((comic) => comic.isSealed).length;
  const duplicate = state.comics.filter((comic) => comic.isDuplicate).length;
  const seriesCount = new Set(state.comics.map((comic) => comic.series)).size;
  const missingCount = countMissingBands(state.missingGroups);

  elements.statTotal.textContent = total;
  elements.statSeries.textContent = seriesCount;
  elements.statRead.textContent = read;
  elements.statUnread.textContent = total - read;
  elements.statSealed.textContent = sealed;
  elements.statDuplicate.textContent = duplicate;
  elements.statMissing.textContent = missingCount;
  elements.conditionStatsTotal.textContent = formatEntryCount(total);

  elements.conditionStats.replaceChildren();
  APP_CONFIG.conditions.forEach((condition) => {
    const count = state.comics.filter((comic) => comic.condition === condition.code).length;
    const percentage = total > 0 ? (count / total) * 100 : 0;

    const row = document.createElement("div");
    row.className = "condition-stat-row";

    const label = document.createElement("span");
    label.className = "condition-stat-label";
    label.textContent = `${condition.label} – ${condition.code}`;

    const bar = document.createElement("span");
    bar.className = "condition-stat-bar";
    bar.setAttribute("aria-hidden", "true");

    const fill = document.createElement("span");
    fill.className = "condition-stat-fill";
    fill.style.width = `${percentage}%`;
    bar.append(fill);

    const countElement = document.createElement("span");
    countElement.className = "condition-stat-count";
    countElement.textContent = count;

    row.append(label, bar, countElement);
    elements.conditionStats.append(row);
  });
}

function renderMissingBands() {
  const groupsWithMissing = state.missingGroups.filter((group) => group.missingBands.length > 0);
  const totalMissing = countMissingBands(groupsWithMissing);

  elements.missingList.replaceChildren();
  elements.missingEmpty.classList.toggle("hidden", groupsWithMissing.length > 0);
  elements.missingCount.textContent = totalMissing === 1 ? "1 fehlt" : `${totalMissing} fehlen`;

  groupsWithMissing.forEach((group) => {
    const card = document.createElement("article");
    card.className = "missing-card";

    const heading = document.createElement("h3");
    heading.textContent = group.series;

    const meta = document.createElement("p");
    meta.className = "missing-meta";
    meta.textContent = `${group.missingBands.length} fehlend · geprüft bis Band ${group.highestChecked}`;

    const list = document.createElement("div");
    list.className = "missing-band-list";

    group.missingBands.slice(0, MAX_VISIBLE_MISSING_BANDS).forEach((bandNumber) => {
      const badge = document.createElement("span");
      badge.className = "missing-band";
      badge.textContent = bandNumber;
      list.append(badge);
    });

    card.append(heading, meta, list);

    if (group.missingBands.length > MAX_VISIBLE_MISSING_BANDS) {
      const more = document.createElement("p");
      more.className = "missing-more";
      more.textContent = `Weitere ${group.missingBands.length - MAX_VISIBLE_MISSING_BANDS} Bände stehen im CSV-Export.`;
      card.append(more);
    }

    elements.missingList.append(card);
  });
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

  const confirmed = window.confirm(
    `Möchtest du ${label} wirklich löschen? Ohne aktuelles JSON-Backup kann dieser Schritt nicht rückgängig gemacht werden.`
  );

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
  showFormMessage(
    "Reihe und Zustand bleiben ausgewählt. Die Bandnummer wurde nach Möglichkeit erhöht.",
    "success"
  );
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

function resetFilters() {
  elements.search.value = "";
  elements.filterSeries.value = "all";
  elements.filterCondition.value = "all";
  elements.filterRead.value = "all";
  elements.filterSealed.checked = false;
  elements.filterDuplicate.checked = false;
  elements.sortBy.value = "series";
  renderCollection();
  elements.search.focus();
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

async function handleCollectionCsvExport() {
  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const result = await shareOrDownloadText({
      content: createCollectionCsv(state.comics),
      filename: createDatedFilename("ComicArchiv-Sammlung", "csv"),
      mimeType: "text/csv;charset=utf-8",
      title: "ComicArchiv – Sammlung",
      text: "Meine ComicArchiv-Sammlung als CSV-Datei."
    });
    reportExportResult(result, "Die Sammlung");
  } catch (error) {
    console.error(error);
    showExportMessage(`CSV-Export fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

async function handleMissingCsvExport() {
  const totalMissing = countMissingBands(state.missingGroups);

  if (totalMissing === 0) {
    showExportMessage("Aktuell wurden keine fehlenden Bände erkannt.");
    return;
  }

  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const result = await shareOrDownloadText({
      content: createMissingCsv(state.missingGroups),
      filename: createDatedFilename("ComicArchiv-Fehlende-Baende", "csv"),
      mimeType: "text/csv;charset=utf-8",
      title: "ComicArchiv – Fehlende Bände",
      text: "Meine Such- und Wunschliste aus ComicArchiv."
    });
    reportExportResult(result, "Die Liste der fehlenden Bände");
  } catch (error) {
    console.error(error);
    showExportMessage(`CSV-Export fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

async function handleJsonExport() {
  setExportButtonsBusy(true);
  showExportMessage("");

  try {
    const backupTime = new Date().toISOString();
    const nextSettings = { ...state.settings, lastBackupAt: backupTime };
    const result = await shareOrDownloadText({
      content: createJsonBackup(state.comics, nextSettings),
      filename: createDatedFilename("ComicArchiv-Backup", "json"),
      mimeType: "application/json;charset=utf-8",
      title: "ComicArchiv – JSON-Backup",
      text: "Vollständiges Backup meiner ComicArchiv-Daten."
    });

    if (result.method !== "cancelled") {
      state.settings = await saveAppSettings(nextSettings);
      renderBackupStatus();
    }

    reportExportResult(result, "Das JSON-Backup");
  } catch (error) {
    console.error(error);
    showExportMessage(`JSON-Backup fehlgeschlagen: ${error.message}`, "error");
  } finally {
    setExportButtonsBusy(false);
  }
}

function reportExportResult(result, subject) {
  if (result.method === "share") {
    showExportMessage(`${subject} wurde an das iPhone-Teilen-Menü übergeben.`, "success");
  } else if (result.method === "download") {
    showExportMessage(`${subject} wurde als Download bereitgestellt.`, "success");
  } else {
    showExportMessage("Teilen wurde abgebrochen.");
  }
}

function setExportButtonsBusy(isBusy) {
  [
    elements.exportJson,
    elements.exportCsv,
    elements.exportMissingCsv,
    elements.openImport
  ].forEach((button) => {
    button.disabled = isBusy;
  });
}

function showExportMessage(message, type = "info") {
  elements.exportMessage.textContent = message;
  elements.exportMessage.dataset.type = type;
}

function openImportModal() {
  state.importBackup = null;
  elements.importFile.value = "";
  elements.importSummary.replaceChildren();
  elements.importSummary.classList.add("hidden");
  elements.importIssues.replaceChildren();
  elements.importIssues.classList.add("hidden");
  elements.importSubmit.disabled = true;
  elements.importModeMerge.checked = true;
  elements.importMessage.textContent = "";
  elements.importMessage.dataset.type = "info";
  elements.importModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.importFile.focus(), 0);
}

function closeImportModal() {
  if (importInProgress || elements.importModal.classList.contains("hidden")) {
    return;
  }

  elements.importModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  elements.openImport.focus();
}

async function handleImportFileSelection() {
  const file = elements.importFile.files?.[0];
  state.importBackup = null;
  elements.importSubmit.disabled = true;
  elements.importSummary.replaceChildren();
  elements.importSummary.classList.add("hidden");
  elements.importIssues.replaceChildren();
  elements.importIssues.classList.add("hidden");
  elements.importMessage.textContent = "Datei wird geprüft …";
  elements.importMessage.dataset.type = "info";

  if (!file) {
    elements.importMessage.textContent = "";
    return;
  }

  try {
    const backup = await readAndValidateBackupFile(file);
    state.importBackup = backup;
    elements.importSubmit.disabled = false;
    elements.importMessage.textContent = "Die Datei ist gültig und kann importiert werden.";
    elements.importMessage.dataset.type = "success";
    renderImportSummary(backup, file.name);
  } catch (error) {
    console.error(error);
    const message = error instanceof BackupValidationError
      ? error.message
      : `Datei konnte nicht gelesen werden: ${error.message}`;
    elements.importMessage.textContent = message;
    elements.importMessage.dataset.type = "error";
    renderImportIssues(error.issues || []);
  }
}

function renderImportSummary(backup, filename) {
  const filenameLine = document.createElement("p");
  filenameLine.textContent = `Datei: ${filename}`;

  const countLine = document.createElement("p");
  countLine.textContent = `Enthaltene Comics: ${backup.comics.length}`;

  const versionLine = document.createElement("p");
  versionLine.textContent = `Datenformat: Version ${backup.dataFormatVersion}`;

  const dateLine = document.createElement("p");
  dateLine.textContent = backup.exportedAt
    ? `Exportiert: ${formatDateTime(backup.exportedAt)}`
    : "Exportdatum: nicht enthalten";

  elements.importSummary.replaceChildren(filenameLine, countLine, versionLine, dateLine);
  elements.importSummary.classList.remove("hidden");
}

function renderImportIssues(issues) {
  if (!issues.length) {
    return;
  }

  issues.forEach((issue) => {
    const item = document.createElement("li");
    item.textContent = issue;
    elements.importIssues.append(item);
  });
  elements.importIssues.classList.remove("hidden");
}

async function handleImportSubmit() {
  if (!state.importBackup || importInProgress) {
    return;
  }

  const mode = elements.importModeReplace.checked ? "replace" : "merge";
  const confirmationText = mode === "replace"
    ? `Die aktuelle Sammlung mit ${state.comics.length} Einträgen wird vollständig ersetzt. Fortfahren?`
    : `Das Backup mit ${state.importBackup.comics.length} Einträgen wird mit deiner Sammlung zusammengeführt. Fortfahren?`;

  if (!window.confirm(confirmationText)) {
    return;
  }

  importInProgress = true;
  setImportControlsBusy(true);
  elements.importMessage.textContent = "Import läuft …";
  elements.importMessage.dataset.type = "info";

  try {
    let resultMessage;

    if (mode === "replace") {
      await replaceAllComics(state.importBackup.comics);
      resultMessage = `${state.importBackup.comics.length} Einträge wurden wiederhergestellt.`;
    } else {
      const mergeResult = mergeCollections(state.comics, state.importBackup.comics);
      await replaceAllComics(mergeResult.comics);
      resultMessage = `${mergeResult.added} hinzugefügt, ${mergeResult.updated} aktualisiert, ${mergeResult.skipped} übersprungen.`;
    }

    const nextSettings = mergeImportedSettings(mode, state.importBackup);
    state.settings = await saveAppSettings(nextSettings);
    applyTheme(state.settings.theme);
    persistThemeLocally(state.settings.theme);
    populateConfiguration();
    resetFilters();
    resetForm();
    await refreshCollection();
    renderBackupStatus();

    importInProgress = false;
    setImportControlsBusy(false);
    closeImportModal();
    showToast(`Import abgeschlossen: ${resultMessage}`);
  } catch (error) {
    console.error(error);
    elements.importMessage.textContent = `Import fehlgeschlagen: ${error.message}`;
    elements.importMessage.dataset.type = "error";
    importInProgress = false;
    setImportControlsBusy(false);
  }
}

function mergeImportedSettings(mode, backup) {
  const importedSettings = backup.settings || {};

  if (mode === "replace") {
    return {
      ...importedSettings,
      lastBackupAt: importedSettings.lastBackupAt || backup.exportedAt || state.settings.lastBackupAt
    };
  }

  return {
    ...state.settings,
    customSeries: [...new Set([
      ...(state.settings.customSeries || []),
      ...(importedSettings.customSeries || [])
    ])],
    knownHighestBandBySeries: {
      ...(state.settings.knownHighestBandBySeries || {}),
      ...(importedSettings.knownHighestBandBySeries || {})
    }
  };
}

function setImportControlsBusy(isBusy) {
  elements.importFile.disabled = isBusy;
  elements.importModeMerge.disabled = isBusy;
  elements.importModeReplace.disabled = isBusy;
  elements.importSubmit.disabled = isBusy;
  elements.closeImport.disabled = isBusy;
  elements.importModal.querySelectorAll("[data-close-import]").forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = isBusy;
    }
  });
}

function renderBackupStatus() {
  elements.lastBackup.textContent = state.settings.lastBackupAt
    ? formatDateTime(state.settings.lastBackupAt)
    : "Noch keines";
}

async function refreshStorageStatus() {
  if (!navigator.storage) {
    elements.storagePersistence.textContent = "Nicht abrufbar";
    elements.storageUsage.textContent = "Regelmäßige Backups bleiben erforderlich.";
    elements.requestPersistence.classList.add("hidden");
    return;
  }

  try {
    const persisted = typeof navigator.storage.persisted === "function"
      ? await navigator.storage.persisted()
      : false;

    elements.storagePersistence.textContent = persisted ? "Dauerhaft angefragt" : "Best Effort";
    elements.requestPersistence.classList.toggle(
      "hidden",
      persisted || typeof navigator.storage.persist !== "function"
    );

    if (typeof navigator.storage.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      const usage = Number(estimate.usage || 0);
      const quota = Number(estimate.quota || 0);
      elements.storageUsage.textContent = quota > 0
        ? `${formatBytes(usage)} von ungefähr ${formatBytes(quota)} genutzt.`
        : `${formatBytes(usage)} genutzt.`;
    } else {
      elements.storageUsage.textContent = "Speicherumfang konnte nicht ermittelt werden.";
    }
  } catch (error) {
    console.warn("Speicherstatus konnte nicht ermittelt werden:", error);
    elements.storagePersistence.textContent = "Nicht abrufbar";
    elements.storageUsage.textContent = "Regelmäßige Backups bleiben erforderlich.";
  }
}

async function handlePersistenceRequest() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    showExportMessage("Dieser Browser bietet keine anfragbare dauerhafte Speicherung.");
    return;
  }

  elements.requestPersistence.disabled = true;

  try {
    const granted = await navigator.storage.persist();
    showExportMessage(
      granted
        ? "Der Browser hat den dauerhaften Speichermodus gewährt. Backups bleiben trotzdem wichtig."
        : "Der Browser hat den dauerhaften Speichermodus nicht gewährt. Nutze regelmäßig JSON-Backups.",
      granted ? "success" : "info"
    );
    await refreshStorageStatus();
  } catch (error) {
    console.error(error);
    showExportMessage(`Speicherschutz konnte nicht angefragt werden: ${error.message}`, "error");
  } finally {
    elements.requestPersistence.disabled = false;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
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
  }, 3800);
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

  applyTheme(storedTheme === "light" ? "light" : "dark");
}

async function toggleTheme() {
  const nextTheme = elements.html.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  persistThemeLocally(nextTheme);

  try {
    state.settings = await saveAppSettings({ ...state.settings, theme: nextTheme });
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht in IndexedDB gespeichert werden:", error);
  }
}

function persistThemeLocally(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Darstellungseinstellung konnte nicht lokal gespeichert werden:", error);
  }
}

function applyTheme(theme) {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  elements.html.dataset.theme = normalizedTheme;
  elements.themeIcon.textContent = normalizedTheme === "dark" ? "☀︎" : "☾";
  elements.themeToggle.setAttribute(
    "aria-label",
    normalizedTheme === "dark" ? "Helle Darstellung aktivieren" : "Dunkle Darstellung aktivieren"
  );

  const themeColor = normalizedTheme === "dark" ? "#111827" : "#f7f4ee";
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

      if (registration.waiting) {
        showAvailableUpdate(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;

        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            showAvailableUpdate(installingWorker);
          }
        });
      });

      let hasReloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloaded) {
          return;
        }

        hasReloaded = true;
        window.location.reload();
      });

      await registration.update();
    } catch (error) {
      console.error("Service Worker konnte nicht registriert werden:", error);
    }
  });
}

function showAvailableUpdate(worker) {
  state.waitingServiceWorker = worker;
  elements.updateApp.classList.remove("hidden");
  showToast("Eine neue ComicArchiv-Version ist verfügbar.");
}

function activateWaitingServiceWorker() {
  if (!state.waitingServiceWorker) {
    elements.updateApp.classList.add("hidden");
    return;
  }

  elements.updateApp.disabled = true;
  state.waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
}
