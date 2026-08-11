import {
  APP_CONFIG,
  createMetadataCacheKey,
  createMissingDetailKey,
  getConditionLabel
} from "./config.js";
import { getMetadataCache, saveArchiveEntry } from "./storage.js";
import { countMissingBands } from "./missing.js";
import {
  getWishlistPriorityDefinition,
  normalizeWishlistPriority
} from "./collector-goals.js";
import { createStableId, normalizeHttpUrl } from "./app-utils.js";

export function createMissingFeature({
  state,
  elements,
  createConfiguredDuckipediaUrl,
  getMetadataForBand,
  saveMeaningfulSettings,
  renderStats,
  renderFleaMarketHubStatus,
  renderFleaMarket,
  restoreBodyModalState,
  refreshCollection,
  refreshArchiveCoreStatus,
  showToast
}) {
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    elements.missingList.addEventListener("click", handleMissingBandClick);
    elements.closeMissingPage.addEventListener("click", close);
    elements.closeMissingDetail.addEventListener("click", closeDetail);
    elements.missingDetailForm.addEventListener("submit", handleSaveMissingDetail);
    elements.deleteMissingDetail.addEventListener("click", handleDeleteMissingDetail);
    elements.missingMarkOwned.addEventListener("click", handleMarkMissingBandOwned);
    elements.missingDetailModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-missing-detail]")) closeDetail();
    });
  }

  function getScopedGroups() {
    const mainSeries = "Lustiges Taschenbuch";
    return state.missingGroups.filter((group) => (
      state.missingScope === "main"
        ? group.series === mainSeries
        : state.missingScope === "other"
          ? group.series !== mainSeries
          : true
    ));
  }

  function renderHub() {
    const mainSeries = "Lustiges Taschenbuch";
    const mainMissing = state.missingGroups
      .filter((group) => group.series === mainSeries)
      .reduce((sum, group) => sum + group.missingBands.length, 0);
    const otherMissing = state.missingGroups
      .filter((group) => group.series !== mainSeries)
      .reduce((sum, group) => sum + group.missingBands.length, 0);
    const totalMissing = mainMissing + otherMissing;
    elements.mainMissingCount.textContent = String(mainMissing);
    elements.otherMissingCount.textContent = String(otherMissing);
    elements.mainMissingCount.setAttribute("aria-label", `${mainMissing} fehlende Bände`);
    elements.otherMissingCount.setAttribute("aria-label", `${otherMissing} fehlende Bände`);
    elements.missingCount.textContent = totalMissing === 1 ? "1 fehlt" : `${totalMissing} fehlen`;
  }

  function open(scope, { returnTarget = "home" } = {}) {
    bindEvents();
    state.missingScope = scope === "other" ? "other" : scope === "all" ? "all" : "main";
    state.missingReturnTarget = returnTarget;
    state.openMissingSeries = new Set();
    elements.missingPageTitle.textContent = state.missingScope === "main"
      ? "Lustige Taschenbücher"
      : state.missingScope === "other"
        ? "Sonderbände & weitere Reihen"
        : "Alle fehlenden Bände";
    render();
    elements.missingPage.classList.remove("hidden");
    elements.missingPage.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-page-open");
    elements.missingPage.scrollTop = 0;
    window.setTimeout(() => elements.closeMissingPage.focus({ preventScroll: true }), 0);
  }

  function close({ returnFocus = true } = {}) {
    elements.missingPage.classList.add("hidden");
    elements.missingPage.setAttribute("aria-hidden", "true");
    document.body.classList.remove("app-page-open");
    if (!returnFocus) return;
    window.setTimeout(() => {
      if (state.missingReturnTarget === "statistics" && !elements.statisticsPage.classList.contains("hidden")) {
        elements.closeStatistics.focus({ preventScroll: true });
        state.missingReturnTarget = "home";
        return;
      }
      const target = state.missingScope === "main"
        ? elements.openMainMissing
        : state.missingScope === "other"
          ? elements.openOtherMissing
          : elements.dashboardStats;
      target.focus({ preventScroll: true });
      state.missingReturnTarget = "home";
    }, 0);
  }

  function render({ forceOpenSeries = "" } = {}) {
    const currentlyOpen = new Set(state.openMissingSeries || []);
    elements.missingList.querySelectorAll("details[open][data-series]").forEach((details) => currentlyOpen.add(details.dataset.series));
    if (forceOpenSeries) currentlyOpen.add(forceOpenSeries);
    state.openMissingSeries = currentlyOpen;

    const groupsWithMissing = getScopedGroups().filter((group) => group.missingBands.length > 0);
    const totalMissing = countMissingBands(groupsWithMissing);
    elements.missingList.replaceChildren();
    elements.missingEmpty.classList.toggle("hidden", groupsWithMissing.length > 0);
    elements.missingPageCount.textContent = totalMissing === 1 ? "1 fehlt" : `${totalMissing} fehlen`;
    renderHub();

    groupsWithMissing.forEach((group) => {
      const details = document.createElement("details");
      details.className = "missing-card missing-series-details";
      details.dataset.series = group.series;
      details.open = currentlyOpen.has(group.series);
      details.addEventListener("toggle", () => {
        if (details.open) state.openMissingSeries.add(group.series);
        else state.openMissingSeries.delete(group.series);
      });

      const summary = document.createElement("summary");
      const summaryText = document.createElement("span");
      const heading = document.createElement("strong");
      heading.textContent = group.series;
      const meta = document.createElement("small");
      meta.textContent = `${group.missingBands.length} fehlend · geprüft bis Band ${group.highestChecked}`;
      summaryText.append(heading, meta);
      const icon = document.createElement("span");
      icon.className = "disclosure-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⌄";
      summary.append(summaryText, icon);

      const list = document.createElement("div");
      list.className = "missing-band-list detailed-missing-list";
      group.missingBands.forEach((bandNumber) => {
        const key = createMissingDetailKey(group.series, bandNumber);
        const detail = state.settings.missingBandDetails?.[key] || {};
        const button = document.createElement("button");
        button.type = "button";
        const priorityId = normalizeWishlistPriority(detail.priority);
        button.className = detail.title || detail.desiredCondition || detail.notes || detail.publicationYear || priorityId
          ? "missing-band missing-band-detailed"
          : "missing-band";
        if (priorityId) button.classList.add(`missing-priority-${priorityId}`);
        button.dataset.series = group.series;
        button.dataset.bandNumber = String(bandNumber);
        const number = document.createElement("strong");
        number.textContent = `Band ${bandNumber}`;
        button.append(number);
        const priorityDefinition = getWishlistPriorityDefinition(priorityId);
        if (priorityDefinition) {
          const priority = document.createElement("span");
          priority.className = `wishlist-priority wishlist-priority-${priorityId}`;
          priority.textContent = priorityDefinition.shortLabel;
          button.append(priority);
        }
        const detailsText = [
          detail.title,
          detail.publicationYear ? String(detail.publicationYear) : "",
          detail.desiredCondition ? `Wunsch: ${getConditionLabel(detail.desiredCondition)}` : ""
        ].filter(Boolean).join(" · ");
        if (detailsText) {
          const extra = document.createElement("small");
          extra.textContent = detailsText;
          button.append(extra);
        }
        list.append(button);
      });
      details.append(summary, list);
      elements.missingList.append(details);
    });
  }

  function handleMissingBandClick(event) {
    const button = event.target.closest("button[data-series][data-band-number]");
    if (!button) return;
    openDetail(button.dataset.series, Number(button.dataset.bandNumber));
  }

  async function openDetail(series, bandNumber) {
    bindEvents();
    const key = createMissingDetailKey(series, bandNumber);
    const detail = state.settings.missingBandDetails?.[key] || {};
    const lookupSequence = ++state.missingLookupSequence;
    state.selectedMissingBand = { series, bandNumber, key };
    state.openMissingSeries.add(series);
    elements.missingDetailContext.textContent = `${series} · Band ${bandNumber}`;
    elements.missingDetailName.value = detail.title || "";
    elements.missingDetailYear.value = detail.publicationYear ?? "";
    elements.missingDetailPriority.value = normalizeWishlistPriority(detail.priority);
    elements.missingDetailCondition.value = detail.desiredCondition || "";
    elements.missingDetailUrl.value = detail.duckipediaUrl || "";
    elements.missingDetailNotes.value = detail.notes || "";
    elements.missingDuckipediaLink.href = detail.duckipediaUrl || createConfiguredDuckipediaUrl(series, bandNumber, detail.title || "");
    elements.missingDuckipediaLink.textContent = "Duckipedia öffnen";
    elements.deleteMissingDetail.classList.toggle("hidden", !hasDetailContent(detail));
    elements.missingDetailMessage.textContent = "Duckipedia-Daten werden geladen …";
    elements.missingDetailMessage.dataset.type = "info";
    elements.missingDetailModal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    try {
      const metadata = await getMetadataForBand(series, bandNumber, { force: false });
      if (lookupSequence !== state.missingLookupSequence || state.selectedMissingBand?.key !== key) return;
      const currentDetail = state.settings.missingBandDetails?.[key] || {};
      const typedTitle = elements.missingDetailName.value.trim();
      const typedYear = Number(elements.missingDetailYear.value) || null;
      const typedUrl = normalizeHttpUrl(elements.missingDetailUrl.value);
      const enrichedDetail = {
        ...currentDetail,
        title: currentDetail.title || typedTitle || metadata.title || "",
        publicationYear: currentDetail.publicationYear || typedYear || metadata.publicationYear || null,
        duckipediaUrl: currentDetail.duckipediaUrl || typedUrl || metadata.pageUrl || createConfiguredDuckipediaUrl(series, bandNumber),
        metadataFetchedAt: metadata.fetchedAt || new Date().toISOString()
      };
      elements.missingDetailName.value = enrichedDetail.title || "";
      elements.missingDetailYear.value = enrichedDetail.publicationYear ?? "";
      elements.missingDetailUrl.value = enrichedDetail.duckipediaUrl || "";
      elements.missingDuckipediaLink.href = enrichedDetail.duckipediaUrl || createConfiguredDuckipediaUrl(series, bandNumber);
      const changed = enrichedDetail.title !== (currentDetail.title || "")
        || enrichedDetail.publicationYear !== (currentDetail.publicationYear || null)
        || enrichedDetail.duckipediaUrl !== (currentDetail.duckipediaUrl || "");
      if (metadata.found && changed) {
        const nextDetails = { ...(state.settings.missingBandDetails || {}), [key]: enrichedDetail };
        await saveMeaningfulSettings({ missingBandDetails: nextDetails });
        render({ forceOpenSeries: series });
        elements.deleteMissingDetail.classList.remove("hidden");
      }
      elements.missingDetailMessage.textContent = metadata.found
        ? "Titel und Erscheinungsjahr wurden automatisch aus Duckipedia ergänzt, soweit verfügbar."
        : (metadata.reason || "Für diesen Band wurden keine Zusatzdaten gefunden.");
      elements.missingDetailMessage.dataset.type = metadata.found ? "success" : "info";
    } catch (error) {
      if (lookupSequence !== state.missingLookupSequence) return;
      elements.missingDetailMessage.textContent = `Duckipedia-Daten konnten nicht geladen werden: ${error.message}`;
      elements.missingDetailMessage.dataset.type = "error";
    } finally {
      if (lookupSequence === state.missingLookupSequence) window.setTimeout(() => elements.missingDetailName.focus(), 0);
    }
  }

  function closeDetail() {
    state.missingLookupSequence += 1;
    elements.missingDetailModal.classList.add("hidden");
    state.selectedMissingBand = null;
    elements.missingDetailForm.reset();
    elements.missingDetailMessage.textContent = "";
    restoreBodyModalState();
  }

  async function handleSaveMissingDetail(event) {
    event.preventDefault();
    if (!state.selectedMissingBand) return;
    const title = elements.missingDetailName.value.trim();
    const yearRaw = elements.missingDetailYear.value.trim();
    const desiredCondition = elements.missingDetailCondition.value;
    const priority = normalizeWishlistPriority(elements.missingDetailPriority.value);
    const notes = elements.missingDetailNotes.value.trim();
    const duckipediaUrl = normalizeHttpUrl(elements.missingDetailUrl.value);
    if (elements.missingDetailUrl.value.trim() && !duckipediaUrl) {
      setMessage("Der Duckipedia-Link muss mit http:// oder https:// beginnen.", "error");
      return;
    }
    let publicationYear = null;
    if (yearRaw) {
      publicationYear = Number(yearRaw);
      if (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > APP_CONFIG.publicationYearMaximum) {
        setMessage(`Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`, "error");
        return;
      }
    }
    const nextDetails = { ...(state.settings.missingBandDetails || {}) };
    nextDetails[state.selectedMissingBand.key] = {
      title, publicationYear, desiredCondition, priority, notes, duckipediaUrl, updatedAt: new Date().toISOString()
    };
    const openSeries = state.selectedMissingBand.series;
    await saveMeaningfulSettings({ missingBandDetails: nextDetails });
    render({ forceOpenSeries: openSeries });
    renderStats();
    renderFleaMarketHubStatus();
    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
    closeDetail();
    showToast("Details zum fehlenden Band gespeichert.");
  }

  async function handleMarkMissingBandOwned() {
    if (!state.selectedMissingBand) return;
    const selected = { ...state.selectedMissingBand };
    const condition = elements.missingDetailCondition.value;
    if (!APP_CONFIG.conditions.some((entry) => entry.code === condition)) {
      setMessage("Bitte wähle zuerst den Zustand des gefundenen Bands aus.", "error");
      elements.missingDetailCondition.focus();
      return;
    }
    const yearRaw = elements.missingDetailYear.value.trim();
    let publicationYear = null;
    if (yearRaw) {
      publicationYear = Number(yearRaw);
      if (!Number.isInteger(publicationYear) || publicationYear < 1800 || publicationYear > APP_CONFIG.publicationYearMaximum) {
        setMessage(`Das Erscheinungsjahr muss zwischen 1800 und ${APP_CONFIG.publicationYearMaximum} liegen.`, "error");
        elements.missingDetailYear.focus();
        return;
      }
    }
    const typedUrl = elements.missingDetailUrl.value.trim();
    const duckipediaUrl = normalizeHttpUrl(typedUrl);
    if (typedUrl && !duckipediaUrl) {
      setMessage("Der Duckipedia-Link muss mit http:// oder https:// beginnen.", "error");
      return;
    }
    elements.missingMarkOwned.disabled = true;
    setMessage("Band wird in die Sammlung übernommen …", "info");
    try {
      const metadata = await getMetadataCache(createMetadataCacheKey(selected.series, selected.bandNumber));
      const now = new Date().toISOString();
      const entryDraft = {
        id: createStableId(),
        dataFormatVersion: APP_CONFIG.dataFormatVersion,
        series: selected.series,
        volumeNumber: String(selected.bandNumber),
        numericBandNumber: selected.bandNumber,
        title: elements.missingDetailName.value.trim(),
        publicationYear,
        condition,
        duplicateCondition: null,
        isRead: false,
        isDuplicate: false,
        isSealed: false,
        notes: elements.missingDetailNotes.value.trim(),
        duckipediaPageUrl: duckipediaUrl || metadata?.pageUrl || createConfiguredDuckipediaUrl(selected.series, selected.bandNumber),
        duckipediaCoverUrl: metadata?.coverUrl || "",
        duckipediaCoverFileName: metadata?.coverFileName || "",
        duckipediaCoverSource: metadata?.coverSource || "",
        duckipediaCoverLookupVersion: Number(metadata?.lookupVersion || 0),
        metadataStatus: metadata?.found === true ? "found" : "",
        metadataFetchedAt: metadata?.fetchedAt || null,
        createdAt: now,
        updatedAt: now
      };
      await saveArchiveEntry(entryDraft);
      const nextDetails = { ...(state.settings.missingBandDetails || {}) };
      delete nextDetails[selected.key];
      const nextFleaItems = { ...(state.settings.fleaMarketSession?.items || {}) };
      delete nextFleaItems[selected.key];
      await saveMeaningfulSettings({
        missingBandDetails: nextDetails,
        fleaMarketSession: { items: nextFleaItems, updatedAt: state.settings.fleaMarketSession?.updatedAt || null }
      });
      state.openMissingSeries.add(selected.series);
      closeDetail();
      await refreshCollection();
      await refreshArchiveCoreStatus({ showReport: false });
      showToast(`${selected.series} Band ${selected.bandNumber} wurde als vorhanden eingetragen.`);
    } catch (error) {
      console.error(error);
      setMessage(`Band konnte nicht übernommen werden: ${error.message}`, "error");
    } finally {
      elements.missingMarkOwned.disabled = false;
    }
  }

  async function handleDeleteMissingDetail() {
    if (!state.selectedMissingBand) return;
    const nextDetails = { ...(state.settings.missingBandDetails || {}) };
    delete nextDetails[state.selectedMissingBand.key];
    const openSeries = state.selectedMissingBand.series;
    await saveMeaningfulSettings({ missingBandDetails: nextDetails });
    render({ forceOpenSeries: openSeries });
    renderStats();
    renderFleaMarketHubStatus();
    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();
    closeDetail();
    showToast("Ergänzende Details gelöscht.");
  }

  function hasDetailContent(detail) {
    return Boolean(detail && (
      detail.title || detail.publicationYear || detail.desiredCondition || normalizeWishlistPriority(detail.priority)
      || detail.notes || detail.duckipediaUrl
    ));
  }

  function setMessage(message, type) {
    elements.missingDetailMessage.textContent = message;
    elements.missingDetailMessage.dataset.type = type;
  }

  return {
    bindEvents,
    getScopedGroups,
    renderHub,
    open,
    close,
    render,
    openDetail,
    closeDetail,
    hasDetailContent,
    isOpen: () => !elements.missingPage.classList.contains("hidden")
  };
}
