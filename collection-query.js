import { getConditionRank } from "./config.js";
import { getComicCopies } from "./archive-model.js";
import { matchesSmartList, sortSmartList } from "./shelf.js";
import { compareBandNumbers, compareOptionalText, compareSeries, compareSeriesAndBand, normalizeSearchText } from "./app-utils.js";

export function getScopedCollectionEntries(entries = [], scope = "main") {
  const source = Array.isArray(entries) ? entries : [];
  const mainSeries = "Lustiges Taschenbuch";
  if (scope === "all") return [...source];
  return scope === "other"
    ? source.filter((entry) => entry.series !== mainSeries)
    : source.filter((entry) => entry.series === mainSeries);
}

export function filterAndSortCollectionEntries(entries = [], {
  scope = "main",
  preset = {},
  localCoverIds = new Set(),
  filters = {},
  sortBy = "series"
} = {}) {
  const searchTerm = normalizeSearchText(filters.search);
  const selectedSeries = filters.series || "all";
  const selectedCondition = filters.condition || "all";
  const readFilter = filters.read || "all";
  const onlySealed = filters.sealed === true;
  const onlyDuplicate = filters.duplicate === true;
  const source = getScopedCollectionEntries(entries, scope);

  const filtered = source.filter((entry) => {
    if (preset.smartList && !matchesSmartList(entry, preset.smartList, { localCoverIds })) return false;
    if (preset.publicationYear && Number(entry.publicationYear) !== Number(preset.publicationYear)) return false;
    if (preset.series && entry.series !== preset.series) return false;
    const copies = getComicCopies(entry);
    if (Array.isArray(preset.conditionCodes) && preset.conditionCodes.length) {
      const allowed = new Set(preset.conditionCodes);
      if (!copies.some((copy) => allowed.has(copy.condition))) return false;
    }
    if (selectedSeries !== "all" && entry.series !== selectedSeries) return false;
    if (selectedCondition !== "all" && !copies.some((copy) => copy.condition === selectedCondition)) return false;
    if (readFilter === "read" && !copies.some((copy) => copy.isRead)) return false;
    if (readFilter === "unread" && copies.some((copy) => copy.isRead)) return false;
    if (onlySealed && !copies.some((copy) => copy.isSealed)) return false;
    if (onlyDuplicate && copies.length < 2) return false;
    if (searchTerm) {
      const searchable = normalizeSearchText([
        entry.title, entry.series, entry.volumeNumber, entry.publicationYear, entry.notes,
        ...copies.map((copy) => copy.notes)
      ].join(" "));
      if (!searchable.includes(searchTerm)) return false;
    }
    return true;
  });

  const comparator = createCollectionSortComparator(sortBy);
  if (preset.smartList) return sortSmartList(filtered, preset.smartList).sort(comparator);
  return filtered.sort(comparator);
}

export function createCollectionSortComparator(sortBy) {
  if (sortBy === "volume") return (first, second) => compareBandNumbers(first, second) || compareSeries(first, second);
  if (sortBy === "title") return (first, second) => compareOptionalText(first.title, second.title) || compareSeriesAndBand(first, second);
  if (sortBy === "condition") {
    return (first, second) => {
      const firstWorst = Math.max(...getComicCopies(first).map((copy) => getConditionRank(copy.condition)), 0);
      const secondWorst = Math.max(...getComicCopies(second).map((copy) => getConditionRank(copy.condition)), 0);
      return firstWorst - secondWorst || compareSeriesAndBand(first, second);
    };
  }
  if (sortBy === "recent") {
    return (first, second) => ((Date.parse(second.updatedAt || second.createdAt || "") || 0)
      - (Date.parse(first.updatedAt || first.createdAt || "") || 0)) || compareSeriesAndBand(first, second);
  }
  return compareSeriesAndBand;
}
