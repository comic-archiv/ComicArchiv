import { APP_CONFIG, DEFAULT_CONDITION_CODE, getConditionLabel, getConditionRank } from "./config.js";
import { getComicCopies, normalizeSeriesLookup } from "./archive-model.js";
import {
  SMART_LIST_DEFINITIONS,
  applyBulkPatch,
  buildSeriesSummaries,
  buildShelfSlots,
  buildSmartListCounts,
  filterSeriesComics,
  sortSeriesComics,
  sortSeriesSummaries
} from "./shelf.js";

export function createShelfUI({
  getSnapshot,
  getCoverMedia,
  getAllCoverMediaKeys,
  onOpenCollection,
  onOpenMissingDetail,
  onEditComic,
  onManageCopies,
  onEnrichComic,
  onBulkSave,
  onOpenProgress,
  onToast
}) {
  const elements = collectElements();
  const initialSnapshot = normalizeSnapshot(getSnapshot?.());
  const state = {
    snapshot: initialSnapshot,
    summaries: [],
    localCoverIds: new Set(initialSnapshot.localCoverIds || []),
    libraryScope: "other",
    librarySearch: "",
    librarySort: "completion",
    selectedSeriesId: "",
    seriesReturnTarget: "home",
    seriesView: "shelf",
    seriesFilter: "all",
    seriesSearch: "",
    selectionMode: false,
    selectedIssueIds: new Set(),
    bulkUndo: null,
    coverObjectUrls: new Set(),
    issueDetailId: "",
    issueDetailObjectUrl: "",
    coverLoadSequence: 0,
    coverObserver: null,
    coverTasks: new WeakMap(),
    coverRepairQueue: [],
    coverRepairActive: 0,
    coverRepairPromises: new Map(),
    coverRepairAttempted: new Set()
  };

  populateConditionSelect(elements.seriesBulkCondition);
  bindEvents();
  rebuildSummaries();
  loadLocalCoverIds();

  return Object.freeze({
    refresh,
    openLibrary,
    closeLibrary,
    openSeries,
    closeSeries,
    openSeriesByName,
    isLibraryOpen: () => isVisible(elements.libraryPage),
    isSeriesOpen: () => isVisible(elements.seriesPage),
    getSelectedSeriesId: () => state.selectedSeriesId,
    getSummaries: () => [...state.summaries]
  });

  function refresh(snapshot = getSnapshot?.()) {
    state.snapshot = normalizeSnapshot(snapshot);
    if (state.snapshot.localCoverIds) state.localCoverIds = new Set(state.snapshot.localCoverIds);
    rebuildSummaries();
    state.selectedIssueIds = new Set(
      [...state.selectedIssueIds].filter((id) => state.snapshot.comics.some((comic) => comic.id === id))
    );
    if (isVisible(elements.libraryPage)) renderLibrary();
    if (isVisible(elements.seriesPage)) renderSeries();
    if (isVisible(elements.issueDetailModal) && state.issueDetailId) {
      openIssueDetail(state.issueDetailId, { preserveFocus: true });
    }
    loadLocalCoverIds();
  }

  function rebuildSummaries() {
    state.summaries = buildSeriesSummaries({
      comics: state.snapshot.comics,
      missingGroups: state.snapshot.missingGroups,
      targets: state.snapshot.settings.knownHighestBandBySeries || {},
      localCoverIds: state.localCoverIds
    });

    if (!state.summaries.some(isMainSummary)) {
      state.summaries.unshift(createEmptyMainSummary());
    }
  }

  async function loadLocalCoverIds() {
    if (typeof getAllCoverMediaKeys !== "function") return;
    const sequence = ++state.coverLoadSequence;
    try {
      const keys = await getAllCoverMediaKeys();
      if (sequence !== state.coverLoadSequence) return;
      const nextIds = new Set((Array.isArray(keys) ? keys : []).map(String).filter(Boolean));
      if (setsEqual(nextIds, state.localCoverIds)) return;
      state.localCoverIds = nextIds;
      rebuildSummaries();
      if (isVisible(elements.libraryPage)) renderLibrary();
      if (isVisible(elements.seriesPage)) renderSeries();
    } catch (error) {
      console.warn("Coverübersicht konnte nicht geladen werden:", error);
    }
  }

  function openLibrary(scope = "other") {
    state.libraryScope = scope === "all" ? "all" : "other";
    state.librarySearch = "";
    elements.librarySearch.value = "";
    renderLibrary();
    elements.libraryPage.classList.remove("hidden");
    elements.libraryPage.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-page-open");
    elements.libraryPage.scrollTop = 0;
    window.setTimeout(() => elements.closeLibrary.focus({ preventScroll: true }), 0);
  }

  function closeLibrary({ returnFocus = true } = {}) {
    elements.libraryPage.classList.add("hidden");
    elements.libraryPage.setAttribute("aria-hidden", "true");
    clearCoverObjectUrls();
    syncBodyPageState();
    if (returnFocus) window.setTimeout(() => elements.openOtherCollection?.focus({ preventScroll: true }), 0);
  }

  function openSeries(seriesId, { returnTarget = "home" } = {}) {
    const summary = findSummary(seriesId);
    if (!summary) {
      onToast?.("Die Reihe wurde nicht gefunden.", "error");
      return;
    }

    state.selectedSeriesId = summary.seriesId || summary.series;
    state.seriesReturnTarget = returnTarget;
    state.seriesView = "shelf";
    state.seriesFilter = "all";
    state.seriesSearch = "";
    state.selectionMode = false;
    state.selectedIssueIds.clear();
    state.bulkUndo = null;
    elements.seriesSearch.value = "";
    elements.seriesFilter.value = "all";
    setSeriesView("shelf", { render: false });
    renderSeries();
    elements.seriesPage.classList.remove("hidden");
    elements.seriesPage.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-page-open");
    elements.seriesPage.scrollTop = 0;
    window.setTimeout(() => elements.closeSeries.focus({ preventScroll: true }), 0);
  }

  function openSeriesByName(seriesName, options = {}) {
    const lookup = normalizeSeriesLookup(seriesName);
    const summary = state.summaries.find((entry) => normalizeSeriesLookup(entry.series) === lookup);
    if (summary) openSeries(summary.seriesId || summary.series, options);
  }

  function closeSeries({ returnFocus = true } = {}) {
    closeIssueDetail({ returnFocus: false });
    elements.seriesPage.classList.add("hidden");
    elements.seriesPage.setAttribute("aria-hidden", "true");
    state.selectionMode = false;
    state.selectedIssueIds.clear();
    hideBulkBar();
    clearCoverObjectUrls();
    if (state.seriesReturnTarget === "library" && isVisible(elements.libraryPage)) renderLibrary();
    syncBodyPageState();
    if (!returnFocus) return;
    window.setTimeout(() => {
      if (state.seriesReturnTarget === "library" && isVisible(elements.libraryPage)) {
        const selector = `[data-series-id="${cssEscape(state.selectedSeriesId)}"]`;
        (elements.seriesLibraryGrid.querySelector(selector) || elements.closeLibrary).focus({ preventScroll: true });
      } else {
        elements.openMainCollection?.focus({ preventScroll: true });
      }
    }, 0);
  }

  function renderLibrary() {
    clearCoverObjectUrls();
    const isAll = state.libraryScope === "all";
    elements.libraryTitle.textContent = isAll ? "Alle Reihen" : "Sonderbände & weitere Reihen";

    const normalizedSearch = normalizeText(state.librarySearch);
    let summaries = state.summaries.filter((summary) => isAll || !isMainSummary(summary));
    if (normalizedSearch) summaries = summaries.filter((summary) => normalizeText(summary.series).includes(normalizedSearch));

    if (state.librarySort === "unread") {
      summaries = [...summaries].sort((first, second) => second.unreadCount - first.unreadCount || compareNames(first.series, second.series));
    } else {
      summaries = sortSeriesSummaries(summaries, state.librarySort);
    }

    elements.librarySeriesCount.textContent = `${summaries.length} ${summaries.length === 1 ? "Reihe" : "Reihen"}`;
    renderSmartLists();
    elements.seriesLibraryGrid.replaceChildren();
    elements.libraryEmpty.classList.toggle("hidden", summaries.length > 0);

    summaries.forEach((summary) => elements.seriesLibraryGrid.append(createSeriesLibraryCard(summary)));
  }

  function renderSmartLists() {
    const counts = buildSmartListCounts(state.snapshot.comics, { localCoverIds: state.localCoverIds });
    elements.smartListGrid.replaceChildren();

    SMART_LIST_DEFINITIONS.forEach((definition) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "smart-list-card";
      button.dataset.smartList = definition.id;

      const icon = document.createElement("span");
      icon.className = "smart-list-icon";
      icon.append(createIcon(definition.icon));

      const copy = document.createElement("span");
      copy.className = "smart-list-copy";
      const title = document.createElement("strong");
      title.textContent = definition.title;
      const description = document.createElement("small");
      description.textContent = definition.description;
      copy.append(title, description);

      const count = document.createElement("span");
      count.className = "smart-list-count";
      count.textContent = String(counts[definition.id] || 0);
      button.append(icon, copy, count);
      elements.smartListGrid.append(button);
    });
  }

  function createSeriesLibraryCard(summary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "series-library-card";
    button.dataset.seriesId = summary.seriesId || summary.series;

    const collage = document.createElement("span");
    collage.className = "series-cover-collage";
    const candidates = summary.coverCandidates.slice(0, 3);
    for (let index = 0; index < 3; index += 1) {
      const slot = document.createElement("span");
      slot.className = "series-cover-collage-slot";
      const comic = candidates[index];
      if (comic) appendCoverToSlot(slot, comic, summary.series, comic.volumeNumber);
      else appendMiniFallback(slot, summary.series, summary.issueCount ? "…" : "0");
      collage.append(slot);
    }

    const body = document.createElement("span");
    body.className = "series-library-card-body";
    const heading = document.createElement("span");
    heading.className = "series-library-heading";
    const name = document.createElement("strong");
    name.textContent = summary.series;
    const completion = document.createElement("span");
    completion.className = `series-completion${summary.completionPercentage >= 100 && summary.target > 0 ? " is-complete" : ""}`;
    completion.textContent = `${formatPercent(summary.completionPercentage)} %`;
    heading.append(name, completion);

    const progress = document.createElement("span");
    progress.className = "series-library-progress";
    const fill = document.createElement("span");
    fill.style.width = `${clampPercent(summary.completionPercentage)}%`;
    progress.append(fill);

    const meta = document.createElement("span");
    meta.className = "series-library-meta";
    meta.textContent = summary.target > 0
      ? `${summary.ownedWithinTarget} von ${summary.target} Zielbänden · ${summary.copyCount} Exemplare`
      : `${summary.issueCount} Ausgaben · ${summary.copyCount} Exemplare`;

    const tags = document.createElement("span");
    tags.className = "series-library-tags";
    tags.append(createMiniTag(`${summary.missingCount} fehlen`));
    if (summary.unreadCount) tags.append(createMiniTag(`${summary.unreadCount} ungelesen`));
    if (summary.duplicateCount) tags.append(createMiniTag(`${summary.duplicateCount} mehrfach`));
    if (summary.coverCount) tags.append(createMiniTag(`${summary.coverCount} Cover`));

    body.append(heading, progress, meta, tags);
    const arrow = document.createElement("span");
    arrow.className = "series-library-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    button.append(collage, body, arrow);
    return button;
  }

  function renderSeries() {
    clearCoverObjectUrls();
    const summary = findSummary(state.selectedSeriesId);
    if (!summary) {
      closeSeries({ returnFocus: false });
      return;
    }

    state.selectedSeriesId = summary.seriesId || summary.series;
    elements.seriesPageTitle.textContent = summary.series;
    elements.seriesPageCount.textContent = `${summary.issueCount} ${summary.issueCount === 1 ? "Band" : "Bände"}`;
    elements.seriesHeroEyebrow.textContent = summary.explicitTarget ? `Sammlungsziel: Band ${summary.explicitTarget}` : "Deine Reihe";
    elements.seriesHeroTitle.textContent = summary.series;
    elements.seriesHeroProgress.textContent = `${formatPercent(summary.completionPercentage)} %`;
    elements.seriesHeroProgressCopy.textContent = summary.target > 0
      ? `${summary.ownedWithinTarget} von ${summary.target} Bänden vorhanden · ${summary.missingCount} fehlen`
      : `${summary.issueCount} Ausgaben und ${summary.copyCount} physische Exemplare erfasst`;
    elements.seriesHeroProgressBar.setAttribute("aria-valuenow", String(Math.round(clampPercent(summary.completionPercentage))));
    elements.seriesHeroProgressFill.style.width = `${clampPercent(summary.completionPercentage)}%`;
    renderSeriesHeroCovers(summary);
    renderSeriesMetrics(summary);
    renderNextRelease(summary);
    renderSeriesContent(summary);
    renderBulkBar();
  }

  function renderSeriesHeroCovers(summary) {
    elements.seriesHeroCovers.replaceChildren();
    const candidates = summary.coverCandidates.slice(0, 3);
    for (let index = 0; index < 3; index += 1) {
      const slot = document.createElement("span");
      slot.className = "series-hero-cover";
      const comic = candidates[index];
      if (comic) appendCoverToSlot(slot, comic, summary.series, comic.volumeNumber, { eager: true });
      else {
        slot.classList.add("is-fallback");
        slot.textContent = index === 0 ? getSeriesAbbreviation(summary.series) : "•";
      }
      elements.seriesHeroCovers.append(slot);
    }
  }

  function renderSeriesMetrics(summary) {
    elements.seriesHeroMetrics.replaceChildren();
    const metrics = [
      [summary.issueCount, "Ausgaben"],
      [summary.copyCount, "Exemplare"],
      [summary.unreadCount, "ungelesen"],
      [summary.duplicateCount, "mehrfach"]
    ];
    metrics.forEach(([value, label]) => {
      const item = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      const span = document.createElement("span");
      span.textContent = label;
      item.append(strong, span);
      elements.seriesHeroMetrics.append(item);
    });
  }

  function renderNextRelease(summary) {
    const now = new Date();
    const today = toIsoDate(now);
    const events = Array.isArray(state.snapshot.settings.calendarEvents) ? state.snapshot.settings.calendarEvents : [];
    const next = events
      .filter((event) => event?.category === "release" && String(event.startDate || "") >= today && eventMatchesSeries(event, summary))
      .sort((first, second) => String(first.startDate).localeCompare(String(second.startDate)))[0];

    elements.seriesNextRelease.classList.toggle("hidden", !next);
    if (!next) return;
    elements.seriesNextReleaseTitle.textContent = next.title || "Neuerscheinung";
    elements.seriesNextReleaseDate.textContent = formatReleaseDate(next.startDate);
    elements.seriesNextReleaseDate.setAttribute("datetime", next.startDate);
  }

  function renderSeriesContent(summary) {
    const filter = state.seriesFilter === "multiple" ? "duplicates" : state.seriesFilter;
    const normalizedSearch = normalizeText(state.seriesSearch.trim());
    const maximumBand = summary.target || summary.highestOwned;
    const shelfContent = maximumBand > 0
      ? buildShelfSlots(summary.comics, { target: maximumBand, startBand: 1, maximumBand })
      : { slots: [], nonNumericComics: summary.comics.filter((comic) => !comic.numericBandNumber) };

    let visibleSlots = shelfContent.slots.filter((slot) => {
      if (state.seriesFilter === "owned" && slot.type !== "owned") return false;
      if (state.seriesFilter === "missing" && slot.type !== "missing") return false;
      if (!["all", "owned", "missing"].includes(state.seriesFilter)) {
        if (slot.type !== "owned") return false;
        return filterSeriesComics([slot.comic], filter, state.localCoverIds).length > 0;
      }
      if (!normalizedSearch) return true;
      return slot.type === "missing"
        ? String(slot.bandNumber).includes(normalizedSearch)
        : comicMatchesSearch(slot.comic, normalizedSearch);
    });

    let visibleNonNumeric = filterSeriesComics(
      shelfContent.nonNumericComics,
      ["all", "owned", "missing"].includes(state.seriesFilter) ? "all" : filter,
      state.localCoverIds
    ).filter((comic) => !normalizedSearch || comicMatchesSearch(comic, normalizedSearch));
    if (state.seriesFilter === "missing") visibleNonNumeric = [];
    visibleNonNumeric = sortSeriesComics(visibleNonNumeric, "volume-asc");

    elements.seriesShelfGrid.replaceChildren();
    elements.seriesComicList.replaceChildren();
    elements.seriesNonnumeric.replaceChildren();

    if (state.seriesView === "shelf") {
      visibleSlots.forEach((slot) => elements.seriesShelfGrid.append(createShelfTile(slot, summary)));
      visibleNonNumeric.forEach((comic) => elements.seriesNonnumeric.append(createShelfTile({ type: "owned", comic, bandNumber: comic.volumeNumber }, summary)));
    } else {
      visibleSlots.forEach((slot) => elements.seriesComicList.append(createSeriesListCard(slot, summary)));
      visibleNonNumeric.forEach((comic) => elements.seriesComicList.append(createSeriesListCard({ type: "owned", comic, bandNumber: comic.volumeNumber }, summary)));
    }

    const visibleCount = visibleSlots.length + visibleNonNumeric.length;
    const totalCount = shelfContent.slots.length + shelfContent.nonNumericComics.length;
    elements.seriesVisibleCount.textContent = normalizedSearch || state.seriesFilter !== "all"
      ? `${visibleCount} von ${totalCount} Einträgen`
      : `${visibleCount} ${visibleCount === 1 ? "Eintrag" : "Einträge"}`;
    elements.seriesEmpty.classList.toggle("hidden", visibleCount > 0);
    elements.seriesShelfView.classList.toggle("hidden", state.seriesView !== "shelf" || visibleCount === 0);
    elements.seriesListView.classList.toggle("hidden", state.seriesView !== "list" || visibleCount === 0);
    elements.seriesNonnumericSection.classList.toggle("hidden", state.seriesView !== "shelf" || visibleNonNumeric.length === 0);
  }

  function createShelfTile(slot, summary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `shelf-tile ${slot.type === "owned" ? "is-owned" : "is-missing"}`;
    button.dataset.series = summary.series;
    button.dataset.bandNumber = String(slot.bandNumber);

    if (slot.type === "missing") {
      button.dataset.missingBand = String(slot.bandNumber);
      const cover = document.createElement("span");
      cover.className = "shelf-cover shelf-cover-missing";
      const plus = document.createElement("span");
      plus.textContent = "+";
      const number = document.createElement("strong");
      number.textContent = String(slot.bandNumber);
      cover.append(plus, number);
      const body = document.createElement("span");
      body.className = "shelf-tile-body";
      const title = document.createElement("strong");
      title.textContent = `Band ${slot.bandNumber}`;
      const label = document.createElement("span");
      label.className = "shelf-missing-label";
      label.textContent = "Fehlt";
      body.append(title, label);
      button.append(cover, body);
      button.setAttribute("aria-label", `${summary.series}, Band ${slot.bandNumber} fehlt. Details öffnen.`);
      return button;
    }

    const comic = slot.comic;
    button.dataset.issueId = comic.id;
    if (state.selectedIssueIds.has(comic.id)) button.classList.add("is-selected");
    if (state.selectionMode) {
      const indicator = document.createElement("span");
      indicator.className = "shelf-selection-indicator";
      indicator.textContent = state.selectedIssueIds.has(comic.id) ? "✓" : "+";
      button.append(indicator);
    }

    const cover = document.createElement("span");
    cover.className = "shelf-cover";
    appendShelfCover(cover, comic, summary.series, comic.volumeNumber);

    const body = document.createElement("span");
    body.className = "shelf-tile-body";
    const title = document.createElement("strong");
    title.textContent = `Band ${comic.volumeNumber}`;
    const subtitle = document.createElement("small");
    subtitle.textContent = comic.title || "Titel noch nicht ergänzt";
    const footer = document.createElement("span");
    footer.className = "shelf-tile-footer";
    getComicCopies(comic).slice(0, 2).forEach((copy) => footer.append(createConditionChip(copy.condition)));
    if (getComicCopies(comic).length > 1) footer.append(createMiniTag(`${getComicCopies(comic).length}×`));
    if (!getComicCopies(comic).some((copy) => copy.isRead)) footer.append(createMiniTag("ungelesen"));
    body.append(title, subtitle, footer);
    button.append(cover, body);
    button.setAttribute("aria-label", `${summary.series}, Band ${comic.volumeNumber}${comic.title ? `, ${comic.title}` : ""}. ${state.selectionMode ? "Auswählen" : "Details öffnen"}.`);
    return button;
  }

  function createSeriesListCard(slot, summary) {
    const article = document.createElement("article");
    article.className = "series-list-card";

    if (slot.type === "missing") {
      const main = document.createElement("button");
      main.type = "button";
      main.className = "series-list-main";
      main.dataset.missingBand = String(slot.bandNumber);
      main.dataset.series = summary.series;
      const band = document.createElement("span");
      band.className = "series-list-band";
      band.textContent = String(slot.bandNumber);
      const copy = document.createElement("span");
      copy.className = "series-list-copy";
      const title = document.createElement("strong");
      title.textContent = `Band ${slot.bandNumber}`;
      const detail = document.createElement("small");
      detail.textContent = "Fehlt · Details oder Wunschdaten ergänzen";
      copy.append(title, detail);
      const badge = createMiniTag("Fehlt");
      main.append(band, copy, badge);
      article.append(main);
      return article;
    }

    const comic = slot.comic;
    article.dataset.issueId = comic.id;
    if (state.selectedIssueIds.has(comic.id)) article.classList.add("is-selected");

    if (state.selectionMode) {
      const select = document.createElement("button");
      select.type = "button";
      select.className = "series-list-select";
      select.dataset.selectIssue = comic.id;
      select.textContent = state.selectedIssueIds.has(comic.id) ? "✓" : "+";
      select.setAttribute("aria-label", `Band ${comic.volumeNumber} ${state.selectedIssueIds.has(comic.id) ? "abwählen" : "auswählen"}`);
      article.append(select);
    }

    const main = document.createElement("button");
    main.type = "button";
    main.className = "series-list-main";
    main.dataset.issueId = comic.id;
    const band = document.createElement("span");
    band.className = "series-list-band";
    band.textContent = String(comic.volumeNumber);
    const copy = document.createElement("span");
    copy.className = "series-list-copy";
    const title = document.createElement("strong");
    title.textContent = comic.title || `Band ${comic.volumeNumber}`;
    const detail = document.createElement("small");
    const copies = getComicCopies(comic);
    detail.textContent = `${comic.publicationYear || "Jahr offen"} · ${copies.length} ${copies.length === 1 ? "Exemplar" : "Exemplare"}`;
    copy.append(title, detail);
    const badges = document.createElement("span");
    badges.className = "series-list-badges";
    copies.slice(0, 2).forEach((entry) => badges.append(createConditionChip(entry.condition)));
    main.append(band, copy, badges);
    article.append(main);
    return article;
  }

  function setSeriesView(view, { render = true } = {}) {
    state.seriesView = view === "list" ? "list" : "shelf";
    elements.seriesViewButtons.forEach((button) => {
      const active = button.dataset.seriesView === state.seriesView;
      button.classList.toggle("is-active", active);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (render && isVisible(elements.seriesPage)) renderSeries();
  }

  function toggleSelectionMode(forceValue) {
    state.selectionMode = typeof forceValue === "boolean" ? forceValue : !state.selectionMode;
    if (!state.selectionMode) state.selectedIssueIds.clear();
    elements.seriesSelectMode.classList.toggle("is-active", state.selectionMode);
    elements.seriesSelectMode.textContent = state.selectionMode ? "Auswahl beenden" : "Auswählen";
    renderSeries();
  }

  function toggleIssueSelection(issueId) {
    if (!issueId) return;
    if (state.selectedIssueIds.has(issueId)) state.selectedIssueIds.delete(issueId);
    else state.selectedIssueIds.add(issueId);
    renderSeries();
  }

  function renderBulkBar() {
    const count = state.selectedIssueIds.size;
    const show = state.selectionMode;
    elements.seriesBulkBar.classList.toggle("hidden", !show);
    elements.seriesBulkCount.textContent = `${count} ${count === 1 ? "Band" : "Bände"} ausgewählt`;
    elements.seriesBulkActions.querySelectorAll("button").forEach((button) => {
      if (button.id === "series-bulk-undo") return;
      button.disabled = count === 0;
    });
    elements.seriesBulkCondition.disabled = count === 0;
    elements.seriesBulkConditionApply.disabled = count === 0;
    elements.seriesBulkUndo.classList.toggle("hidden", !state.bulkUndo);
  }

  function hideBulkBar() {
    elements.seriesBulkBar.classList.add("hidden");
  }

  async function applyBulkAction(action) {
    if (!state.selectedIssueIds.size) return;
    const patchByAction = {
      read: { isRead: true },
      unread: { isRead: false },
      seal: { isSealed: true },
      unseal: { isSealed: false }
    };
    const patch = patchByAction[action];
    if (!patch) return;
    await commitBulkPatch(patch, action);
  }

  async function applyBulkCondition() {
    const condition = elements.seriesBulkCondition.value || DEFAULT_CONDITION_CODE;
    await commitBulkPatch({ condition }, "condition");
  }

  async function commitBulkPatch(patch, action) {
    if (!state.selectedIssueIds.size || typeof onBulkSave !== "function") return;
    const selectedIds = new Set(state.selectedIssueIds);
    const before = state.snapshot.comics.filter((comic) => selectedIds.has(comic.id)).map(cloneValue);
    const result = applyBulkPatch(state.snapshot.comics, selectedIds, patch);
    const updated = result.comics.filter((comic) => selectedIds.has(comic.id));
    if (!result.changed) return;

    setBulkControlsDisabled(true);
    try {
      await onBulkSave(updated, { action });
      state.bulkUndo = { comics: before, count: result.changed };
      state.selectedIssueIds.clear();
      onToast?.(`${result.changed} ${result.changed === 1 ? "Band wurde" : "Bände wurden"} aktualisiert.`, "success");
      renderBulkBar();
    } catch (error) {
      onToast?.(`Sammeländerung fehlgeschlagen: ${error.message}`, "error");
    } finally {
      setBulkControlsDisabled(false);
    }
  }

  async function undoBulkAction() {
    if (!state.bulkUndo?.comics?.length || typeof onBulkSave !== "function") return;
    const undo = state.bulkUndo;
    state.bulkUndo = null;
    setBulkControlsDisabled(true);
    try {
      await onBulkSave(undo.comics.map(cloneValue), { action: "undo" });
      onToast?.(`${undo.count} ${undo.count === 1 ? "Änderung wurde" : "Änderungen wurden"} rückgängig gemacht.`, "success");
    } catch (error) {
      state.bulkUndo = undo;
      onToast?.(`Rückgängig fehlgeschlagen: ${error.message}`, "error");
    } finally {
      setBulkControlsDisabled(false);
      renderBulkBar();
    }
  }

  function setBulkControlsDisabled(disabled) {
    elements.seriesBulkActions.querySelectorAll("button, select").forEach((control) => { control.disabled = disabled; });
    elements.seriesBulkCondition.disabled = disabled;
    elements.seriesBulkConditionApply.disabled = disabled;
    elements.seriesBulkUndo.disabled = disabled;
  }

  async function openIssueDetail(issueId, { preserveFocus = false } = {}) {
    const comic = state.snapshot.comics.find((entry) => entry.id === issueId);
    if (!comic) return;
    state.issueDetailId = issueId;
    revokeIssueDetailObjectUrl();

    const copies = getComicCopies(comic);
    elements.issueDetailSeries.textContent = comic.series;
    elements.issueDetailTitle.textContent = comic.title || `Band ${comic.volumeNumber}`;
    elements.issueDetailMeta.textContent = `Band ${comic.volumeNumber}${comic.publicationYear ? ` · ${comic.publicationYear}` : ""}`;
    elements.issueDetailNotes.textContent = comic.notes || "";
    elements.issueDetailNotes.classList.toggle("hidden", !comic.notes);
    const hasDuckipediaLink = Boolean(String(comic.duckipediaPageUrl || "").trim());
    elements.issueDetailDuckipedia.classList.toggle("hidden", !hasDuckipediaLink);
    if (hasDuckipediaLink) elements.issueDetailDuckipedia.href = comic.duckipediaPageUrl;
    else elements.issueDetailDuckipedia.removeAttribute("href");

    elements.issueDetailFacts.replaceChildren(
      createDetailFact("Jahr", comic.publicationYear || "–"),
      createDetailFact("Exemplare", copies.length),
      createDetailFact("Gelesen", `${copies.filter((copy) => copy.isRead).length}/${copies.length}`)
    );
    elements.issueDetailCopies.replaceChildren();

    copies.forEach((copy, index) => {
      const card = document.createElement("article");
      card.className = "issue-detail-copy";
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `Exemplar ${index + 1}`;
      heading.append(title, createConditionChip(copy.condition));
      const status = document.createElement("small");
      status.textContent = [copy.isRead ? "gelesen" : "ungelesen", copy.isSealed ? "foliert" : "nicht foliert"].join(" · ");
      card.append(heading, status);
      if (copy.notes) {
        const notes = document.createElement("p");
        notes.textContent = copy.notes;
        card.append(notes);
      }
      elements.issueDetailCopies.append(card);
    });

    elements.issueDetailCoverImage.classList.add("hidden");
    elements.issueDetailCoverImage.removeAttribute("src");
    elements.issueDetailCoverFallback.classList.remove("hidden");
    const fallbackStrong = elements.issueDetailCoverFallback.querySelector("strong");
    if (fallbackStrong) fallbackStrong.textContent = String(comic.volumeNumber || "–");

    elements.issueDetailCard.scrollTop = 0;
    elements.issueDetailModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    window.requestAnimationFrame?.(() => { elements.issueDetailCard.scrollTop = 0; });
    void hydrateDetailCover(comic);
    if (!preserveFocus) window.setTimeout(() => elements.closeIssueDetail.focus({ preventScroll: true }), 0);
  }

  async function hydrateDetailCover(comic) {
    try {
      const local = typeof getCoverMedia === "function" ? await getCoverMedia(comic.id) : null;
      if (state.issueDetailId !== comic.id || !isVisible(elements.issueDetailModal)) return;
      if (local?.blob instanceof Blob) {
        const objectUrl = URL.createObjectURL(local.blob);
        state.issueDetailObjectUrl = objectUrl;
        showDetailCover(objectUrl, comic);
        return;
      }
      if (comic.duckipediaCoverUrl) {
        showDetailCover(comic.duckipediaCoverUrl, comic);
        return;
      }
      if (!shouldRepairDuckipediaCover(comic)) return;
      const result = await requestCoverRepair(comic);
      if (state.issueDetailId !== comic.id || !isVisible(elements.issueDetailModal)) return;
      const repairedComic = result?.comic || comic;
      if (repairedComic.duckipediaCoverUrl) showDetailCover(repairedComic.duckipediaCoverUrl, repairedComic);
    } catch (error) {
      console.warn("Cover konnte im Detail nicht geladen werden:", error);
    }
  }

  function showDetailCover(source, comic) {
    const image = elements.issueDetailCoverImage;
    image.alt = `Cover von ${comic.series}, Band ${comic.volumeNumber}`;
    image.addEventListener("load", () => {
      image.classList.remove("hidden");
      elements.issueDetailCoverFallback.classList.add("hidden");
    }, { once: true });
    image.addEventListener("error", () => {
      image.classList.add("hidden");
      elements.issueDetailCoverFallback.classList.remove("hidden");
    }, { once: true });
    image.src = source;
  }

  function closeIssueDetail({ returnFocus = true } = {}) {
    if (!elements.issueDetailModal || elements.issueDetailModal.classList.contains("hidden")) return;
    const issueId = state.issueDetailId;
    elements.issueDetailModal.classList.add("hidden");
    state.issueDetailId = "";
    revokeIssueDetailObjectUrl();
    syncBodyModalState();
    if (returnFocus && issueId) {
      window.setTimeout(() => {
        const target = elements.seriesPage.querySelector(`[data-issue-id="${cssEscape(issueId)}"]`);
        target?.focus({ preventScroll: true });
      }, 0);
    }
  }

  function bindEvents() {
    elements.closeLibrary.addEventListener("click", () => closeLibrary());
    elements.closeSeries.addEventListener("click", () => closeSeries());
    elements.libraryAllList.addEventListener("click", () => onOpenCollection?.({ scope: "all", title: "Alle Bände", returnTarget: "library" }));
    elements.librarySearch.addEventListener("input", () => { state.librarySearch = elements.librarySearch.value; renderLibrary(); });
    elements.librarySort.addEventListener("change", () => { state.librarySort = elements.librarySort.value; renderLibrary(); });

    elements.smartListGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-smart-list]");
      if (!button) return;
      const definition = SMART_LIST_DEFINITIONS.find((entry) => entry.id === button.dataset.smartList);
      onOpenCollection?.({
        scope: "all",
        smartList: button.dataset.smartList,
        title: definition?.title || "Intelligente Liste",
        returnTarget: "library",
        localCoverIds: [...state.localCoverIds]
      });
    });

    elements.seriesLibraryGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-series-id]");
      if (button) openSeries(button.dataset.seriesId, { returnTarget: "library" });
    });

    elements.seriesViewButtons.forEach((button) => button.addEventListener("click", () => setSeriesView(button.dataset.seriesView)));
    elements.seriesSearch.addEventListener("input", () => {
      state.seriesSearch = elements.seriesSearch.value;
      renderSeries();
    });
    elements.seriesFilter.addEventListener("change", () => { state.seriesFilter = elements.seriesFilter.value; renderSeries(); });
    elements.seriesSelectMode.addEventListener("click", () => toggleSelectionMode());
    elements.seriesTargetButton.addEventListener("click", () => {
      const summary = findSummary(state.selectedSeriesId);
      if (summary) onOpenProgress?.(summary.series);
    });

    elements.seriesShelfGrid.addEventListener("click", handleSeriesContentClick);
    elements.seriesNonnumeric.addEventListener("click", handleSeriesContentClick);
    elements.seriesComicList.addEventListener("click", handleSeriesContentClick);

    elements.seriesBulkActions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-bulk-action]");
      if (button) applyBulkAction(button.dataset.bulkAction);
    });
    elements.seriesBulkConditionApply.addEventListener("click", applyBulkCondition);
    elements.seriesBulkUndo.addEventListener("click", undoBulkAction);
    elements.seriesBulkCancel.addEventListener("click", () => toggleSelectionMode(false));

    elements.closeIssueDetail.addEventListener("click", () => closeIssueDetail());
    elements.issueDetailModal.querySelectorAll("[data-close-issue-detail]").forEach((item) => item.addEventListener("click", () => closeIssueDetail()));
    elements.issueDetailEdit.addEventListener("click", () => {
      const comic = state.snapshot.comics.find((entry) => entry.id === state.issueDetailId);
      if (!comic) return;
      closeIssueDetail({ returnFocus: false });
      closeSeries({ returnFocus: false });
      onEditComic?.(comic);
    });
    elements.issueDetailCopiesButton.addEventListener("click", () => {
      const comic = state.snapshot.comics.find((entry) => entry.id === state.issueDetailId);
      if (!comic) return;
      closeIssueDetail({ returnFocus: false });
      onManageCopies?.(comic);
    });
    elements.issueDetailEnrich.addEventListener("click", async () => {
      const comic = state.snapshot.comics.find((entry) => entry.id === state.issueDetailId);
      if (!comic || typeof onEnrichComic !== "function") return;
      elements.issueDetailEnrich.disabled = true;
      try {
        await onEnrichComic(comic);
      } finally {
        elements.issueDetailEnrich.disabled = false;
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (isVisible(elements.issueDetailModal)) closeIssueDetail();
      else if (isVisible(elements.seriesPage)) closeSeries();
      else if (isVisible(elements.libraryPage)) closeLibrary();
    });
  }

  function handleSeriesContentClick(event) {
    const missing = event.target.closest("[data-missing-band]");
    if (missing) {
      const summary = findSummary(state.selectedSeriesId);
      if (summary) onOpenMissingDetail?.(summary.series, Number(missing.dataset.missingBand));
      return;
    }

    const select = event.target.closest("[data-select-issue]");
    const target = event.target.closest("[data-issue-id]");
    const issueId = select?.dataset.selectIssue || target?.dataset.issueId;
    if (!issueId) return;
    if (state.selectionMode || select) toggleIssueSelection(issueId);
    else openIssueDetail(issueId);
  }

  function appendCoverToSlot(slot, comic, series, bandNumber, { eager = false } = {}) {
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = eager ? "eager" : "lazy";
    const fallback = document.createElement("span");
    fallback.className = "series-cover-mini-fallback";
    fallback.textContent = String(bandNumber || getSeriesAbbreviation(series));
    slot.append(fallback, image);
    scheduleCoverHydration(image, fallback, comic, { eager });
  }

  function appendMiniFallback(slot, series, label) {
    const fallback = document.createElement("span");
    fallback.className = "series-cover-mini-fallback";
    fallback.textContent = label || getSeriesAbbreviation(series);
    slot.append(fallback);
  }

  function appendShelfCover(container, comic, series, bandNumber) {
    const fallback = document.createElement("span");
    fallback.className = "shelf-cover-fallback";
    const label = document.createElement("span");
    label.textContent = getSeriesAbbreviation(series);
    const number = document.createElement("strong");
    number.textContent = String(bandNumber || "–");
    fallback.append(label, number);
    const image = document.createElement("img");
    image.alt = `Cover von ${series}, Band ${bandNumber}`;
    image.decoding = "async";
    image.loading = "lazy";
    container.append(fallback, image);
    scheduleCoverHydration(image, fallback, comic);
  }

  function scheduleCoverHydration(image, fallback, comic, { eager = false } = {}) {
    if (eager || typeof IntersectionObserver !== "function") {
      void hydrateCoverImage(image, fallback, comic);
      return;
    }

    const observer = ensureCoverObserver();
    state.coverTasks.set(fallback, { image, fallback, comic });
    observer.observe(fallback);
  }

  function ensureCoverObserver() {
    if (state.coverObserver) return state.coverObserver;
    state.coverObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting && entry.intersectionRatio <= 0) return;
        const task = state.coverTasks.get(entry.target);
        state.coverObserver?.unobserve(entry.target);
        state.coverTasks.delete(entry.target);
        if (task) void hydrateCoverImage(task.image, task.fallback, task.comic);
      });
    }, { rootMargin: "480px 0px" });
    return state.coverObserver;
  }

  async function hydrateCoverImage(image, fallback, comic) {
    try {
      const local = typeof getCoverMedia === "function" ? await getCoverMedia(comic.id) : null;
      if (!image.isConnected) return;
      if (local?.blob instanceof Blob) {
        const objectUrl = URL.createObjectURL(local.blob);
        state.coverObjectUrls.add(objectUrl);
        setImageSource(image, fallback, objectUrl);
        return;
      }

      if (comic.duckipediaCoverUrl) {
        setImageSource(image, fallback, comic.duckipediaCoverUrl);
        return;
      }

      if (!shouldRepairDuckipediaCover(comic)) return;
      const result = await requestCoverRepair(comic);
      if (!image.isConnected) return;
      const repairedComic = result?.comic || comic;
      if (repairedComic.duckipediaCoverUrl) setImageSource(image, fallback, repairedComic.duckipediaCoverUrl);
    } catch (error) {
      console.warn("Cover konnte nicht geladen werden:", error);
    }
  }

  function shouldRepairDuckipediaCover(comic) {
    return Boolean(
      comic?.id
      && comic.numericBandNumber
      && !comic.duckipediaCoverUrl
      && state.snapshot.settings.duckipediaAutoEnrich !== false
      && typeof navigator !== "undefined"
      && navigator.onLine === true
      && typeof onEnrichComic === "function"
      && !state.coverRepairAttempted.has(comic.id)
    );
  }

  function requestCoverRepair(comic) {
    if (state.coverRepairPromises.has(comic.id)) return state.coverRepairPromises.get(comic.id);
    state.coverRepairAttempted.add(comic.id);
    const promise = new Promise((resolve) => {
      state.coverRepairQueue.push({ comic, resolve });
      pumpCoverRepairQueue();
    }).finally(() => state.coverRepairPromises.delete(comic.id));
    state.coverRepairPromises.set(comic.id, promise);
    return promise;
  }

  function pumpCoverRepairQueue() {
    while (state.coverRepairActive < 2 && state.coverRepairQueue.length) {
      const job = state.coverRepairQueue.shift();
      state.coverRepairActive += 1;
      Promise.resolve(onEnrichComic?.(job.comic, { force: true, silent: true }))
        .then((result) => {
          if (result?.comic) updateSnapshotComic(result.comic);
          job.resolve(result || null);
        })
        .catch((error) => {
          console.warn("Duckipedia-Cover konnte nicht nachgeladen werden:", error);
          job.resolve(null);
        })
        .finally(() => {
          state.coverRepairActive -= 1;
          pumpCoverRepairQueue();
        });
    }
  }

  function updateSnapshotComic(updatedComic) {
    const index = state.snapshot.comics.findIndex((comic) => comic.id === updatedComic.id);
    if (index >= 0) state.snapshot.comics[index] = updatedComic;
    state.summaries.forEach((summary) => {
      const comicIndex = summary.comics.findIndex((comic) => comic.id === updatedComic.id);
      if (comicIndex >= 0) summary.comics[comicIndex] = updatedComic;
    });
  }

  function setImageSource(image, fallback, source) {
    image.addEventListener("load", () => {
      image.classList.add("is-visible");
      fallback?.classList.add("hidden");
    }, { once: true });
    image.addEventListener("error", () => {
      image.classList.remove("is-visible");
      fallback?.classList.remove("hidden");
    }, { once: true });
    image.src = source;
  }

  function findSummary(seriesIdOrName) {
    const needle = String(seriesIdOrName || "");
    return state.summaries.find((entry) => (entry.seriesId || entry.series) === needle)
      || state.summaries.find((entry) => normalizeSeriesLookup(entry.series) === normalizeSeriesLookup(needle))
      || null;
  }

  function clearCoverObjectUrls() {
    state.coverObserver?.disconnect();
    state.coverObserver = null;
    state.coverTasks = new WeakMap();
    state.coverObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.coverObjectUrls.clear();
  }

  function revokeIssueDetailObjectUrl() {
    if (!state.issueDetailObjectUrl) return;
    URL.revokeObjectURL(state.issueDetailObjectUrl);
    state.issueDetailObjectUrl = "";
  }

  function syncBodyPageState() {
    const openPage = [...document.querySelectorAll(".app-page")].some((page) => !page.classList.contains("hidden"));
    document.body.classList.toggle("app-page-open", openPage);
  }

  function syncBodyModalState() {
    const openModal = [...document.querySelectorAll(".modal")].some((modal) => !modal.classList.contains("hidden"));
    document.body.classList.toggle("modal-open", openModal);
  }
}

