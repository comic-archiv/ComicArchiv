import { getConditionRank } from "./config.js";
import { getComicCopies } from "./archive-model.js";

export const SHELF_PAGE_SIZE = 60;

export const SHELF_VIEW_MODES = Object.freeze(["shelf", "covers", "list", "missing"]);

export const SMART_LIST_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "recent", title: "Neu im Archiv", description: "Zuletzt hinzugefügte oder aktualisierte Bände", icon: "spark" }),
  Object.freeze({ id: "unread", title: "Noch ungelesen", description: "Bände, von denen noch kein Exemplar gelesen wurde", icon: "book" }),
  Object.freeze({ id: "duplicates", title: "Mehrfach vorhanden", description: "Ausgaben mit mindestens zwei physischen Exemplaren", icon: "copies" }),
  Object.freeze({ id: "sealed", title: "Folierte Exemplare", description: "Ausgaben mit mindestens einem folierten Exemplar", icon: "shield" }),
  Object.freeze({ id: "needs-care", title: "Zustand 3 oder schwächer", description: "Bände, bei denen mindestens ein Exemplar genauer geprüft werden sollte", icon: "repair" }),
  Object.freeze({ id: "metadata", title: "Daten ergänzen", description: "Titel, Jahr oder Duckipedia-Verknüpfung fehlen", icon: "info" }),
  Object.freeze({ id: "no-cover", title: "Ohne Cover", description: "Noch ohne eigenes oder geladenes Coverbild", icon: "image" }),
  Object.freeze({ id: "current-year", title: "Aktueller Jahrgang", description: "Bände aus dem laufenden Kalenderjahr", icon: "calendar" })
]);

const MAX_SHELF_BAND = 5000;

export function getSmartListDefinition(id) {
  return SMART_LIST_DEFINITIONS.find((entry) => entry.id === id) || null;
}

export function matchesSmartList(comic, smartListId, {
  currentYear = new Date().getFullYear(),
  localCoverIds = new Set()
} = {}) {
  const copies = getComicCopies(comic);
  const coverSet = localCoverIds instanceof Set ? localCoverIds : new Set(localCoverIds || []);

  if (smartListId === "unread") return !copies.some((copy) => copy.isRead);
  if (smartListId === "duplicates") return copies.length > 1;
  if (smartListId === "sealed") return copies.some((copy) => copy.isSealed);
  if (smartListId === "needs-care") return copies.some((copy) => getConditionRank(copy.condition) >= getConditionRank("3"));
  if (smartListId === "metadata") {
    return !String(comic.title || "").trim()
      || !Number.isInteger(comic.publicationYear)
      || !String(comic.duckipediaPageUrl || "").trim();
  }
  if (smartListId === "no-cover") return !coverSet.has(comic.id) && !String(comic.duckipediaCoverUrl || "").trim();
  if (smartListId === "current-year") return Number(comic.publicationYear) === Number(currentYear);
  if (smartListId === "recent") return true;
  return true;
}

export function sortSmartList(comics, smartListId) {
  const source = Array.isArray(comics) ? [...comics] : [];
  if (smartListId === "recent") return source.sort(compareRecent).slice(0, 80);
  return source;
}

export function getSmartListComics(comics, smartListId, options = {}) {
  return sortSmartList(
    (Array.isArray(comics) ? comics : []).filter((comic) => matchesSmartList(comic, smartListId, options)),
    smartListId
  );
}

export function buildSmartListCounts(comics, options = {}) {
  return Object.fromEntries(SMART_LIST_DEFINITIONS.map((definition) => [
    definition.id,
    getSmartListComics(comics, definition.id, options).length
  ]));
}

