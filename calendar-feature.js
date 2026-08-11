import { STANDARD_SERIES_DEFINITIONS, createMissingDetailKey } from "./config.js";
import { saveAppSettings } from "./storage.js";
import { shareOrDownloadText } from "./export.js";
import { createCustomSeriesId, normalizeSeriesLookup } from "./archive-model.js";
import { getEntryNumericBandNumber, getEntrySeriesId, getEntrySeriesName } from "./archive-entry.js";
import { formatDateTime } from "./app-utils.js";
import {
  WISHLIST_PRIORITIES,
  getWishlistPriorityDefinition,
  normalizeWishlistPriority
} from "./collector-goals.js";
import {
  CALENDAR_CATALOG_URL,
  buildCalendarIcs,
  compareCalendarEvents,
  createCalendarCatalogSignature,
  createCalendarEventId,
  filterCalendarEvents,
  formatCalendarDate,
  getEventsForMonth,
  getEventsForYear,
  getMonthName,
  isToday,
  mergePublisherCalendarEvents,
  normalizeCalendarCatalog,
  normalizeCalendarEvent,
  parseIcsCalendar,
  removePublisherCalendarYear
} from "./calendar.js";
import {
  RELEASE_RADAR_FILTERS,
  buildReleaseRadarItems as createReleaseRadarItems,
  createReleaseEventSignature,
  filterReleaseRadarItems,
  getReleaseRadarBadgeCount,
  getReleaseTimingLabel,
  mergeKnownReleaseSignatures,
  normalizeReleaseDecisionMap,
  normalizeReleaseEventLinks,
  normalizeReleaseSeriesAliases,
  normalizeReleaseSeriesCatalog,
  resolveReleaseIdentity,
  suggestReleaseSeriesDetails,
  summarizeReleaseRadar
} from "./release-radar.js";

let state;
let elements;
let getShelfUI;
let refreshArchiveCoreStatus;
let createAppFilename;
let populateConfiguration;
let openAddPage;
let lookupFormMetadata;
let createConfiguredDuckipediaUrl;
let saveMeaningfulSettings;
let openCollectionPage;
let renderMissingHub;
let renderMissingBands;
let openMissingDetailModal;
let hasMissingDetailContent;
let renderFleaMarketHubStatus;
let renderSeriesProgress;
let renderStats;
let resetForm;
let renderCustomSeriesList;
let restoreBodyModalState;
let showFormMessage;
let showToast;
let eventsBound = false;

export function createCalendarFeature(context) {
  ({
    state, elements, getShelfUI, refreshArchiveCoreStatus, createAppFilename, populateConfiguration, openAddPage,
    lookupFormMetadata, createConfiguredDuckipediaUrl, saveMeaningfulSettings, openCollectionPage, renderMissingHub,
    renderMissingBands, openMissingDetailModal, hasMissingDetailContent, renderFleaMarketHubStatus, renderSeriesProgress,
    renderStats, resetForm, renderCustomSeriesList, restoreBodyModalState, showFormMessage, showToast
  } = context);
  bindCalendarEvents();
  return {
    renderOverview: renderCalendarOverview,
    open: openCalendarPage,
    close: closeCalendarPage,
    render: renderCalendarPage,
    initializeReleaseRadar: initializeReleaseRadarIfNeeded,
    renderReleaseRadarIndicators,
    openReleaseRadar: openReleaseRadarPage,
    closeReleaseRadar: closeReleaseRadarPage,
    closeReleaseLinkModal,
    closeEventModal: closeCalendarEventModal,
    isOpen: () => !elements.calendarPage.classList.contains("hidden"),
    isReleaseRadarOpen: () => !elements.releaseRadarPage.classList.contains("hidden")
  };
}

function bindCalendarEvents() {
  if (eventsBound) return;
  eventsBound = true;
  elements.openCalendar.addEventListener("click", openCalendarPage);
  elements.closeCalendar.addEventListener("click", closeCalendarPage);
  elements.openReleaseRadarHome.addEventListener("click", () => openReleaseRadarPage({ returnTarget: "home" }));
  elements.openReleaseRadarCalendar.addEventListener("click", () => openReleaseRadarPage({ returnTarget: "calendar" }));
  elements.closeReleaseRadar.addEventListener("click", closeReleaseRadarPage);
  elements.releaseRadarPage.addEventListener("click", handleReleaseRadarPageClick);
  elements.releaseRadarList.addEventListener("change", handleReleaseRadarPriorityChange);
  elements.releaseRadarMarkSeen.addEventListener("click", markVisibleReleaseRadarItemsSeen);
  elements.releaseRadarExport.addEventListener("click", exportWatchedReleaseReminders);
  elements.releaseRadarBadgeEnabled.addEventListener("change", handleReleaseRadarBadgeToggle);
  elements.releaseLinkForm.addEventListener("submit", handleReleaseLinkSubmit);
  elements.releaseLinkModeExisting.addEventListener("change", syncReleaseLinkMode);
  elements.releaseLinkModeNew.addEventListener("change", syncReleaseLinkMode);
  elements.closeReleaseLink.addEventListener("click", closeReleaseLinkModal);
  elements.releaseLinkModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-release-link]")) closeReleaseLinkModal();
  });
  elements.calendarPrevYear.addEventListener("click", () => changeCalendarYear(-1));
  elements.calendarNextYear.addEventListener("click", () => changeCalendarYear(1));
  elements.calendarYearSelect.addEventListener("change", () => setCalendarYear(Number(elements.calendarYearSelect.value)));
  elements.calendarToday.addEventListener("click", jumpCalendarToToday);
  elements.calendarSearch.addEventListener("input", () => {
    state.calendarSearch = elements.calendarSearch.value;
    renderCalendarPage();
  });
  elements.calendarCategoryFilter.addEventListener("change", () => {
    state.calendarFilter = elements.calendarCategoryFilter.value;
    renderCalendarPage();
  });
  elements.calendarMonthTabs.addEventListener("click", handleCalendarMonthTabClick);
  elements.calendarGrid.addEventListener("click", handleCalendarDayClick);
  elements.calendarEventList.addEventListener("click", handleCalendarEventListClick);
  elements.calendarFile.addEventListener("change", handleCalendarFileImport);
  elements.calendarRefreshCatalog.addEventListener("click", () => refreshCalendarCatalog({ silent: false, autoImport: true }));
  elements.calendarAutoSync.addEventListener("change", handleCalendarAutoSyncChange);
  elements.calendarCatalogList.addEventListener("click", handleCalendarCatalogClick);
  elements.calendarAddEvent.addEventListener("click", () => openCalendarEventModal());
  elements.calendarExportReminders.addEventListener("click", exportCalendarWithReminders);
  elements.calendarReminderTime.addEventListener("change", handleCalendarReminderTimeChange);
  elements.calendarEventForm.addEventListener("submit", handleCalendarEventSubmit);
  elements.calendarEventAllDay.addEventListener("change", syncCalendarEventTimeVisibility);
  elements.calendarEventDelete.addEventListener("click", deleteSelectedCalendarEvent);
  elements.closeCalendarEvent.addEventListener("click", closeCalendarEventModal);
  elements.calendarEventModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-calendar-event]")) closeCalendarEventModal();
  });
}

function getSafeCalendarYear(value = state.settings.calendarSelectedYear) {
  const year = Number(value);
  return Number.isSafeInteger(year) && year >= 1900 && year <= 2100
    ? year
    : new Date().getFullYear();
}

function getSafeCalendarMonth(value = state.settings.calendarSelectedMonth) {
  const month = Number(value);
  return Number.isSafeInteger(month) && month >= 0 && month <= 11
    ? month
    : new Date().getMonth();
}

function getCalendarEvents() {
  return Array.isArray(state.settings.calendarEvents)
    ? state.settings.calendarEvents.map(normalizeCalendarEvent).filter(Boolean).sort(compareCalendarEvents)
    : [];
}

function getCalendarImportedSources() {
  return state.settings.calendarImportedSources && typeof state.settings.calendarImportedSources === "object"
    ? { ...state.settings.calendarImportedSources }
    : {};
}

function renderCalendarOverview() {
  renderReleaseRadarIndicators();
}

async function openCalendarPage() {
  elements.calendarReminderTime.value = state.settings.calendarReminderTime || "09:00";
  elements.calendarAutoSync.checked = state.settings.calendarAutoSync !== false;
  elements.calendarSearch.value = state.calendarSearch;
  elements.calendarCategoryFilter.value = state.calendarFilter;
  elements.calendarPage.classList.remove("hidden");
  elements.calendarPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.calendarPage.scrollTop = 0;
  renderCalendarPage();
  window.setTimeout(() => elements.closeCalendar.focus({ preventScroll: true }), 0);
  await refreshCalendarCatalog({ silent: true, autoImport: true });
}

function closeCalendarPage({ returnFocus = true } = {}) {
  elements.calendarPage.classList.add("hidden");
  elements.calendarPage.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-page-open");
  if (returnFocus) window.setTimeout(() => elements.openCalendar.focus({ preventScroll: true }), 0);
}