function collectElements() {
  const byId = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Entenarchiv-Regal: Element #${id} fehlt.`);
    return element;
  };

  return {
    libraryPage: byId("library-page"),
    closeLibrary: byId("close-library"),
    libraryTitle: byId("library-title"),
    librarySeriesCount: byId("library-series-count"),
    libraryAllList: byId("library-all-list"),
    smartListGrid: byId("smart-list-grid"),
    librarySearch: byId("library-search"),
    librarySort: byId("library-sort"),
    libraryEmpty: byId("library-empty"),
    seriesLibraryGrid: byId("series-library-grid"),
    openOtherCollection: document.getElementById("open-other-collection"),
    openMainCollection: document.getElementById("open-main-collection"),

    seriesPage: byId("series-page"),
    closeSeries: byId("close-series-page"),
    seriesPageTitle: byId("series-page-title"),
    seriesPageCount: byId("series-page-count"),
    seriesHeroCovers: byId("series-hero-covers"),
    seriesHeroEyebrow: byId("series-hero-eyebrow"),
    seriesHeroTitle: byId("series-hero-title"),
    seriesHeroProgress: byId("series-hero-progress"),
    seriesHeroProgressCopy: byId("series-hero-progress-copy"),
    seriesHeroProgressBar: byId("series-hero-progress-bar"),
    seriesHeroProgressFill: byId("series-hero-progress-fill"),
    seriesHeroMetrics: byId("series-hero-metrics"),
    seriesNextRelease: byId("series-next-release"),
    seriesNextReleaseDate: byId("series-next-release-date"),
    seriesNextReleaseTitle: byId("series-next-release-title"),
    seriesTargetButton: byId("series-target-button"),
    seriesViewButtons: [...document.querySelectorAll("[data-series-view]")],
    seriesSearch: byId("series-search"),
    seriesFilter: byId("series-filter"),
    seriesVisibleCount: byId("series-visible-count"),
    seriesSelectMode: byId("series-select-mode"),
    seriesShelfView: byId("series-shelf-view"),
    seriesShelfGrid: byId("series-shelf-grid"),
    seriesNonnumericSection: byId("series-nonnumeric-section"),
    seriesNonnumeric: byId("series-nonnumeric"),
    seriesListView: byId("series-list-view"),
    seriesComicList: byId("series-comic-list"),
    seriesEmpty: byId("series-empty"),
    seriesBulkBar: byId("series-bulk-bar"),
    seriesBulkCount: byId("series-bulk-count"),
    seriesBulkActions: byId("series-bulk-actions"),
    seriesBulkCondition: byId("series-bulk-condition"),
    seriesBulkConditionApply: byId("series-bulk-condition-apply"),
    seriesBulkUndo: byId("series-bulk-undo"),
    seriesBulkCancel: byId("series-bulk-cancel"),

    issueDetailModal: byId("issue-detail-modal"),
    issueDetailCard: byId("issue-detail-card"),
    closeIssueDetail: byId("close-issue-detail"),
    issueDetailSeries: byId("issue-detail-series"),
    issueDetailTitle: byId("issue-detail-title"),
    issueDetailMeta: byId("issue-detail-meta"),
    issueDetailCoverImage: byId("issue-detail-cover-image"),
    issueDetailCoverFallback: byId("issue-detail-cover-fallback"),
    issueDetailFacts: byId("issue-detail-facts"),
    issueDetailCopies: byId("issue-detail-copies"),
    issueDetailNotes: byId("issue-detail-notes"),
    issueDetailDuckipedia: byId("issue-detail-duckipedia"),
    issueDetailEdit: byId("issue-detail-edit"),
    issueDetailCopiesButton: byId("issue-detail-copies-button"),
    issueDetailEnrich: byId("issue-detail-enrich")
  };
}