export function buildSeriesSummaries({ comics = [], missingGroups = [], targets = {}, localCoverIds = new Set() } = {}) {
  const source = Array.isArray(comics) ? comics : [];
  const missingBySeries = new Map((Array.isArray(missingGroups) ? missingGroups : []).map((group) => [
    String(group.series || "").trim(),
    Array.isArray(group.missingBands) ? group.missingBands.filter(Number.isSafeInteger) : []
  ]));
  const coverSet = localCoverIds instanceof Set ? localCoverIds : new Set(localCoverIds || []);
  const map = new Map();

  const ensureEntry = ({ seriesId = "", series = "" }) => {
    const name = String(series || "").trim();
    if (!name) return null;
    const key = String(seriesId || name).trim();
    if (!map.has(key)) {
      map.set(key, {
        seriesId: String(seriesId || ""),
        series: name,
        comics: [],
        missingBands: [],
        explicitTarget: normalizeTarget(targets?.[name]),
        localCoverIds: coverSet
      });
    }
    return map.get(key);
  };

  source.forEach((comic) => {
    const entry = ensureEntry({ seriesId: comic.seriesId, series: comic.series });
    if (entry) entry.comics.push(comic);
  });

  missingBySeries.forEach((missingBands, series) => {
    const entry = [...map.values()].find((item) => item.series === series) || ensureEntry({ series });
    if (entry) entry.missingBands = [...missingBands];
  });

  Object.entries(targets || {}).forEach(([series, rawTarget]) => {
    const explicitTarget = normalizeTarget(rawTarget);
    if (!explicitTarget) return;
    const entry = [...map.values()].find((item) => item.series === series) || ensureEntry({ series });
    if (entry) entry.explicitTarget = explicitTarget;
  });

  return [...map.values()].map(summarizeSeries);
}

export function sortSeriesSummaries(summaries, mode = "completion") {
  return (Array.isArray(summaries) ? [...summaries] : []).sort((first, second) => {
    const firstMain = first.seriesId === "ltb-main" || first.series === "Lustiges Taschenbuch";
    const secondMain = second.seriesId === "ltb-main" || second.series === "Lustiges Taschenbuch";
    if (firstMain !== secondMain) return firstMain ? -1 : 1;

    if (mode === "size") return second.issueCount - first.issueCount || second.copyCount - first.copyCount || compareNames(first.series, second.series);
    if (mode === "recent") return compareDatesDescending(first.updatedAt, second.updatedAt) || compareNames(first.series, second.series);
    if (mode === "name") return compareNames(first.series, second.series);
    if (mode === "almost-complete") {
      const firstRelevant = first.missingCount > 0 && first.missingCount <= 10 ? 0 : 1;
      const secondRelevant = second.missingCount > 0 && second.missingCount <= 10 ? 0 : 1;
      return firstRelevant - secondRelevant
        || first.missingCount - second.missingCount
        || second.completionPercentage - first.completionPercentage
        || compareNames(first.series, second.series);
    }
    return second.completionPercentage - first.completionPercentage
      || second.issueCount - first.issueCount
      || compareNames(first.series, second.series);
  });
}

export function buildShelfSlots(comics, { target = 0, startBand = 1, maximumBand = 0 } = {}) {
  const source = Array.isArray(comics) ? comics : [];
  const numericComics = source.filter((comic) => Number.isSafeInteger(comic.numericBandNumber) && comic.numericBandNumber > 0);
  const nonNumericComics = source.filter((comic) => !Number.isSafeInteger(comic.numericBandNumber) || comic.numericBandNumber <= 0)
    .sort(compareBandLabels);
  const comicByBand = new Map();
  numericComics.forEach((comic) => {
    if (!comicByBand.has(comic.numericBandNumber)) comicByBand.set(comic.numericBandNumber, comic);
  });
  const highestOwned = numericComics.reduce((maximum, comic) => Math.max(maximum, comic.numericBandNumber), 0);
  const requestedMaximum = normalizeTarget(target) || normalizeTarget(maximumBand) || highestOwned;
  const safeMaximum = Math.min(MAX_SHELF_BAND, Math.max(0, requestedMaximum));
  const safeStart = Math.max(1, Math.min(safeMaximum || 1, normalizeTarget(startBand) || 1));
  const slots = [];
  for (let bandNumber = safeStart; bandNumber <= safeMaximum; bandNumber += 1) {
    const comic = comicByBand.get(bandNumber) || null;
    slots.push({ type: comic ? "owned" : "missing", bandNumber, comic });
  }
  return { slots, nonNumericComics, highestOwned, maximumBand: safeMaximum, truncated: requestedMaximum > MAX_SHELF_BAND };
}

