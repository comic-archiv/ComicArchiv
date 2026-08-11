import { getAvailableSeries } from "./config.js";
import { createConditionBadge } from "./condition-ui.js";
import { getCoverMedia } from "./storage.js";
import { getScopedCollectionEntries, filterAndSortCollectionEntries } from "./collection-query.js";
import { SMART_LIST_DEFINITIONS_LOOKUP } from "./app-state.js";
import {
  getEntryCopies,
  getEntryDuckipediaCoverUrl,
  getEntryDuckipediaPageUrl,
  getEntryId,
  getEntryMetadataFetchedAt,
  getEntryNotes,
  getEntryNumericBandNumber,
  getEntryPublicationYear,
  getEntrySeriesName,
  getEntryTitle,
  getEntryVolumeNumber
} from "./archive-entry.js";
import { formatDateTime, formatEntryCount } from "./app-utils.js";

export function createCollectionFeature({
  state,
  elements,
  getShelfUI,
  createConfiguredDuckipediaUrl,
  startEditing,
  openDuplicateModal,
  enrichSingleComic,
  confirmAndDelete,
  showToast
}) {
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    elements.comicList.addEventListener("click", handleCardAction);
    [
      elements.search,
      elements.filterSeries,
      elements.filterCondition,
      elements.filterRead,
      elements.filterSealed,
      elements.filterDuplicate,
      elements.sortBy
    ].forEach((control) => {
      control.addEventListener(control === elements.search ? "input" : "change", render);
    });
    elements.resetFilters.addEventListener("click", resetFilters);
    elements.clearSmartList.addEventListener("click", () => {
      state.collectionPreset = {};
      resetFilters({ keepPageOpen: true, clearPreset: false });
    });
    elements.closeCollection.addEventListener("click", close);
  }

  function syncSeriesFilter(
    availableSeries = getAvailableSeries(state.settings, state.collectionEntries),
    preferredValue = elements.filterSeries.value
  ) {
    const mainSeries = "Lustiges Taschenbuch";
    const options = state.collectionScope === "main"
      ? [mainSeries]
      : state.collectionScope === "other"
        ? availableSeries.filter((seriesName) => seriesName !== mainSeries)
        : availableSeries;

    elements.filterSeries.replaceChildren();

    if (state.collectionScope === "main") {
      elements.filterSeries.append(createOption(mainSeries, mainSeries));
      elements.filterSeries.value = mainSeries;
      elements.filterSeriesField.classList.add("hidden");
      return;
    }

    elements.filterSeries.append(createOption("all", state.collectionScope === "other" ? "Alle Sonderreihen" : "Alle Reihen"));
    options.forEach((seriesName) => elements.filterSeries.append(createOption(seriesName, seriesName)));
    elements.filterSeries.value = options.includes(preferredValue) ? preferredValue : "all";
    elements.filterSeriesField.classList.remove("hidden");
  }

  function renderHub() {
    const mainCount = state.collectionEntries.filter((entry) => getEntrySeriesName(entry) === "Lustiges Taschenbuch").length;
    const otherCount = state.collectionEntries.length - mainCount;
    elements.mainCollectionCount.textContent = String(mainCount);
    elements.otherCollectionCount.textContent = String(otherCount);
    elements.mainCollectionCount.setAttribute("aria-label", formatEntryCount(mainCount));
    elements.otherCollectionCount.setAttribute("aria-label", formatEntryCount(otherCount));
  }

  function open(scope, presets = {}) {
    bindEvents();
    state.collectionScope = scope === "other" ? "other" : scope === "all" ? "all" : "main";
    const shelfUI = getShelfUI?.();
    state.collectionReturnTarget = presets.returnTarget || (
      shelfUI?.isSeriesOpen() ? "series" : shelfUI?.isLibraryOpen() ? "library" : "home"
    );
    state.collectionPreset = { ...presets };
    resetFilters({ keepPageOpen: true, clearPreset: false });
    syncSeriesFilter(getAvailableSeries(state.settings, state.collectionEntries));

    if (presets.series && [...elements.filterSeries.options].some((option) => option.value === presets.series)) {
      elements.filterSeries.value = presets.series;
    }
    if (presets.read) elements.filterRead.value = presets.read;
    if (presets.sealed) elements.filterSealed.checked = true;
    if (presets.duplicate) elements.filterDuplicate.checked = true;
    if (presets.search) elements.search.value = String(presets.search);
    if (presets.smartList === "recent") elements.sortBy.value = "recent";

    elements.collectionPageTitle.textContent = presets.title || (
      state.collectionScope === "main"
        ? "Lustige Taschenbücher"
        : state.collectionScope === "other"
          ? "Sonderbände & weitere Reihen"
          : "Alle Comics"
    );
    render();
    elements.collectionPage.classList.remove("hidden");
    elements.collectionPage.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-page-open");
    elements.collectionPage.scrollTop = 0;
    window.setTimeout(() => elements.closeCollection.focus({ preventScroll: true }), 0);
  }

  function close({ returnFocus = true } = {}) {
    elements.collectionPage.classList.add("hidden");
    elements.collectionPage.setAttribute("aria-hidden", "true");
    const anotherPageOpen = [...document.querySelectorAll(".app-page")]
      .some((page) => !page.classList.contains("hidden"));
    document.body.classList.toggle("app-page-open", anotherPageOpen);

    if (!returnFocus) return;
    window.setTimeout(() => {
      const shelfUI = getShelfUI?.();
      if (state.collectionReturnTarget === "series" && shelfUI?.isSeriesOpen()) {
        document.querySelector("#close-series-page")?.focus({ preventScroll: true });
        return;
      }
      if (state.collectionReturnTarget === "library" && shelfUI?.isLibraryOpen()) {
        document.querySelector("#close-library")?.focus({ preventScroll: true });
        return;
      }
      if (state.collectionReturnTarget === "statistics" && !elements.statisticsPage.classList.contains("hidden")) {
        elements.closeStatistics?.focus({ preventScroll: true });
        return;
      }
      const target = state.collectionScope === "main"
        ? elements.openMainCollection
        : state.collectionScope === "other"
          ? elements.openOtherCollection
          : elements.dashboardStats;
      target?.focus({ preventScroll: true });
    }, 0);
  }

  function render() {
    state.filteredComics = getFilteredAndSortedEntries();
    const smartDefinition = state.collectionPreset.smartList
      ? SMART_LIST_DEFINITIONS_LOOKUP[state.collectionPreset.smartList]
      : null;
    const presetBanner = smartDefinition || (state.collectionPreset.bannerTitle ? {
      title: state.collectionPreset.bannerTitle,
      description: state.collectionPreset.bannerDescription || "Statistische Auswahl aus deiner Sammlung"
    } : null);
    elements.smartListBanner.classList.toggle("hidden", !presetBanner);
    if (presetBanner) {
      elements.smartListTitle.textContent = presetBanner.title;
      elements.smartListDescription.textContent = presetBanner.description;
    }
    clearCardCoverObjectUrls();
    elements.comicList.replaceChildren();

    const scopedEntries = getScopedCollectionEntries(state.collectionEntries, state.collectionScope);
    const hasEntries = scopedEntries.length > 0;
    const hasResults = state.filteredComics.length > 0;
    elements.emptyState.classList.toggle("hidden", hasEntries);
    elements.noResults.classList.toggle("hidden", !hasEntries || hasResults);

    elements.collectionCount.textContent = hasEntries
      ? `${state.filteredComics.length} von ${scopedEntries.length}`
      : "0 Einträge";
    elements.filterResult.textContent = hasEntries
      ? `${formatEntryCount(state.filteredComics.length)} sichtbar.`
      : "";
    const activeFilterCount = getActiveFilterCount();
    elements.filterSummary.textContent = activeFilterCount > 0
      ? `${activeFilterCount} aktiv`
      : "Standardansicht";

    state.filteredComics.forEach((entry) => elements.comicList.append(createEntryCard(entry)));
  }

  function getFilteredAndSortedEntries() {
    return filterAndSortCollectionEntries(state.collectionEntries, {
      scope: state.collectionScope,
      preset: state.collectionPreset,
      localCoverIds: state.localCoverIds,
      filters: {
        search: elements.search.value,
        series: elements.filterSeries.value,
        condition: elements.filterCondition.value,
        read: elements.filterRead.value,
        sealed: elements.filterSealed.checked,
        duplicate: elements.filterDuplicate.checked
      },
      sortBy: elements.sortBy.value
    });
  }

  function createEntryCard(entry) {
    const article = document.createElement("article");
    article.className = "comic-card";
    article.dataset.comicId = getEntryId(entry);

    const shell = document.createElement("div");
    shell.className = "comic-card-shell";
    const content = document.createElement("div");
    content.className = "comic-card-content";

    if (state.settings.showCovers !== false) {
      const cover = document.createElement("figure");
      cover.className = "comic-card-cover hidden";
      const image = document.createElement("img");
      image.alt = `Cover von ${getEntrySeriesName(entry)}, Band ${getEntryVolumeNumber(entry)}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      cover.append(image);
      shell.append(cover);
      hydrateEntryCardCover(shell, cover, image, entry);
    }

    const top = document.createElement("div");
    top.className = "comic-card-top";
    const headingGroup = document.createElement("div");
    const series = document.createElement("p");
    series.className = "comic-series";
    series.textContent = getEntrySeriesName(entry);
    const title = document.createElement("h3");
    title.className = "comic-title";
    title.textContent = getEntryTitle(entry) || `Band ${getEntryVolumeNumber(entry)}`;
    const subtitle = document.createElement("p");
    subtitle.className = "comic-subtitle";
    subtitle.textContent = getEntryTitle(entry)
      ? `Band ${getEntryVolumeNumber(entry)}${getEntryPublicationYear(entry) ? ` · ${getEntryPublicationYear(entry)}` : ""}`
      : getEntryPublicationYear(entry)
        ? `Erscheinungsjahr ${getEntryPublicationYear(entry)}`
        : "Titel nicht eingetragen";
    headingGroup.append(series, title, subtitle);

    const rightColumn = document.createElement("div");
    rightColumn.className = "card-right-column";
    const copies = getEntryCopies(entry);
    const conditions = document.createElement("div");
    conditions.className = "condition-badge-list";
    copies.slice(0, 3).forEach((copy, index) => {
      conditions.append(createConditionBadge(copy.condition, copies.length > 1 ? `Exemplar ${index + 1}` : "Zustand"));
    });
    if (copies.length > 3) {
      const more = document.createElement("span");
      more.className = "condition-badge condition-more";
      more.textContent = `+${copies.length - 3}`;
      more.title = `${copies.length - 3} weitere Exemplare`;
      conditions.append(more);
    }

    const menu = document.createElement("details");
    menu.className = "card-menu";
    const menuSummary = document.createElement("summary");
    menuSummary.setAttribute("aria-label", `${getEntrySeriesName(entry)}, Band ${getEntryVolumeNumber(entry)} verwalten`);
    menuSummary.append(createSettingsIcon());
    const menuContent = document.createElement("div");
    menuContent.className = "card-menu-content";

    const actions = [
      ["edit", "Bearbeiten", "menu-action"],
      ["duplicate", `Exemplare verwalten (${copies.length})`, "menu-action"],
      ["enrich", "Duckipedia aktualisieren", "menu-action"],
      ["delete", "Löschen", "menu-action menu-action-danger"]
    ];
    actions.forEach(([action, label, className]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.dataset.action = action;
      button.textContent = label;
      if (action === "enrich") button.disabled = !getEntryNumericBandNumber(entry);
      menuContent.append(button);
    });
    menu.append(menuSummary, menuContent);
    rightColumn.append(conditions, menu);
    top.append(headingGroup, rightColumn);

    const tags = document.createElement("div");
    tags.className = "tag-list";
    const anyRead = copies.some((copy) => copy.isRead);
    const anySealed = copies.some((copy) => copy.isSealed);
    tags.append(createTag(anyRead ? "Gelesen" : "Ungelesen", anyRead));
    if (anySealed) tags.append(createTag("Foliert", true));
    if (copies.length > 1) tags.append(createTag(`${copies.length} Exemplare`, true));

    const duckipediaLink = document.createElement("a");
    duckipediaLink.className = "duckipedia-link";
    duckipediaLink.href = getEntryDuckipediaPageUrl(entry)
      || createConfiguredDuckipediaUrl(getEntrySeriesName(entry), getEntryVolumeNumber(entry), getEntryTitle(entry));
    duckipediaLink.target = "_blank";
    duckipediaLink.rel = "noopener noreferrer";
    duckipediaLink.textContent = "In Duckipedia nachschlagen ↗";

    content.append(top, tags);
    const notesText = getEntryNotes(entry);
    if (notesText) {
      const notes = document.createElement("p");
      notes.className = "comic-notes";
      notes.textContent = notesText;
      content.append(notes);
    }
    const metadataFetchedAt = getEntryMetadataFetchedAt(entry);
    if (metadataFetchedAt) {
      const metadataNote = document.createElement("p");
      metadataNote.className = "metadata-source-note";
      metadataNote.textContent = `Duckipedia zuletzt geprüft: ${formatDateTime(metadataFetchedAt)}`;
      content.append(metadataNote);
    }
    content.append(duckipediaLink);
    shell.append(content);
    article.append(shell);
    return article;
  }

  async function hydrateEntryCardCover(shell, figure, image, entry) {
    try {
      const localCover = await getCoverMedia(getEntryId(entry));
      if (!figure.isConnected) return;
      if (localCover?.blob instanceof Blob) {
        const objectUrl = URL.createObjectURL(localCover.blob);
        state.cardCoverObjectUrls.add(objectUrl);
        image.src = objectUrl;
        figure.classList.remove("hidden");
        shell.classList.add("has-cover");
        return;
      }
      const remoteCover = getEntryDuckipediaCoverUrl(entry);
      if (remoteCover) {
        image.src = remoteCover;
        image.addEventListener("load", () => {
          if (!figure.isConnected) return;
          figure.classList.remove("hidden");
          shell.classList.add("has-cover");
        }, { once: true });
        image.addEventListener("error", () => {
          figure.remove();
          shell.classList.remove("has-cover");
        }, { once: true });
      } else {
        figure.remove();
      }
    } catch (error) {
      console.warn("Cover konnte in der Kartenansicht nicht geladen werden:", error);
      figure.remove();
    }
  }

  function clearCardCoverObjectUrls() {
    state.cardCoverObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.cardCoverObjectUrls.clear();
  }

  function createSettingsIcon() {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("settings-icon");
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Zm9 3.75c0-.55-.05-1.08-.15-1.6l-2.08-.48a7.32 7.32 0 0 0-.72-1.74l1.13-1.82a9.1 9.1 0 0 0-2.26-2.26L15.1 5.22a7.32 7.32 0 0 0-1.74-.72L12.88 2.4a9.47 9.47 0 0 0-3.2 0L9.2 4.5c-.62.18-1.2.42-1.75.72L5.64 4.09a9.1 9.1 0 0 0-2.26 2.26L4.5 8.18c-.3.55-.54 1.13-.72 1.74l-2.08.48a9.47 9.47 0 0 0 0 3.2l2.08.48c.18.61.42 1.2.72 1.74l-1.13 1.82a9.1 9.1 0 0 0 2.26 2.26l1.82-1.13c.55.3 1.13.54 1.75.72l.48 2.08a9.47 9.47 0 0 0 3.2 0l.48-2.08a7.32 7.32 0 0 0 1.74-.72l1.82 1.13a9.1 9.1 0 0 0 2.26-2.26l-1.13-1.82c.3-.55.54-1.13.72-1.74l2.08-.48c.1-.52.15-1.05.15-1.6Z");
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
  }

  function createTag(label, active) {
    const tag = document.createElement("span");
    tag.className = active ? "tag tag-active" : "tag";
    tag.textContent = label;
    return tag;
  }

  async function handleCardAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest("[data-comic-id]");
    const entry = state.collectionEntries.find((candidate) => getEntryId(candidate) === card?.dataset.comicId);
    if (!entry) {
      showToast("Der Eintrag wurde nicht gefunden.", "error");
      return;
    }
    if (button.dataset.action === "edit") {
      close({ returnFocus: false });
      startEditing(entry);
      return;
    }
    if (button.dataset.action === "duplicate") {
      openDuplicateModal(entry);
      return;
    }
    if (button.dataset.action === "enrich") {
      await enrichSingleComic(entry, { force: true });
      return;
    }
    if (button.dataset.action === "delete") await confirmAndDelete(entry);
  }

  function resetFilters({ keepPageOpen = false, clearPreset = true } = {}) {
    elements.search.value = "";
    syncSeriesFilter(getAvailableSeries(state.settings, state.collectionEntries));
    elements.filterCondition.value = "all";
    elements.filterRead.value = "all";
    elements.filterSealed.checked = false;
    elements.filterDuplicate.checked = false;
    elements.sortBy.value = "series";
    if (clearPreset) state.collectionPreset = {};
    render();
    elements.filterPanel.open = false;
    if (!keepPageOpen) elements.search.blur();
  }

  function getActiveFilterCount() {
    return [
      Boolean(elements.search.value.trim()),
      state.collectionScope === "other" && elements.filterSeries.value !== "all",
      elements.filterCondition.value !== "all",
      elements.filterRead.value !== "all",
      elements.filterSealed.checked,
      elements.filterDuplicate.checked,
      elements.sortBy.value !== "series",
      Boolean(state.collectionPreset.smartList),
      Boolean(state.collectionPreset.publicationYear),
      Boolean(state.collectionPreset.series)
    ].filter(Boolean).length;
  }

  return {
    bindEvents,
    syncSeriesFilter,
    renderHub,
    open,
    close,
    render,
    resetFilters,
    getActiveFilterCount,
    isOpen: () => !elements.collectionPage.classList.contains("hidden")
  };
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}