function normalizeSnapshot(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    comics: Array.isArray(source.comics) ? source.comics : [],
    missingGroups: Array.isArray(source.missingGroups) ? source.missingGroups : [],
    settings: source.settings && typeof source.settings === "object" ? source.settings : {},
    localCoverIds: source.localCoverIds instanceof Set
      ? [...source.localCoverIds]
      : Array.isArray(source.localCoverIds) ? source.localCoverIds : null
  };
}

function createEmptyMainSummary() {
  return {
    seriesId: "ltb-main",
    series: "Lustiges Taschenbuch",
    comics: [],
    issueCount: 0,
    numericIssueCount: 0,
    copyCount: 0,
    unreadCount: 0,
    sealedCount: 0,
    duplicateCount: 0,
    needsCareCount: 0,
    coverCount: 0,
    explicitTarget: 0,
    target: 0,
    highestOwned: 0,
    ownedWithinTarget: 0,
    missingBands: [],
    missingCount: 0,
    completionPercentage: 0,
    qualityPercentage: 0,
    updatedAt: "",
    coverCandidates: [],
    missingSummary: "Keine Lücken"
  };
}

function isMainSummary(summary) {
  return summary?.seriesId === "ltb-main" || normalizeSeriesLookup(summary?.series) === normalizeSeriesLookup("Lustiges Taschenbuch");
}