export function filterSeriesComics(comics, filter = "all", localCoverIds = new Set()) {
  const source = Array.isArray(comics) ? comics : [];
  const coverSet = localCoverIds instanceof Set ? localCoverIds : new Set(localCoverIds || []);
  if (filter === "unread") return source.filter((comic) => !getComicCopies(comic).some((copy) => copy.isRead));
  if (filter === "sealed") return source.filter((comic) => getComicCopies(comic).some((copy) => copy.isSealed));
  if (filter === "duplicates") return source.filter((comic) => getComicCopies(comic).length > 1);
  if (filter === "needs-care") return source.filter((comic) => getComicCopies(comic).some((copy) => getConditionRank(copy.condition) >= getConditionRank("3")));
  if (filter === "with-cover") return source.filter((comic) => coverSet.has(comic.id) || Boolean(comic.duckipediaCoverUrl));
  if (filter === "without-cover") return source.filter((comic) => !coverSet.has(comic.id) && !comic.duckipediaCoverUrl);
  return [...source];
}

export function sortSeriesComics(comics, mode = "volume-asc") {
  const source = Array.isArray(comics) ? [...comics] : [];
  if (mode === "volume-desc") return source.sort((first, second) => compareBandLabels(second, first));
  if (mode === "title") return source.sort((first, second) => compareNames(first.title || `Band ${first.volumeNumber}`, second.title || `Band ${second.volumeNumber}`));
  if (mode === "recent") return source.sort(compareRecent);
  if (mode === "condition") return source.sort((first, second) => getWorstConditionRank(second) - getWorstConditionRank(first) || compareBandLabels(first, second));
  return source.sort(compareBandLabels);
}