function renderCalendarPage() {
  const year = getSafeCalendarYear();
  const month = getSafeCalendarMonth();
  const allYearEvents = getEventsForYear(getCalendarEvents(), year);
  const yearEvents = filterCalendarEvents(allYearEvents, {
    category: state.calendarFilter,
    query: state.calendarSearch
  });
  const monthEvents = getEventsForMonth(yearEvents, year, month);

  renderCalendarYearOptions(year);
  elements.calendarPageSummary.textContent = allYearEvents.length === 1 ? "1 Termin" : `${allYearEvents.length} Termine`;
  elements.calendarMonthTitle.textContent = `${getMonthName(month)} ${year}`;
  elements.calendarMonthCount.textContent = monthEvents.length === 1 ? "1 Termin" : `${monthEvents.length} Termine`;

  const importedCount = Object.keys(getCalendarImportedSources()).length;
  const availableCount = state.calendarCatalog.filter((entry) => entry.active).length;
  elements.calendarImportSummary.textContent = availableCount
    ? `${availableCount} Jahr${availableCount === 1 ? "" : "e"} verfügbar · ${importedCount} importiert`
    : state.settings.calendarCatalogLastCheckAt
      ? "Keine Jahrespläne gefunden"
      : "Kalenderindex wird geprüft";

  renderCalendarCatalog();
  renderCalendarMonthTabs(year, month, yearEvents);
  renderCalendarGrid(year, month, monthEvents);
  renderCalendarEventList(monthEvents);
  renderReleaseRadarIndicators();
}

function renderCalendarYearOptions(selectedYear) {
  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear - 1, currentYear, currentYear + 1, Number(selectedYear)]);
  state.calendarCatalog.forEach((entry) => years.add(entry.year));
  getCalendarEvents().forEach((event) => years.add(Number(event.startDate.slice(0, 4))));

  elements.calendarYearSelect.replaceChildren();
  [...years].filter((year) => Number.isSafeInteger(year) && year >= 1900 && year <= 2100).sort((a, b) => a - b).forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    const available = state.calendarCatalog.some((entry) => entry.year === year && entry.active);
    option.textContent = available ? `${year} · Jahresplan` : String(year);
    elements.calendarYearSelect.append(option);
  });
  elements.calendarYearSelect.value = String(selectedYear);
}

function renderCalendarCatalog() {
  const importedSources = getCalendarImportedSources();
  const activeEntries = state.calendarCatalog.filter((entry) => entry.active);
  const lastCheck = state.settings.calendarCatalogLastCheckAt;
  elements.calendarCatalogStatus.textContent = state.calendarCatalogLoading
    ? "Kalenderindex wird geprüft …"
    : lastCheck
      ? `${activeEntries.length} Jahr${activeEntries.length === 1 ? "" : "e"} verfügbar · geprüft ${formatDateTime(lastCheck)}`
      : "Noch nicht geprüft";
  elements.calendarRefreshCatalog.disabled = state.calendarCatalogLoading;
  elements.calendarAutoSync.checked = state.settings.calendarAutoSync !== false;
  elements.calendarCatalogList.replaceChildren();

  if (!activeEntries.length) {
    const empty = document.createElement("p");
    empty.className = "muted-copy calendar-catalog-empty";
    empty.textContent = state.calendarCatalogLoading
      ? "Verfügbare Jahre werden geladen."
      : "Noch keine Jahrespläne im Kalenderindex gefunden.";
    elements.calendarCatalogList.append(empty);
    return;
  }

  activeEntries.forEach((entry) => {
    const record = importedSources[String(entry.year)];
    const publisherCount = getEventsForYear(getCalendarEvents(), entry.year).filter((event) => event.source === "publisher").length;
    const signatureMatches = record && `${record.id}|${record.version}|${record.file}` === createCalendarCatalogSignature(entry);

    const card = document.createElement("article");
    card.className = "calendar-catalog-card";

    const heading = document.createElement("div");
    heading.className = "calendar-catalog-heading";
    const copy = document.createElement("div");
    const year = document.createElement("strong");
    year.textContent = String(entry.year);
    const label = document.createElement("span");
    label.textContent = entry.label;
    copy.append(year, label);
    const badge = document.createElement("span");
    badge.className = `calendar-catalog-badge ${publisherCount ? "is-imported" : ""}`;
    badge.textContent = publisherCount ? `${publisherCount} Termine` : "Nicht geladen";
    heading.append(copy, badge);

    const metadata = document.createElement("p");
    metadata.className = "muted-copy";
    metadata.textContent = record?.importedAt
      ? `${signatureMatches ? "Aktuell" : "Update verfügbar"} · importiert ${formatDateTime(record.importedAt)}`
      : entry.notes || `Version ${entry.version}`;

    const actions = document.createElement("div");
    actions.className = "calendar-catalog-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.className = publisherCount && signatureMatches ? "secondary-button compact-button" : "primary-button compact-button";
    load.dataset.calendarCatalogImport = String(entry.year);
    load.textContent = publisherCount ? (signatureMatches ? "Neu laden" : "Aktualisieren") : "Laden";
    actions.append(load);

    if (entry.sourceUrl) {
      const source = document.createElement("a");
      source.className = "text-button calendar-source-link";
      source.href = entry.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "Verlagsquelle ↗";
      actions.append(source);
    }

    if (publisherCount || record) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button danger-text-button";
      remove.dataset.calendarCatalogRemove = String(entry.year);
      remove.textContent = "Jahr entfernen";
      actions.append(remove);
    }

    card.append(heading, metadata, actions);
    elements.calendarCatalogList.append(card);
  });
}

function renderCalendarMonthTabs(year, selectedMonth, yearEvents) {
  elements.calendarMonthTabs.replaceChildren();
  for (let month = 0; month < 12; month += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.calendarMonth = String(month);
    button.className = "calendar-month-tab";
    if (month === selectedMonth) button.classList.add("active");
    const count = getEventsForMonth(yearEvents, year, month).length;
    button.textContent = `${getMonthName(month).slice(0, 3)}${count ? ` · ${count}` : ""}`;
    elements.calendarMonthTabs.append(button);
  }
}