function populateConditionSelect(select) {
  select.replaceChildren();
  APP_CONFIG.conditions.forEach((condition) => {
    const option = document.createElement("option");
    option.value = condition.code;
    option.textContent = `Zustand ${condition.code} – ${condition.label}`;
    if (condition.code === DEFAULT_CONDITION_CODE) option.selected = true;
    select.append(option);
  });
}

function createDetailFact(label, value) {
  const item = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const small = document.createElement("small");
  small.textContent = label;
  item.append(strong, small);
  return item;
}

function createMiniTag(label) {
  const tag = document.createElement("span");
  tag.className = "series-mini-tag";
  tag.textContent = label;
  return tag;
}

function createConditionChip(code) {
  const normalized = String(code || DEFAULT_CONDITION_CODE).replace(/–/g, "-");
  const chip = document.createElement("span");
  chip.className = `shelf-condition condition-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  chip.textContent = normalized;
  chip.title = getConditionLabel(normalized);
  chip.setAttribute("aria-label", chip.title);
  return chip;
}

function comicMatchesSearch(comic, normalizedSearch) {
  if (!normalizedSearch) return true;
  const copies = getComicCopies(comic);
  return [
    comic.series,
    comic.volumeNumber,
    comic.numericBandNumber,
    comic.title,
    comic.publicationYear,
    comic.notes,
    ...copies.map((copy) => copy.notes)
  ].some((value) => normalizeText(value).includes(normalizedSearch));
}

function eventMatchesSeries(event, summary) {
  const eventText = normalizeText(`${event.title || ""} ${event.notes || ""}`);
  const series = normalizeText(summary.series);
  if (!eventText) return false;
  if (isMainSummary(summary)) {
    return /(^|\s)ltb\s*\d+/i.test(event.title || "")
      || eventText.includes("lustiges taschenbuch")
      || eventText.includes("lustige taschenbuch");
  }
  if (eventText.includes(series)) return true;
  const significantWords = series.split(" ").filter((word) => word.length > 3 && word !== "lustiges" && word !== "taschenbuch");
  return significantWords.length > 0 && significantWords.every((word) => eventText.includes(word));
}

function getSeriesAbbreviation(series) {
  const words = String(series || "LTB").replace(/[-–]/g, " ").split(/\s+/).filter(Boolean);
  const abbreviation = words.map((word) => word[0]).join("").slice(0, 4).toUpperCase();
  return abbreviation || "LTB";
}

function createIcon(name) {
  const paths = {
    spark: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Zm6 10 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9L18 13Z",
    book: "M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Zm2 0v14h11",
    copies: "M8 8h11v12H8zM5 5h11v3M5 5v12h3",
    shield: "M12 3l7 3v5c0 4.4-2.7 7.7-7 10-4.3-2.3-7-5.6-7-10V6l7-3Z",
    repair: "M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-10h.01",
    image: "M4 5h16v14H4zM7 16l3-3 2.5 2.5L16 12l3 4M8.5 9h.01",
    calendar: "M7 3v3m10-3v3M4 8h16M5 5h14v15H5z"
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name] || paths.book);
  svg.append(path);
  return svg;
}

function formatPercent(value) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(clampPercent(value));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function formatReleaseDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("de").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(String(value || "").trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function compareNames(first, second) {
  return String(first || "").localeCompare(String(second || ""), "de", { sensitivity: "base", numeric: true });
}

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function setsEqual(first, second) {
  if (first.size !== second.size) return false;
  return [...first].every((value) => second.has(value));
}

function isVisible(element) {
  return Boolean(element && !element.classList.contains("hidden"));
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}