export function summarizeMissingRanges(values) {
  const numbers = [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((first, second) => first - second);
  if (!numbers.length) return "Keine Lücken";
  const ranges = [];
  let start = numbers[0];
  let previous = numbers[0];
  for (let index = 1; index < numbers.length; index += 1) {
    const current = numbers[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(formatRange(start, previous));
    start = current;
    previous = current;
  }
  ranges.push(formatRange(start, previous));
  return ranges.join(", ");
}

function summarizeSeries(entry) {
  const comics = [...entry.comics].sort(compareBandLabels);
  const numericBands = [...new Set(comics.map((comic) => comic.numericBandNumber).filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((first, second) => first - second);
  const highestOwned = numericBands.at(-1) || 0;
  const target = entry.explicitTarget || highestOwned;
  const ownedWithinTarget = target ? numericBands.filter((bandNumber) => bandNumber <= target).length : numericBands.length;
  const missingBands = entry.missingBands.filter((bandNumber) => !target || bandNumber <= target);
  const copies = comics.flatMap((comic) => getComicCopies(comic));
  const goodCopyCount = copies.filter((copy) => getConditionRank(copy.condition) <= getConditionRank("1-2")).length;
  const updatedAt = comics.reduce((latest, comic) => latestDate(latest, comic.updatedAt || comic.createdAt), "");
  const coverCandidates = [...comics]
    .sort((first, second) => {
      const firstCover = Number(entry.localCoverIds.has(first.id) || Boolean(first.duckipediaCoverUrl));
      const secondCover = Number(entry.localCoverIds.has(second.id) || Boolean(second.duckipediaCoverUrl));
      return secondCover - firstCover || compareRecent(first, second);
    })
    .slice(0, 4);

  return {
    seriesId: entry.seriesId,
    series: entry.series,
    comics,
    issueCount: comics.length,
    numericIssueCount: numericBands.length,
    copyCount: copies.length,
    unreadCount: comics.filter((comic) => !getComicCopies(comic).some((copy) => copy.isRead)).length,
    sealedCount: comics.filter((comic) => getComicCopies(comic).some((copy) => copy.isSealed)).length,
    duplicateCount: comics.filter((comic) => getComicCopies(comic).length > 1).length,
    needsCareCount: comics.filter((comic) => getComicCopies(comic).some((copy) => getConditionRank(copy.condition) >= getConditionRank("3"))).length,
    coverCount: comics.filter((comic) => entry.localCoverIds.has(comic.id) || Boolean(comic.duckipediaCoverUrl)).length,
    explicitTarget: entry.explicitTarget,
    target,
    highestOwned,
    ownedWithinTarget,
    missingBands,
    missingCount: missingBands.length,
    completionPercentage: target > 0 ? Math.min(100, (ownedWithinTarget / target) * 100) : 0,
    qualityPercentage: copies.length ? (goodCopyCount / copies.length) * 100 : 0,
    updatedAt,
    coverCandidates,
    missingSummary: summarizeMissingRanges(missingBands)
  };
}

function getWorstConditionRank(comic) {
  return Math.max(...getComicCopies(comic).map((copy) => getConditionRank(copy.condition)), -1);
}

function compareBandLabels(first, second) {
  const firstNumber = Number.isSafeInteger(first.numericBandNumber) ? first.numericBandNumber : Number.POSITIVE_INFINITY;
  const secondNumber = Number.isSafeInteger(second.numericBandNumber) ? second.numericBandNumber : Number.POSITIVE_INFINITY;
  return firstNumber - secondNumber
    || String(first.volumeNumber || "").localeCompare(String(second.volumeNumber || ""), "de", { numeric: true, sensitivity: "base" });
}

function compareRecent(first, second) {
  return compareDatesDescending(first.updatedAt || first.createdAt, second.updatedAt || second.createdAt)
    || compareBandLabels(first, second);
}

function compareDatesDescending(first, second) {
  return (Date.parse(second || "") || 0) - (Date.parse(first || "") || 0);
}

function latestDate(first, second) {
  return compareDatesDescending(first, second) > 0 ? second : first;
}

function compareNames(first, second) {
  return String(first || "").localeCompare(String(second || ""), "de", { sensitivity: "base", numeric: true });
}

function normalizeTarget(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function formatRange(start, end) {
  return start === end ? String(start) : `${start}–${end}`;
}


export function getShelfRanges(maximumBand, pageSize = SHELF_PAGE_SIZE) {
  const maximum = normalizeTarget(maximumBand);
  const size = normalizeTarget(pageSize) || SHELF_PAGE_SIZE;
  if (!maximum) return [];
  const ranges = [];
  for (let start = 1; start <= maximum; start += size) {
    const end = Math.min(maximum, start + size - 1);
    ranges.push({ start, end, label: `${start}–${end}` });
  }
  return ranges;
}

export function applyBulkPatch(comics, issueIds, patch = {}, { now = new Date().toISOString() } = {}) {
  const selected = issueIds instanceof Set ? issueIds : new Set(Array.isArray(issueIds) ? issueIds : []);
  let changed = 0;
  const updatedComics = (Array.isArray(comics) ? comics : []).map((comic) => {
    if (!selected.has(comic.id)) return comic;
    const copies = getComicCopies(comic).map((copy) => ({
      ...copy,
      condition: patch.condition || copy.condition,
      isRead: typeof patch.isRead === "boolean" ? patch.isRead : copy.isRead,
      isSealed: typeof patch.isSealed === "boolean" ? patch.isSealed : copy.isSealed,
      updatedAt: now
    }));
    const primary = copies[0];
    const secondary = copies[1] || null;
    changed += 1;
    return {
      ...comic,
      copies,
      copyCount: copies.length,
      condition: primary?.condition || comic.condition,
      duplicateCondition: secondary?.condition || null,
      isRead: Boolean(primary?.isRead),
      isSealed: Boolean(primary?.isSealed),
      isDuplicate: copies.length > 1,
      updatedAt: now
    };
  });
  return { comics: updatedComics, changed };
}