function renderCalendarGrid(year, month, monthEvents) {
  elements.calendarGrid.replaceChildren();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  for (let index = 0; index < offset; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day calendar-day-empty";
    spacer.setAttribute("aria-hidden", "true");
    elements.calendarGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = monthEvents.filter((event) => event.startDate === date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.calendarDate = date;
    if (isToday(date)) button.classList.add("calendar-day-today");
    if (dayEvents.length) button.classList.add("calendar-day-has-events");
    button.setAttribute("aria-label", `${day}. ${getMonthName(month)}${dayEvents.length ? `, ${dayEvents.length} Termine` : ""}`);
    const number = document.createElement("span");
    number.textContent = String(day);
    button.append(number);
    if (dayEvents.length) {
      const dots = document.createElement("span");
      dots.className = "calendar-day-dots";
      [...new Set(dayEvents.map((event) => event.category))].slice(0, 3).forEach((category) => {
        const dot = document.createElement("i");
        dot.className = `calendar-dot calendar-dot-${category}`;
        dots.append(dot);
      });
      button.append(dots);
    }
    elements.calendarGrid.append(button);
  }
}

function renderCalendarEventList(events) {
  elements.calendarEventList.replaceChildren();
  elements.calendarEmpty.classList.toggle("hidden", events.length > 0);
  if (!events.length) return;
  const radarItemsByEventId = new Map(getReleaseRadarItems().map((item) => [item.event.id, item]));

  events.forEach((event) => {
    const article = document.createElement("article");
    article.className = `calendar-event-card calendar-event-${event.category}`;
    article.dataset.calendarEventId = event.id;
    const dateBlock = document.createElement("div");
    dateBlock.className = "calendar-event-date";
    const dateNumber = document.createElement("strong");
    dateNumber.textContent = String(Number(event.startDate.slice(8, 10)));
    const weekday = document.createElement("span");
    weekday.textContent = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${event.startDate}T12:00:00`));
    dateBlock.append(dateNumber, weekday);

    const copy = document.createElement("div");
    copy.className = "calendar-event-copy";
    const badgeRow = document.createElement("div");
    badgeRow.className = "calendar-event-badge-row";
    const badge = document.createElement("span");
    badge.className = "calendar-event-badge";
    badge.textContent = event.source === "publisher" ? "Neuerscheinung" : event.category === "flea-market" ? "Flohmarkt" : event.category === "comic-fair" ? "Comicbörse" : "Eigener Termin";
    badgeRow.append(badge);

    const releaseLink = resolveCalendarRelease(event);
    if (releaseLink) {
      const status = getCalendarCollectionStatus(releaseLink);
      const statusBadge = document.createElement("span");
      statusBadge.className = `calendar-collection-status calendar-collection-${status.type}`;
      statusBadge.textContent = status.label;
      badgeRow.append(statusBadge);
    }
    const radarItem = radarItemsByEventId.get(event.id);
    if (radarItem?.isNew) {
      const radarBadge = document.createElement("span");
      radarBadge.className = "calendar-radar-status is-new";
      radarBadge.textContent = "Neu";
      badgeRow.append(radarBadge);
    } else if (radarItem && ["watch", "ordered", "ignored"].includes(radarItem.effectiveStatus)) {
      const radarBadge = document.createElement("span");
      radarBadge.className = `calendar-radar-status is-${radarItem.effectiveStatus}`;
      radarBadge.textContent = radarItem.effectiveStatus === "watch" ? "Vorgemerkt" : radarItem.effectiveStatus === "ordered" ? "Bestellt" : "Ignoriert";
      badgeRow.append(radarBadge);
    }

    const title = document.createElement("h4");
    title.textContent = event.title;
    const metadata = document.createElement("p");
    metadata.textContent = [event.startTime, event.location].filter(Boolean).join(" · ") || (event.source === "publisher" ? event.sourceName : "Ganztägig");
    copy.append(badgeRow, title, metadata);

    const actions = document.createElement("div");
    actions.className = "calendar-event-actions";
    const url = event.url || inferDuckipediaUrlFromCalendarTitle(event.title);
    if (url) {
      const link = document.createElement("a");
      link.className = "calendar-event-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Details ↗";
      actions.append(link);
    }
    if (releaseLink) {
      const status = getCalendarCollectionStatus(releaseLink);
      const action = document.createElement("button");
      action.type = "button";
      action.className = status.type === "owned" ? "success-button compact-button" : "secondary-button compact-button";
      action.dataset.calendarCollectionAction = status.type === "owned" ? "owned" : status.type === "missing" ? "missing" : "watch";
      action.dataset.series = releaseLink.series;
      action.dataset.bandNumber = String(releaseLink.bandNumber);
      action.textContent = status.type === "owned" ? "In Sammlung" : status.type === "missing" ? "Fehlband öffnen" : "Auf Wunschliste";
      actions.append(action);
    } else if (event.source === "publisher" && event.category === "release") {
      const linkAction = document.createElement("button");
      linkAction.type = "button";
      linkAction.className = "secondary-button compact-button";
      linkAction.dataset.calendarReleaseLink = event.id;
      linkAction.textContent = "Reihe zuordnen";
      actions.append(linkAction);
    }
    if (event.source === "custom") {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.dataset.calendarEdit = event.id;
      edit.textContent = "Bearbeiten";
      actions.append(edit);
    }
    article.append(dateBlock, copy, actions);
    elements.calendarEventList.append(article);
  });
}

function getReleaseSeriesCatalog() {
  const calendarAliases = normalizeReleaseSeriesAliases(state.settings.releaseSeriesAliases);
  const withCalendarAliases = (entry) => ({
    ...entry,
    aliases: [...new Set([...(Array.isArray(entry.aliases) ? entry.aliases : []), ...(calendarAliases[entry.id] || [])])]
  });
  const customDefinitions = Array.isArray(state.settings.customSeriesConfigs)
    ? state.settings.customSeriesConfigs.map((entry) => withCalendarAliases({
        id: entry.id || createCustomSeriesId(entry.name),
        name: entry.name,
        aliases: entry.aliases || []
      }))
    : [];
  const configuredNames = new Set([
    ...STANDARD_SERIES_DEFINITIONS.map((entry) => entry.name),
    ...customDefinitions.map((entry) => entry.name)
  ]);
  const usedDefinitions = state.collectionEntries
    .filter((comic) => getEntrySeriesName(comic) && !configuredNames.has(getEntrySeriesName(comic)))
    .map((comic) => ({
      id: getEntrySeriesId(comic) || createCustomSeriesId(getEntrySeriesName(comic)),
      name: getEntrySeriesName(comic),
      aliases: []
    }));
  return normalizeReleaseSeriesCatalog([
    ...STANDARD_SERIES_DEFINITIONS.map(withCalendarAliases),
    ...customDefinitions,
    ...usedDefinitions.map(withCalendarAliases)
  ]);
}

function resolveCalendarRelease(event) {
  return resolveReleaseIdentity(event, getReleaseSeriesCatalog(), state.settings.releaseEventLinks);
}

function getCalendarCollectionStatus({ seriesId, series, bandNumber }) {
  const normalizedSeriesId = String(seriesId || "").trim();
  const owned = state.collectionEntries.some((comic) => {
    const sameSeries = normalizedSeriesId
      ? getEntrySeriesId(comic) === normalizedSeriesId
      : getEntrySeriesName(comic) === series;
    return sameSeries && getEntryNumericBandNumber(comic) === bandNumber;
  });
  if (owned) return { type: "owned", label: "Im Besitz" };
  const missing = state.missingGroups.some((group) => {
    const sameSeries = normalizedSeriesId && group.seriesId
      ? group.seriesId === normalizedSeriesId
      : group.series === series;
    return sameSeries && group.missingBands.includes(bandNumber);
  });
  if (missing) return { type: "missing", label: "Fehlt" };
  return { type: "planned", label: "Noch nicht vorgemerkt" };
}

function inferDuckipediaUrlFromCalendarTitle(title) {
  const pseudoEvent = { source: "publisher", category: "release", title };
  const release = resolveCalendarRelease(pseudoEvent);
  return release ? createConfiguredDuckipediaUrl(release.series, release.bandNumber, title) : "";
}

async function handleCalendarCollectionAction(button) {
  const series = button.dataset.series;
  const bandNumber = Number(button.dataset.bandNumber);
  if (!series || !Number.isSafeInteger(bandNumber)) return;
  const action = button.dataset.calendarCollectionAction;

  if (action === "owned") {
    closeCalendarPage({ returnFocus: false });
    openCollectionPage("all", { series, search: bandNumber });
    return;
  }

  if (action === "watch") {
    const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };
    const currentTarget = Number(nextTargets[series]) || 0;
    if (bandNumber > currentTarget) nextTargets[series] = bandNumber;
    await saveMeaningfulSettings({ knownHighestBandBySeries: nextTargets });
    state.missingGroups = calculateMissingBands(state.collectionEntries, nextTargets);
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderSeriesProgress();
  }
  await openMissingDetailModal(series, bandNumber);
}

function getReleaseRadarItems() {
  return createReleaseRadarItems(getCalendarEvents(), {
    seriesCatalog: getReleaseSeriesCatalog(),
    comics: state.collectionEntries,
    missingGroups: state.missingGroups,
    decisions: state.settings.releaseRadarDecisions,
    knownSignatures: state.settings.releaseRadarKnownSignatures,
    eventLinks: state.settings.releaseEventLinks
  });
}

async function initializeReleaseRadarIfNeeded() {
  if (state.settings.releaseRadarInitializedAt) return false;
  const releaseEvents = getCalendarEvents().filter((event) => event.source === "publisher" && event.category === "release");
  if (!releaseEvents.length) return false;

  const today = getLocalDateKey();
  const pastEvents = releaseEvents.filter((event) => event.startDate < today);
  state.settings = await saveAppSettings({
    ...state.settings,
    releaseRadarKnownSignatures: mergeKnownReleaseSignatures([], pastEvents),
    releaseRadarInitializedAt: new Date().toISOString(),
    releaseRadarFilter: RELEASE_RADAR_FILTERS.includes(state.releaseRadarFilter) ? state.releaseRadarFilter : "open"
  });
  return true;
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderReleaseRadarIndicators() {
  if (!elements.releaseRadarHomeCount) return;
  const items = getReleaseRadarItems();
  const summary = summarizeReleaseRadar(items);
  const badgeCount = getReleaseRadarBadgeCount(items);
  const badgeLabel = badgeCount === 1 ? "1 neu" : `${badgeCount} neu`;

  elements.releaseRadarHomeCount.textContent = String(badgeCount);
  elements.releaseRadarHomeCount.classList.toggle("is-clear", badgeCount === 0);
  elements.releaseRadarHomeMeta.textContent = badgeCount > 0
    ? (summary.todayCount > 0 ? `${summary.todayCount} heute` : "neu")
    : `${summary.upcoming} geplant`;

  if (summary.next) {
    elements.releaseRadarHomeTitle.textContent = "Nächste Neuerscheinung";
    elements.releaseRadarHomeNext.textContent = summary.next.event.title;
    elements.releaseRadarHomeDate.textContent = `${getReleaseTimingLabel(summary.next)} · ${formatCalendarDate(summary.next.event.startDate, { includeYear: true })}`;
    elements.calendarRadarTitle.textContent = badgeCount > 0
      ? `${badgeCount} Veröffentlichung${badgeCount === 1 ? "" : "en"} prüfen`
      : "Alles im Blick";
    elements.calendarRadarNext.textContent = `${summary.next.event.title} · ${getReleaseTimingLabel(summary.next)}`;
  } else {
    elements.releaseRadarHomeTitle.textContent = "Erscheinungsradar";
    elements.releaseRadarHomeNext.textContent = "Keine kommende Veröffentlichung im geladenen Kalender";
    elements.releaseRadarHomeDate.textContent = "Neue Jahrespläne werden automatisch einsortiert.";
    elements.calendarRadarTitle.textContent = "Keine offenen Neuerscheinungen";
    elements.calendarRadarNext.textContent = "Sobald ein neuer Jahresplan erscheint, wird er hier angezeigt.";
  }

  elements.calendarRadarCount.textContent = badgeCount > 0 ? badgeLabel : "aktuell";
  elements.calendarRadarCount.classList.toggle("is-clear", badgeCount === 0);
  elements.calendarNavBadge.textContent = String(badgeCount);
  elements.calendarNavBadge.classList.toggle("hidden", badgeCount === 0);
  elements.calendarNavBadge.setAttribute("aria-label", `${badgeCount} neue oder heute fällige Veröffentlichungen`);

  updateReleaseRadarBadge(badgeCount).catch((error) => {
    console.warn("App-Badge konnte nicht aktualisiert werden:", error);
  });
}

function openReleaseRadarPage({ returnTarget = "home" } = {}) {
  state.releaseRadarReturnTarget = returnTarget;
  elements.releaseRadarPage.classList.remove("hidden");
  elements.releaseRadarPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-page-open");
  elements.releaseRadarPage.scrollTop = 0;
  renderReleaseRadarPage();

  saveAppSettings({
    ...state.settings,
    releaseRadarLastOpenedAt: new Date().toISOString()
  }).then((settings) => {
    state.settings = settings;
  }).catch((error) => console.warn("Radar-Zeitpunkt konnte nicht gespeichert werden:", error));

  window.setTimeout(() => elements.closeReleaseRadar.focus({ preventScroll: true }), 0);
}

function closeReleaseRadarPage({ returnFocus = true } = {}) {
  if (elements.releaseRadarPage.classList.contains("hidden")) return;
  elements.releaseRadarPage.classList.add("hidden");
  elements.releaseRadarPage.setAttribute("aria-hidden", "true");
  const anotherPageOpen = [...document.querySelectorAll(".app-page")]
    .some((page) => !page.classList.contains("hidden"));
  document.body.classList.toggle("app-page-open", anotherPageOpen);
  if (!returnFocus) return;
  const target = state.releaseRadarReturnTarget === "calendar" && !elements.calendarPage.classList.contains("hidden")
    ? elements.openReleaseRadarCalendar
    : elements.openReleaseRadarHome;
  window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
}

function renderReleaseRadarPage() {
  const items = getReleaseRadarItems();
  const summary = summarizeReleaseRadar(items);
  const visibleItems = filterReleaseRadarItems(items, state.releaseRadarFilter);

  elements.releaseRadarSummary.textContent = `${summary.upcoming} offen`;
  elements.releaseRadarNewCount.textContent = String(summary.newCount);
  elements.releaseRadarTodayCount.textContent = String(summary.todayCount);
  elements.releaseRadarWatchCount.textContent = String(summary.watchedCount);
  elements.releaseRadarOrderedCount.textContent = String(summary.orderedCount);

  if (summary.next) {
    elements.releaseRadarNextTitle.textContent = summary.next.event.title;
    elements.releaseRadarNextCopy.textContent = `${getReleaseTimingLabel(summary.next)} · ${formatCalendarDate(summary.next.event.startDate, { includeYear: true })}`;
  } else {
    elements.releaseRadarNextTitle.textContent = "Keine offene Neuerscheinung";
    elements.releaseRadarNextCopy.textContent = "Alle bekannten Termine sind erledigt oder es wurde noch kein Jahresplan geladen.";
  }

  elements.releaseRadarFilterTabs.querySelectorAll("button[data-radar-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.radarFilter === state.releaseRadarFilter);
  });
  elements.releaseRadarList.replaceChildren();
  elements.releaseRadarEmpty.classList.toggle("hidden", visibleItems.length > 0);
  elements.releaseRadarMarkSeen.disabled = !visibleItems.some((item) => item.isNew);
  elements.releaseRadarExport.disabled = !items.some((item) => ["watch", "ordered"].includes(item.effectiveStatus) && item.timing !== "past");

  visibleItems.forEach((item) => elements.releaseRadarList.append(createReleaseRadarCard(item)));
  renderReleaseRadarBadgeStatus(getReleaseRadarBadgeCount(items));
  renderReleaseRadarIndicators();
}

function createReleaseRadarCard(item) {
  const article = document.createElement("article");
  article.className = `release-radar-card is-${item.effectiveStatus}${item.isNew ? " is-new" : ""}`;
  article.dataset.radarKey = item.key;

  const date = document.createElement("div");
  date.className = "release-radar-date";
  const day = document.createElement("strong");
  day.textContent = String(Number(item.event.startDate.slice(8, 10)));
  const month = document.createElement("span");
  month.textContent = getMonthName(Number(item.event.startDate.slice(5, 7)) - 1).slice(0, 3);
  const year = document.createElement("small");
  year.textContent = item.event.startDate.slice(0, 4);
  date.append(day, month, year);

  const content = document.createElement("div");
  content.className = "release-radar-card-content";
  const badges = document.createElement("div");
  badges.className = "release-radar-card-badges";
  if (item.isNew) badges.append(createRadarBadge("Neu", "is-new"));
  badges.append(createRadarBadge(getReleaseRadarStatusLabel(item), `is-${item.effectiveStatus}`));
  badges.append(createRadarBadge(item.collection.label, `is-${item.collection.type}`));

  const title = document.createElement("h3");
  title.textContent = item.event.title;
  const timing = document.createElement("p");
  timing.className = "release-radar-timing";
  timing.textContent = `${getReleaseTimingLabel(item)} · ${formatCalendarDate(item.event.startDate, { includeYear: true })}`;
  const source = document.createElement("p");
  source.className = "muted-copy";
  source.textContent = item.identity
    ? `${item.identity.series} · Band ${item.identity.bandNumber}`
    : `${item.event.sourceName || "LTB Jahresplan"} · noch keiner Archivreihe zugeordnet`;
  content.append(badges, title, timing, source);
  if (item.identity && item.collection.type !== "owned") {
    content.append(createReleaseRadarPriorityControl(item));
  }

  const actions = document.createElement("div");
  actions.className = "release-radar-card-actions";

  if (item.collection.type === "owned" && item.identity) {
    actions.append(createReleaseRadarAction("owned", "In Sammlung", item.key, "success-button compact-button"));
  } else if (!item.identity) {
    actions.append(createReleaseRadarAction("link", "Reihe zuordnen", item.key, "primary-button compact-button"));
  } else if (item.identity) {
    actions.append(
      createReleaseRadarAction("watch", item.effectiveStatus === "watch" ? "Vorgemerkt ✓" : "Vormerken", item.key, item.effectiveStatus === "watch" ? "primary-button compact-button" : "secondary-button compact-button"),
      createReleaseRadarAction("ordered", item.effectiveStatus === "ordered" ? "Bestellt ✓" : "Bestellt", item.key, item.effectiveStatus === "ordered" ? "primary-button compact-button" : "secondary-button compact-button")
    );
    if (item.timing !== "upcoming") {
      actions.append(createReleaseRadarAction("add", "Als vorhanden eintragen", item.key, "success-button compact-button"));
    }
  }

  if (item.isNew) actions.append(createReleaseRadarAction("seen", "Gesehen", item.key, "text-button"));
  if (item.decision) actions.append(createReleaseRadarAction("reset", "Status zurücksetzen", item.key, "text-button"));
  if (item.effectiveStatus !== "ignored" && item.collection.type !== "owned") {
    actions.append(createReleaseRadarAction("ignored", "Ignorieren", item.key, "text-button danger-text-button"));
  }

  const url = item.event.url || inferDuckipediaUrlFromCalendarTitle(item.event.title);
  if (url) {
    const link = document.createElement("a");
    link.className = "text-button release-radar-details-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Details ↗";
    actions.append(link);
  }

  article.append(date, content, actions);
  return article;
}

function createReleaseRadarPriorityControl(item) {
  const label = document.createElement("label");
  label.className = "release-radar-priority";
  const text = document.createElement("span");
  text.textContent = "Suchprio";
  const select = document.createElement("select");
  select.dataset.radarPriority = item.key;
  select.setAttribute("aria-label", `Suchpriorität für ${item.event.title}`);

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Keine";
  select.append(empty);
  WISHLIST_PRIORITIES.forEach((priority) => {
    const option = document.createElement("option");
    option.value = priority.id;
    option.textContent = priority.label;
    select.append(option);
  });

  const detailKey = createMissingDetailKey(item.identity.series, item.identity.bandNumber);
  select.value = normalizeWishlistPriority(state.settings.missingBandDetails?.[detailKey]?.priority);
  label.append(text, select);
  return label;
}

async function handleReleaseRadarPriorityChange(event) {
  const select = event.target.closest("select[data-radar-priority]");
  if (!select) return;
  const item = getReleaseRadarItems().find((entry) => entry.key === select.dataset.radarPriority);
  if (!item?.identity || item.collection.type === "owned") return;

  const priority = normalizeWishlistPriority(select.value);
  const detailKey = createMissingDetailKey(item.identity.series, item.identity.bandNumber);
  const nextDetails = { ...(state.settings.missingBandDetails || {}) };
  const existingDetail = nextDetails[detailKey] || {};
  const nextDetail = { ...existingDetail, priority, updatedAt: new Date().toISOString() };
  if (hasMissingDetailContent(nextDetail)) nextDetails[detailKey] = nextDetail;
  else delete nextDetails[detailKey];

  const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };
  if (priority && priority !== "ignore") {
    const currentTarget = Number(nextTargets[item.identity.series]) || 0;
    if (item.identity.bandNumber > currentTarget) nextTargets[item.identity.series] = item.identity.bandNumber;
  }

  const decisions = normalizeReleaseDecisionMap(state.settings.releaseRadarDecisions);
  if (priority === "ignore") {
    decisions[item.key] = { status: "ignored", updatedAt: new Date().toISOString() };
  } else if (priority && decisions[item.key]?.status === "ignored") {
    delete decisions[item.key];
  }

  try {
    await saveMeaningfulSettings({
      missingBandDetails: nextDetails,
      knownHighestBandBySeries: nextTargets,
      releaseRadarDecisions: decisions
    }, 1);
    state.missingGroups = calculateMissingBands(state.collectionEntries, nextTargets);
    renderMissingHub();
    renderMissingBands();
    renderStats();
    renderFleaMarketHubStatus();
    renderReleaseRadarPage();
    if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
    showReleaseRadarMessage(priority ? `Suchpriorität „${getWishlistPriorityDefinition(priority)?.label}“ gespeichert.` : "Suchpriorität entfernt.", "success");
  } catch (error) {
    select.value = normalizeWishlistPriority(state.settings.missingBandDetails?.[detailKey]?.priority);
    showReleaseRadarMessage(`Suchpriorität konnte nicht gespeichert werden: ${error.message}`, "error");
  }
}

function createRadarBadge(label, variant) {
  const badge = document.createElement("span");
  badge.className = `release-radar-status-badge ${variant}`;
  badge.textContent = label;
  return badge;
}

function getReleaseRadarStatusLabel(item) {
  if (item.effectiveStatus === "owned") return "Im Besitz";
  if (item.effectiveStatus === "watch") return "Vorgemerkt";
  if (item.effectiveStatus === "ordered") return "Bestellt";
  if (item.effectiveStatus === "ignored") return "Ignoriert";
  return item.timing === "today" ? "Heute" : item.timing === "past" ? "Erschienen" : "Offen";
}

function createReleaseRadarAction(action, label, key, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.radarAction = action;
  button.dataset.radarKey = key;
  button.textContent = label;
  return button;
}

function handleReleaseRadarPageClick(event) {
  const filterButton = event.target.closest("button[data-radar-filter]");
  if (filterButton) {
    state.releaseRadarFilter = RELEASE_RADAR_FILTERS.includes(filterButton.dataset.radarFilter)
      ? filterButton.dataset.radarFilter
      : "open";
    saveAppSettings({ ...state.settings, releaseRadarFilter: state.releaseRadarFilter })
      .then((settings) => { state.settings = settings; })
      .catch((error) => console.warn("Radarfilter konnte nicht gespeichert werden:", error));
    renderReleaseRadarPage();
    return;
  }

  const actionButton = event.target.closest("button[data-radar-action]");
  if (!actionButton) return;
  handleReleaseRadarAction(actionButton).catch((error) => {
    console.error("Erscheinungsstatus konnte nicht geändert werden:", error);
    showReleaseRadarMessage(`Erscheinungsstatus konnte nicht geändert werden: ${error.message}`, "error");
  });
}

async function handleReleaseRadarAction(button) {
  const item = getReleaseRadarItems().find((entry) => entry.key === button.dataset.radarKey);
  if (!item) return;
  const action = button.dataset.radarAction;

  if (action === "link") {
    openReleaseLinkModal(item.event);
    return;
  }
  if (action === "owned" && item.identity) {
    closeReleaseRadarPage({ returnFocus: false });
    if (!elements.calendarPage.classList.contains("hidden")) closeCalendarPage({ returnFocus: false });
    openCollectionPage("all", { series: item.identity.series, search: item.identity.bandNumber });
    return;
  }
  if (action === "add" && item.identity) {
    prepareReleaseForAdd(item);
    return;
  }
  if (action === "seen") {
    await markReleaseItemsSeen([item]);
    return;
  }
  if (["watch", "ordered"].includes(action) && item.identity) {
    await ensureReleaseOnWishlist(item.identity);
  }
  await saveReleaseRadarDecision(item, action === "reset" ? "" : action);
}

async function saveReleaseRadarDecision(item, status) {
  const decisions = normalizeReleaseDecisionMap(state.settings.releaseRadarDecisions);
  if (!status) delete decisions[item.key];
  else decisions[item.key] = { status, updatedAt: new Date().toISOString() };
  const knownSignatures = status
    ? mergeKnownReleaseSignatures(state.settings.releaseRadarKnownSignatures, [item])
    : state.settings.releaseRadarKnownSignatures;
  await saveMeaningfulSettings({
    releaseRadarDecisions: decisions,
    releaseRadarKnownSignatures: knownSignatures
  }, 1);
  renderReleaseRadarPage();
  if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
  showReleaseRadarMessage(status ? "Erscheinungsstatus gespeichert." : "Erscheinungsstatus zurückgesetzt.", "success");
}

async function markVisibleReleaseRadarItemsSeen() {
  const items = filterReleaseRadarItems(getReleaseRadarItems(), state.releaseRadarFilter).filter((item) => item.isNew);
  if (!items.length) {
    showReleaseRadarMessage("In dieser Ansicht gibt es keine neuen Termine.", "info");
    return;
  }
  await markReleaseItemsSeen(items);
}

async function markReleaseItemsSeen(items) {
  const known = mergeKnownReleaseSignatures(state.settings.releaseRadarKnownSignatures, items);
  await saveMeaningfulSettings({ releaseRadarKnownSignatures: known }, 1);
  renderReleaseRadarPage();
  if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
  showReleaseRadarMessage(`${items.length} Termin${items.length === 1 ? "" : "e"} als gesehen markiert.`, "success");
}

function openReleaseLinkModal(calendarEvent) {
  if (!calendarEvent) return;
  state.releaseLinkEventId = calendarEvent.id;
  const suggestion = suggestReleaseSeriesDetails(calendarEvent);
  const catalog = getReleaseSeriesCatalog().filter((entry) => entry.id !== "other");
  elements.releaseLinkExistingSeries.replaceChildren();
  catalog
    .slice()
    .sort((first, second) => {
      if (first.id === "ltb-main") return -1;
      if (second.id === "ltb-main") return 1;
      return first.name.localeCompare(second.name, "de", { sensitivity: "base" });
    })
    .forEach((series) => {
      const option = document.createElement("option");
      option.value = series.id;
      option.textContent = series.name;
      elements.releaseLinkExistingSeries.append(option);
    });

  const suggestedExisting = catalog.find((series) => {
    const lookup = normalizeSeriesLookup(suggestion.seriesName);
    return normalizeSeriesLookup(series.name) === lookup
      || series.aliases.some((alias) => normalizeSeriesLookup(alias) === lookup);
  });
  if (suggestedExisting) elements.releaseLinkExistingSeries.value = suggestedExisting.id;

  const shouldCreateNew = !suggestedExisting && Boolean(suggestion.seriesName);
  elements.releaseLinkModeNew.checked = shouldCreateNew;
  elements.releaseLinkModeExisting.checked = !shouldCreateNew;
  elements.releaseLinkNewName.value = suggestion.seriesName || "";
  elements.releaseLinkNewPattern.value = "";
  elements.releaseLinkAlias.value = suggestion.alias || "";
  elements.releaseLinkBand.value = suggestion.bandNumber ? String(suggestion.bandNumber) : "";
  elements.releaseLinkContext.textContent = `${calendarEvent.title} · ${formatCalendarDate(calendarEvent.startDate, { includeYear: true })}`;
  elements.releaseLinkMessage.textContent = "";
  syncReleaseLinkMode();
  elements.releaseLinkModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => {
    (shouldCreateNew ? elements.releaseLinkNewName : elements.releaseLinkExistingSeries).focus();
  }, 0);
}

function closeReleaseLinkModal() {
  elements.releaseLinkModal.classList.add("hidden");
  state.releaseLinkEventId = null;
  elements.releaseLinkMessage.textContent = "";
  restoreBodyModalState();
}

function syncReleaseLinkMode() {
  const createNew = elements.releaseLinkModeNew.checked;
  elements.releaseLinkExistingFields.classList.toggle("hidden", createNew);
  elements.releaseLinkNewFields.classList.toggle("hidden", !createNew);
  elements.releaseLinkExistingSeries.required = !createNew;
  elements.releaseLinkNewName.required = createNew;
}

async function handleReleaseLinkSubmit(event) {
  event.preventDefault();
  const calendarEvent = getCalendarEvents().find((entry) => entry.id === state.releaseLinkEventId);
  if (!calendarEvent) {
    elements.releaseLinkMessage.textContent = "Der Kalendertermin ist nicht mehr verfügbar.";
    elements.releaseLinkMessage.dataset.type = "error";
    return;
  }

  const bandNumber = Number(elements.releaseLinkBand.value);
  if (!Number.isSafeInteger(bandNumber) || bandNumber < 1 || bandNumber > 99999) {
    elements.releaseLinkMessage.textContent = "Bitte gib eine gültige Bandnummer zwischen 1 und 99999 ein.";
    elements.releaseLinkMessage.dataset.type = "error";
    return;
  }

  const alias = elements.releaseLinkAlias.value.trim().slice(0, 160);
  const signature = createReleaseEventSignature(calendarEvent);
  const existingAliases = normalizeReleaseSeriesAliases(state.settings.releaseSeriesAliases);
  const existingLinks = normalizeReleaseEventLinks(state.settings.releaseEventLinks);
  let seriesId = "";
  let seriesName = "";
  let nextConfigs = Array.isArray(state.settings.customSeriesConfigs) ? [...state.settings.customSeriesConfigs] : [];
  let definitionToSave = null;

  if (elements.releaseLinkModeNew.checked) {
    const name = elements.releaseLinkNewName.value.trim();
    const rawPattern = elements.releaseLinkNewPattern.value.trim();
    const pattern = normalizeDuckipediaPattern(rawPattern);
    if (!name || name.length > 100) {
      elements.releaseLinkMessage.textContent = "Bitte gib einen Reihennamen mit höchstens 100 Zeichen ein.";
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    if (rawPattern && !pattern) {
      elements.releaseLinkMessage.textContent = "Der Duckipedia-Pfad ist ungültig. Verwende einen Pfad oder eine URL von de.duckipedia.org.";
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    const duplicate = getReleaseSeriesCatalog().find((entry) => normalizeSeriesLookup(entry.name) === normalizeSeriesLookup(name));
    if (duplicate) {
      elements.releaseLinkMessage.textContent = `„${duplicate.name}“ gibt es bereits. Wähle bitte „Bestehender Reihe zuordnen“.`;
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    seriesId = createCustomSeriesId(name);
    seriesName = name;
    definitionToSave = {
      id: seriesId,
      name,
      duckipediaPattern: pattern,
      category: "special",
      aliases: alias ? [alias] : [],
      isArchived: false
    };
    nextConfigs = [...nextConfigs, definitionToSave];
  } else {
    seriesId = elements.releaseLinkExistingSeries.value;
    const selected = getReleaseSeriesCatalog().find((entry) => entry.id === seriesId);
    if (!selected) {
      elements.releaseLinkMessage.textContent = "Bitte wähle eine vorhandene Reihe aus.";
      elements.releaseLinkMessage.dataset.type = "error";
      return;
    }
    seriesName = selected.name;
    const customIndex = nextConfigs.findIndex((entry) => (entry.id || createCustomSeriesId(entry.name)) === seriesId);
    if (customIndex >= 0 && alias) {
      const current = nextConfigs[customIndex];
      const aliases = [...new Set([...(current.aliases || []), alias])];
      definitionToSave = { ...current, id: seriesId, aliases };
      nextConfigs[customIndex] = definitionToSave;
    }
  }

  const nextAliases = { ...existingAliases };
  if (alias) nextAliases[seriesId] = [...new Set([...(nextAliases[seriesId] || []), alias])];
  const nextLinks = {
    ...existingLinks,
    [signature]: { seriesId, bandNumber, updatedAt: new Date().toISOString() }
  };

  try {
    await saveMeaningfulSettings({
      customSeriesConfigs: nextConfigs,
      releaseSeriesAliases: nextAliases,
      releaseEventLinks: nextLinks
    }, 1);
    if (definitionToSave) await saveSeriesDefinition(definitionToSave);
    populateConfiguration();
    renderCustomSeriesList();
    await refreshArchiveCoreStatus({ showReport: false });
    closeReleaseLinkModal();
    renderReleaseRadarPage();
    if (!elements.calendarPage.classList.contains("hidden")) renderCalendarPage();
    renderReleaseRadarIndicators();
    showReleaseRadarMessage(`${calendarEvent.title} ist jetzt mit „${seriesName}“, Band ${bandNumber}, verknüpft.`, "success");
  } catch (error) {
    elements.releaseLinkMessage.textContent = `Zuordnung konnte nicht gespeichert werden: ${error.message}`;
    elements.releaseLinkMessage.dataset.type = "error";
  }
}

async function ensureReleaseOnWishlist(identity) {
  const nextTargets = { ...(state.settings.knownHighestBandBySeries || {}) };
  const currentTarget = Number(nextTargets[identity.series]) || 0;
  if (identity.bandNumber <= currentTarget) return;
  nextTargets[identity.series] = identity.bandNumber;
  await saveMeaningfulSettings({ knownHighestBandBySeries: nextTargets }, 1);
  state.missingGroups = calculateMissingBands(state.collectionEntries, nextTargets);
  renderMissingHub();
  renderMissingBands();
  renderStats();
  renderSeriesProgress();
  getShelfUI()?.refresh({ comics: state.collectionEntries, missingGroups: state.missingGroups, settings: state.settings, localCoverIds: state.localCoverIds });
}

function prepareReleaseForAdd(item) {
  if (!item.identity) return;
  closeReleaseRadarPage({ returnFocus: false });
  if (!elements.calendarPage.classList.contains("hidden")) closeCalendarPage({ returnFocus: false });
  resetForm();
  elements.series.value = item.identity.series;
  elements.volumeNumber.value = String(item.identity.bandNumber);
  elements.publicationYear.value = item.event.startDate.slice(0, 4);
  openAddPage();
  showFormMessage(`${item.event.title} wurde vorbereitet. Prüfe nur noch Zustand und Eigenschaften.`, "success");
  window.setTimeout(() => {
    lookupFormMetadata({ force: false }).catch((error) => console.warn("Metadaten konnten nicht vorgeladen werden:", error));
  }, 0);
}

async function exportWatchedReleaseReminders() {
  const items = getReleaseRadarItems().filter((item) => ["watch", "ordered"].includes(item.effectiveStatus) && item.timing !== "past");
  if (!items.length) {
    showReleaseRadarMessage("Es gibt keine kommenden vorgemerkten oder bestellten Ausgaben.", "info");
    return;
  }

  const reminderTime = state.settings.calendarReminderTime || "09:00";
  const events = items.map((item) => ({ ...item.event, reminderEnabled: true }));
  const content = buildCalendarIcs(events, {
    calendarName: "Entenarchiv Erscheinungsradar",
    reminderTime,
    timedReleaseReminders: true
  });
  const result = await shareOrDownloadText({
    content,
    filename: createAppFilename("Entenarchiv-Erscheinungsradar", "ics"),
    mimeType: "text/calendar;charset=utf-8",
    title: "Entenarchiv Erscheinungsradar",
    text: `${items.length} vorgemerkte oder bestellte Neuerscheinungen`
  });
  if (result.method !== "cancelled") showReleaseRadarMessage("Kalenderdatei wurde erstellt. Öffne sie mit Apple Kalender, um Erinnerungen zu aktivieren.", "success");
}

function showReleaseRadarMessage(message, type = "info") {
  elements.releaseRadarMessage.textContent = message;
  elements.releaseRadarMessage.dataset.type = type;
}

async function handleReleaseRadarBadgeToggle() {
  elements.releaseRadarMessage.textContent = "";
  if (!elements.releaseRadarBadgeEnabled.checked) {
    state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: false });
    if (typeof navigator.clearAppBadge === "function") await navigator.clearAppBadge().catch(() => {});
    renderReleaseRadarBadgeStatus(getReleaseRadarBadgeCount(getReleaseRadarItems()));
    showReleaseRadarMessage("Das App-Badge wurde ausgeschaltet.", "info");
    return;
  }

  if (typeof navigator.setAppBadge !== "function") {
    elements.releaseRadarBadgeEnabled.checked = false;
    state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: false });
    showReleaseRadarMessage("Dieses Gerät unterstützt kein App-Badge für die Web-App.", "info");
    renderReleaseRadarBadgeStatus(0);
    return;
  }

  if ("Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      elements.releaseRadarBadgeEnabled.checked = false;
      state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: false });
      showReleaseRadarMessage(permission === "denied" ? "Die Berechtigung wurde abgelehnt. Du kannst sie in den iOS-Einstellungen ändern." : "Die Berechtigung wurde nicht erteilt.", "error");
      renderReleaseRadarBadgeStatus(0);
      return;
    }
  }

  state.settings = await saveAppSettings({ ...state.settings, releaseRadarBadgeEnabled: true });
  await updateReleaseRadarBadge(getReleaseRadarBadgeCount(getReleaseRadarItems()));
  renderReleaseRadarBadgeStatus(getReleaseRadarBadgeCount(getReleaseRadarItems()));
  showReleaseRadarMessage("Das App-Badge ist aktiviert.", "success");
}

function renderReleaseRadarBadgeStatus(count) {
  const supported = typeof navigator.setAppBadge === "function" && typeof navigator.clearAppBadge === "function";
  const permission = "Notification" in window ? Notification.permission : "unavailable";
  const enabled = state.settings.releaseRadarBadgeEnabled !== false;
  elements.releaseRadarBadgeEnabled.checked = enabled;
  elements.releaseRadarBadgeEnabled.disabled = !supported || permission === "denied";

  if (!supported) elements.releaseRadarBadgeSummary.textContent = "Auf diesem Gerät nicht verfügbar";
  else if (permission === "denied") elements.releaseRadarBadgeSummary.textContent = "In den Systemeinstellungen gesperrt";
  else if (!enabled) elements.releaseRadarBadgeSummary.textContent = "Ausgeschaltet";
  else if (permission === "granted" || permission === "unavailable") elements.releaseRadarBadgeSummary.textContent = `${count} offene Markierung${count === 1 ? "" : "en"}`;
  else elements.releaseRadarBadgeSummary.textContent = "Aktivierung benötigt einmalige Zustimmung";
}

async function updateReleaseRadarBadge(count = getReleaseRadarBadgeCount(getReleaseRadarItems())) {
  if (typeof navigator.setAppBadge !== "function" || typeof navigator.clearAppBadge !== "function") return;
  if (state.settings.releaseRadarBadgeEnabled === false) {
    await navigator.clearAppBadge().catch(() => {});
    return;
  }
  if ("Notification" in window && Notification.permission !== "granted") return;
  if (count > 0) await navigator.setAppBadge(count);
  else await navigator.clearAppBadge();
}


async function changeCalendarYear(delta) {
  const nextYear = Math.min(2100, Math.max(1900, getSafeCalendarYear() + delta));
  await setCalendarYear(nextYear);
}

async function setCalendarYear(year) {
  const normalizedYear = getSafeCalendarYear(year);
  state.settings = await saveAppSettings({ ...state.settings, calendarSelectedYear: normalizedYear });
  renderCalendarPage();
}

async function jumpCalendarToToday() {
  const today = new Date();
  state.settings = await saveAppSettings({
    ...state.settings,
    calendarSelectedYear: today.getFullYear(),
    calendarSelectedMonth: today.getMonth()
  });
  state.calendarSearch = "";
  state.calendarFilter = "all";
  elements.calendarSearch.value = "";
  elements.calendarCategoryFilter.value = "all";
  renderCalendarPage();
}

async function setCalendarMonth(month) {
  const normalizedMonth = getSafeCalendarMonth(month);
  state.settings = await saveAppSettings({ ...state.settings, calendarSelectedMonth: normalizedMonth });
  renderCalendarPage();
}

function handleCalendarMonthTabClick(event) {
  const button = event.target.closest("button[data-calendar-month]");
  if (!button) return;
  setCalendarMonth(Number(button.dataset.calendarMonth));
}

function handleCalendarDayClick(event) {
  const button = event.target.closest("button[data-calendar-date]");
  if (!button) return;
  const card = [...elements.calendarEventList.querySelectorAll("[data-calendar-event-id]")].find((entry) => {
    const calendarEvent = getCalendarEvents().find((item) => item.id === entry.dataset.calendarEventId);
    return calendarEvent?.startDate === button.dataset.calendarDate;
  });
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleCalendarEventListClick(event) {
  const releaseLinkAction = event.target.closest("button[data-calendar-release-link]");
  if (releaseLinkAction) {
    const calendarEvent = getCalendarEvents().find((item) => item.id === releaseLinkAction.dataset.calendarReleaseLink);
    if (calendarEvent) openReleaseLinkModal(calendarEvent);
    return;
  }
  const collectionAction = event.target.closest("button[data-calendar-collection-action]");
  if (collectionAction) {
    handleCalendarCollectionAction(collectionAction).catch((error) => {
      console.error("Kalenderverknüpfung fehlgeschlagen:", error);
      showToast(`Kalenderverknüpfung fehlgeschlagen: ${error.message}`, "error");
    });
    return;
  }
  const edit = event.target.closest("button[data-calendar-edit]");
  if (!edit) return;
  const calendarEvent = getCalendarEvents().find((item) => item.id === edit.dataset.calendarEdit);
  if (calendarEvent) openCalendarEventModal(calendarEvent);
}

async function refreshCalendarCatalog({ silent = false, autoImport = false } = {}) {
  if (state.calendarCatalogLoading) return;
  state.calendarCatalogLoading = true;
  renderCalendarCatalog();
  if (!silent) showCalendarImportMessage("Verfügbare Jahrespläne werden geprüft …", "info");

  try {
    const response = await fetch(CALENDAR_CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = normalizeCalendarCatalog(await response.json());
    state.calendarCatalog = catalog.calendars;
    state.calendarCatalogUpdatedAt = catalog.updatedAt;
    state.settings = await saveAppSettings({
      ...state.settings,
      calendarCatalogLastCheckAt: new Date().toISOString()
    });

    let imported = 0;
    if (autoImport && state.settings.calendarAutoSync !== false) {
      const currentYear = new Date().getFullYear();
      const automaticEntries = state.calendarCatalog.filter((entry) => entry.active && [currentYear, currentYear + 1].includes(entry.year));
      for (const entry of automaticEntries) {
        if (calendarCatalogEntryNeedsImport(entry)) {
          await importCalendarCatalogEntry(entry, { silent: true, selectYear: false });
          imported += 1;
        }
      }
    }

    if (!silent) {
      const suffix = imported ? ` ${imported} Jahresplan${imported === 1 ? " wurde" : "e wurden"} aktualisiert.` : " Alles ist aktuell.";
      showCalendarImportMessage(`${state.calendarCatalog.length} verfügbare Jahr${state.calendarCatalog.length === 1 ? "" : "e"} gefunden.${suffix}`, "success");
    }
  } catch (error) {
    console.error("Kalenderindex konnte nicht geladen werden:", error);
    if (!silent) showCalendarImportMessage("Der Kalenderindex konnte gerade nicht geladen werden. Bereits importierte Termine bleiben verfügbar.", "error");
  } finally {
    state.calendarCatalogLoading = false;
    renderCalendarPage();
  }
}

function calendarCatalogEntryNeedsImport(entry) {
  const record = getCalendarImportedSources()[String(entry.year)];
  const publisherEvents = getEventsForYear(getCalendarEvents(), entry.year).filter((event) => event.source === "publisher");
  if (!record || publisherEvents.length === 0) return true;
  return `${record.id}|${record.version}|${record.file}` !== createCalendarCatalogSignature(entry);
}

async function importCalendarCatalogEntry(entry, { silent = false, selectYear = true } = {}) {
  if (!entry || state.calendarImporting) return 0;
  state.calendarImporting = true;
  renderCalendarCatalog();
  if (!silent) showCalendarImportMessage(`${entry.label} wird geladen …`, "info");

  try {
    const response = await fetch(entry.file, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const importedEvents = parseIcsCalendar(text, {
      sourceUrl: entry.sourceUrl,
      sourceName: entry.label,
      sourceId: entry.id,
      sourceVersion: entry.version
    }).filter((event) => Number(event.startDate.slice(0, 4)) === entry.year);
    if (!importedEvents.length) throw new Error(`Die Datei enthält keine Termine für ${entry.year}.`);

    const mergedEvents = mergePublisherCalendarEvents(getCalendarEvents(), importedEvents);
    const importedSources = getCalendarImportedSources();
    importedSources[String(entry.year)] = {
      id: entry.id,
      label: entry.label,
      version: entry.version,
      file: entry.file,
      sourceUrl: entry.sourceUrl,
      importedAt: new Date().toISOString(),
      eventCount: importedEvents.length
    };

    const patch = {
      calendarEvents: mergedEvents,
      calendarImportedSources: importedSources,
      calendarSourceUrl: entry.sourceUrl || state.settings.calendarSourceUrl,
      calendarSourceName: entry.label,
      calendarLastImportAt: new Date().toISOString()
    };
    if (selectYear) patch.calendarSelectedYear = entry.year;
    state.settings = await saveMeaningfulSettings(patch, 1);
    await initializeReleaseRadarIfNeeded();
    renderCalendarOverview();
    renderCalendarPage();
    if (!silent) showCalendarImportMessage(`${importedEvents.length} Termine aus ${entry.label} wurden geladen.`, "success");
    return importedEvents.length;
  } catch (error) {
    console.error(`${entry.label} konnte nicht geladen werden:`, error);
    if (!silent) showCalendarImportMessage(`Jahresplan konnte nicht geladen werden: ${error.message}`, "error");
    return 0;
  } finally {
    state.calendarImporting = false;
    renderCalendarCatalog();
  }
}

async function handleCalendarCatalogClick(event) {
  const importButton = event.target.closest("button[data-calendar-catalog-import]");
  if (importButton) {
    const year = Number(importButton.dataset.calendarCatalogImport);
    const entry = state.calendarCatalog.find((item) => item.year === year);
    if (entry) await importCalendarCatalogEntry(entry, { silent: false, selectYear: true });
    return;
  }

  const removeButton = event.target.closest("button[data-calendar-catalog-remove]");
  if (!removeButton) return;
  const year = Number(removeButton.dataset.calendarCatalogRemove);
  if (!window.confirm(`Alle importierten Verlagstermine für ${year} entfernen? Eigene Termine bleiben erhalten.`)) return;
  const importedSources = getCalendarImportedSources();
  delete importedSources[String(year)];
  state.settings = await saveMeaningfulSettings({
    calendarEvents: removePublisherCalendarYear(getCalendarEvents(), year),
    calendarImportedSources: importedSources
  }, 1);
  renderCalendarOverview();
  renderCalendarPage();
  showCalendarImportMessage(`Verlagstermine für ${year} wurden entfernt.`, "success");
}

async function handleCalendarAutoSyncChange() {
  state.settings = await saveAppSettings({
    ...state.settings,
    calendarAutoSync: elements.calendarAutoSync.checked
  });
  if (elements.calendarAutoSync.checked) {
    await refreshCalendarCatalog({ silent: false, autoImport: true });
  } else {
    showCalendarImportMessage("Automatische Aktualisierung ist deaktiviert. Jahrespläne können weiterhin manuell geladen werden.", "info");
  }
}

async function handleCalendarFileImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await importCalendarText(text, {
      sourceUrl: "",
      sourceName: file.name.replace(/\.ics$/i, "") || "Importierter Jahresplan",
      sourceId: `manual-${file.name.toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      sourceVersion: `datei-${file.lastModified || Date.now()}`
    });
    showCalendarImportMessage("iCal-Datei wurde erfolgreich importiert.", "success");
  } catch (error) {
    showCalendarImportMessage(`Import fehlgeschlagen: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
}

async function importCalendarText(text, source = {}) {
  const importedEvents = parseIcsCalendar(text, source);
  const mergedEvents = mergePublisherCalendarEvents(getCalendarEvents(), importedEvents);
  const importedYears = [...new Set(importedEvents.map((event) => Number(event.startDate.slice(0, 4))))].filter(Number.isFinite);
  const importedSources = getCalendarImportedSources();
  const now = new Date().toISOString();
  importedYears.forEach((year) => {
    const yearEvents = importedEvents.filter((event) => Number(event.startDate.slice(0, 4)) === year);
    importedSources[String(year)] = {
      id: source.sourceId || `manual-${year}`,
      label: source.sourceName || `Importierter Jahresplan ${year}`,
      version: source.sourceVersion || "manuell",
      file: "",
      sourceUrl: source.sourceUrl || "",
      importedAt: now,
      eventCount: yearEvents.length
    };
  });
  const preferredYear = importedYears.includes(new Date().getFullYear())
    ? new Date().getFullYear()
    : importedYears[0] || getSafeCalendarYear();
  state.settings = await saveMeaningfulSettings({
    calendarEvents: mergedEvents,
    calendarImportedSources: importedSources,
    calendarSourceUrl: source.sourceUrl || state.settings.calendarSourceUrl,
    calendarSourceName: source.sourceName || "Importierter Jahresplan",
    calendarLastImportAt: now,
    calendarSelectedYear: preferredYear
  }, 1);
  await initializeReleaseRadarIfNeeded();
  renderCalendarOverview();
  renderCalendarPage();
}

function showCalendarImportMessage(message, type = "info") {
  elements.calendarImportMessage.textContent = message;
  elements.calendarImportMessage.dataset.type = type;
}

function openCalendarEventModal(calendarEvent = null) {
  const event = calendarEvent ? normalizeCalendarEvent(calendarEvent) : null;
  state.selectedCalendarEventId = event?.id || null;
  elements.calendarEventModalTitle.textContent = event ? "Termin bearbeiten" : "Termin hinzufügen";
  elements.calendarEventId.value = event?.id || "";
  elements.calendarEventName.value = event?.title || "";
  elements.calendarEventDate.value = event?.startDate || `${getSafeCalendarYear()}-${String(getSafeCalendarMonth() + 1).padStart(2, "0")}-01`;
  elements.calendarEventCategory.value = event?.category && event.category !== "release" ? event.category : "flea-market";
  elements.calendarEventAllDay.checked = event ? event.allDay !== false : true;
  elements.calendarEventTime.value = event?.startTime || "10:00";
  elements.calendarEventLocation.value = event?.location || "";
  elements.calendarEventUrl.value = event?.url || "";
  elements.calendarEventNotes.value = event?.notes || "";
  elements.calendarEventReminder.checked = event ? event.reminderEnabled !== false : true;
  elements.calendarEventDelete.classList.toggle("hidden", !event);
  elements.calendarEventMessage.textContent = "";
  syncCalendarEventTimeVisibility();
  elements.calendarEventModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.calendarEventName.focus({ preventScroll: true }), 0);
}

function closeCalendarEventModal() {
  elements.calendarEventModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  state.selectedCalendarEventId = null;
}

function syncCalendarEventTimeVisibility() {
  elements.calendarEventTimeField.classList.toggle("hidden", elements.calendarEventAllDay.checked);
}

async function handleCalendarEventSubmit(event) {
  event.preventDefault();
  const title = elements.calendarEventName.value.trim();
  const startDate = elements.calendarEventDate.value;
  if (!title || !startDate) {
    elements.calendarEventMessage.textContent = "Bitte gib Titel und Datum an.";
    elements.calendarEventMessage.dataset.type = "error";
    return;
  }

  const existing = getCalendarEvents().find((item) => item.id === state.selectedCalendarEventId);
  const now = new Date().toISOString();
  const calendarEvent = normalizeCalendarEvent({
    id: existing?.id || createCalendarEventId("custom"),
    uid: existing?.uid || "",
    title,
    startDate,
    endDate: startDate,
    allDay: elements.calendarEventAllDay.checked,
    startTime: elements.calendarEventAllDay.checked ? "" : elements.calendarEventTime.value,
    endTime: "",
    location: elements.calendarEventLocation.value,
    notes: elements.calendarEventNotes.value,
    url: elements.calendarEventUrl.value,
    source: "custom",
    sourceName: "Eigener Termin",
    category: elements.calendarEventCategory.value,
    reminderEnabled: elements.calendarEventReminder.checked,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });
  if (!calendarEvent) return;

  const nextEvents = getCalendarEvents().filter((item) => item.id !== calendarEvent.id);
  nextEvents.push(calendarEvent);
  state.settings = await saveMeaningfulSettings({
    calendarEvents: nextEvents,
    calendarSelectedYear: Number(startDate.slice(0, 4)),
    calendarSelectedMonth: Number(startDate.slice(5, 7)) - 1
  }, 1);
  closeCalendarEventModal();
  renderCalendarOverview();
  renderCalendarPage();
  showToast(existing ? "Termin aktualisiert." : "Termin gespeichert.");
}

async function deleteSelectedCalendarEvent() {
  const calendarEvent = getCalendarEvents().find((item) => item.id === state.selectedCalendarEventId);
  if (!calendarEvent || calendarEvent.source !== "custom") return;
  if (!window.confirm(`„${calendarEvent.title}“ wirklich löschen?`)) return;
  state.settings = await saveMeaningfulSettings({
    calendarEvents: getCalendarEvents().filter((item) => item.id !== calendarEvent.id)
  }, 1);
  closeCalendarEventModal();
  renderCalendarOverview();
  renderCalendarPage();
  showToast("Termin gelöscht.");
}

async function handleCalendarReminderTimeChange() {
  state.settings = await saveAppSettings({ ...state.settings, calendarReminderTime: elements.calendarReminderTime.value || "09:00" });
}

async function exportCalendarWithReminders() {
  const year = getSafeCalendarYear();
  const events = getEventsForYear(getCalendarEvents(), year);
  if (!events.length) {
    showCalendarImportMessage("Für dieses Jahr sind noch keine Termine vorhanden.", "error");
    return;
  }
  const reminderTime = elements.calendarReminderTime.value || state.settings.calendarReminderTime || "09:00";
  await handleCalendarReminderTimeChange();
  const content = buildCalendarIcs(events, {
    calendarName: `Entenarchiv ${year}`,
    reminderTime,
    timedReleaseReminders: true
  });
  const result = await shareOrDownloadText({
    content,
    filename: `Entenarchiv-Kalender-${year}.ics`,
    mimeType: "text/calendar;charset=utf-8",
    title: `Entenarchiv-Kalender ${year}`,
    text: `Neuerscheinungen und eigene Termine für ${year}`
  });
  if (result.method !== "cancelled") {
    showToast("Kalenderdatei erstellt. Öffne sie mit Apple Kalender, um die Erinnerungen zu aktivieren.");
  }
}
