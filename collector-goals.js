import { createMissingDetailKey } from "./config.js";
import { getComicCopies } from "./archive-model.js";

export const WISHLIST_PRIORITIES = Object.freeze([
  Object.freeze({ id: "wanted", label: "Gesucht", shortLabel: "Gesucht", symbol: "!", rank: 0, active: true }),
  Object.freeze({ id: "pickup", label: "Mitnehmen", shortLabel: "Mitnehmen", symbol: "+", rank: 1, active: true }),
  Object.freeze({ id: "someday", label: "Irgendwann", shortLabel: "Irgendwann", symbol: "·", rank: 3, active: true }),
  Object.freeze({ id: "ignore", label: "Ignorieren", shortLabel: "Ignoriert", symbol: "–", rank: 4, active: false })
]);

const PRIORITY_BY_ID = new Map(WISHLIST_PRIORITIES.map((entry) => [entry.id, entry]));

export function normalizeWishlistPriority(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PRIORITY_BY_ID.has(normalized) ? normalized : "";
}

export function getWishlistPriorityDefinition(value) {
  const normalized = normalizeWishlistPriority(value);
  return normalized ? PRIORITY_BY_ID.get(normalized) : null;
}

export function getWishlistPriorityRank(value) {
  return getWishlistPriorityDefinition(value)?.rank ?? 2;
}

export function compareWishlistEntries(first, second) {
  return getWishlistPriorityRank(first?.priority) - getWishlistPriorityRank(second?.priority)
    || mainSeriesRank(first?.series) - mainSeriesRank(second?.series)
    || String(first?.series || "").localeCompare(String(second?.series || ""), "de", { sensitivity: "base" })
    || Number(first?.bandNumber || 0) - Number(second?.bandNumber || 0);
}

export function collectMissingWishlistEntries(missingGroups = [], settings = {}) {
  const details = settings?.missingBandDetails && typeof settings.missingBandDetails === "object"
    ? settings.missingBandDetails
    : {};
  const entries = [];

  (Array.isArray(missingGroups) ? missingGroups : []).forEach((group) => {
    (Array.isArray(group?.missingBands) ? group.missingBands : []).forEach((bandNumber) => {
      const key = createMissingDetailKey(group.series, bandNumber);
      const detail = details[key] || {};
      entries.push({
        key,
        series: String(group.series || ""),
        bandNumber: Number(bandNumber),
        title: String(detail.title || ""),
        priority: normalizeWishlistPriority(detail.priority),
        detail
      });
    });
  });

  return entries.sort(compareWishlistEntries);
}

export function buildCollectorMission({ progressData = [], missingGroups = [], settings = {} } = {}) {
  const progress = Array.isArray(progressData) ? progressData : [];
  const missingEntries = collectMissingWishlistEntries(missingGroups, settings);

  const nearComplete = progress
    .filter((entry) => Number(entry?.configuredTarget) > 0 && entry.missing > 0 && entry.missing <= 3)
    .sort((a, b) => a.missing - b.missing || b.percentage - a.percentage || a.series.localeCompare(b.series, "de"))[0];

  if (nearComplete) {
    return {
      id: `complete:${nearComplete.series}`,
      eyebrow: "Nächstes Sammelziel",
      title: nearComplete.missing === 1 ? `Nur noch 1 Band bis ${nearComplete.series} komplett` : `Nur noch ${nearComplete.missing} Bände bis ${nearComplete.series} komplett`,
      copy: `${nearComplete.presentWithinTarget} von ${nearComplete.target} Zielbänden vorhanden · ${Math.round(nearComplete.percentage)} %`,
      accent: "completion",
      action: { type: "missing-series", series: nearComplete.series }
    };
  }

  const wanted = missingEntries.find((entry) => entry.priority === "wanted");
  if (wanted) {
    return {
      id: `wanted:${wanted.key}`,
      eyebrow: "Ganz oben auf deiner Wunschliste",
      title: `${wanted.series} · Band ${wanted.bandNumber}`,
      copy: wanted.title || "Als „Gesucht“ markiert – beim nächsten Flohmarkt zuerst danach Ausschau halten.",
      accent: "wanted",
      action: { type: "missing-band", series: wanted.series, bandNumber: wanted.bandNumber }
    };
  }

  const main = progress.find((entry) => entry.series === "Lustiges Taschenbuch" && entry.target > 0);
  if (main && main.percentage < 100) {
    const thresholds = [50, 75, 90, 100];
    const nextThreshold = thresholds.find((threshold) => main.percentage < threshold);
    if (nextThreshold) {
      const neededAtThreshold = Math.ceil((main.target * nextThreshold) / 100);
      const bandsNeeded = Math.max(1, neededAtThreshold - main.presentWithinTarget);
      return {
        id: `main:${nextThreshold}`,
        eyebrow: "Hauptreihe im Blick",
        title: `${bandsNeeded} ${bandsNeeded === 1 ? "Band" : "Bände"} bis ${nextThreshold} %`,
        copy: `${main.presentWithinTarget} von ${main.target} Zielbänden der Hauptreihe vorhanden.`,
        accent: "progress",
        action: { type: "missing-series", series: main.series }
      };
    }
  }

  const firstActive = missingEntries.find((entry) => entry.priority !== "ignore");
  if (firstActive) {
    const priority = getWishlistPriorityDefinition(firstActive.priority);
    return {
      id: `next:${firstActive.key}`,
      eyebrow: "Als Nächstes lohnend",
      title: `${firstActive.series} · Band ${firstActive.bandNumber}`,
      copy: priority ? `${priority.label} · ${firstActive.title || "offene Lücke in deiner Sammlung"}` : (firstActive.title || "Offene Lücke in deiner Sammlung"),
      accent: "progress",
      action: { type: "missing-band", series: firstActive.series, bandNumber: firstActive.bandNumber }
    };
  }

  return {
    id: "complete",
    eyebrow: "Sammelziel",
    title: "Aktuell keine offene Mission",
    copy: "Deine aktiven Zielbereiche sind vollständig oder noch nicht festgelegt.",
    accent: "success",
    action: null
  };
}

export function buildMilestones({ comics = [], progressData = [] } = {}) {
  const source = Array.isArray(comics) ? comics : [];
  const progress = Array.isArray(progressData) ? progressData : [];
  const physicalCopies = source.reduce((sum, comic) => sum + getComicCopies(comic).length, 0);
  const milestones = [];

  [100, 250, 500, 750, 1000].forEach((threshold) => {
    if (physicalCopies < threshold) return;
    milestones.push({
      id: `copies:${threshold}`,
      type: "copies",
      value: threshold,
      eyebrow: "Bestandsmarke",
      title: `${threshold}. Exemplar`,
      copy: `Mindestens ${threshold} physische Bücher sind im Entenarchiv erfasst.`,
      weight: threshold
    });
  });

  const main = progress.find((entry) => entry.series === "Lustiges Taschenbuch" && Number(entry.configuredTarget) > 0);
  if (main) {
    [50, 75, 90, 100].forEach((threshold) => {
      if (main.percentage + 0.0001 < threshold) return;
      milestones.push({
        id: `main-progress:${threshold}`,
        type: "progress",
        value: threshold,
        eyebrow: "Hauptreihe",
        title: `${threshold} % erreicht`,
        copy: `${main.presentWithinTarget} von ${main.target} Zielbänden sind vorhanden.`,
        series: main.series,
        weight: 2000 + threshold
      });
    });
  }

  progress
    .filter((entry) => Number(entry.configuredTarget) > 0 && entry.target > 0 && entry.percentage >= 100)
    .forEach((entry) => {
      milestones.push({
        id: `series-complete:${entry.series}`,
        type: "series-complete",
        value: entry.target,
        eyebrow: "Reihe vollständig",
        title: `${entry.series} komplett`,
        copy: `${entry.presentWithinTarget} von ${entry.target} Zielbänden vorhanden.`,
        series: entry.series,
        weight: entry.series === "Lustiges Taschenbuch" ? 4000 : 3000 + Math.min(999, entry.target)
      });
    });

  return milestones.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title, "de"));
}

export function normalizeMilestoneIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim().slice(0, 300)))];
}

function mainSeriesRank(series) {
  return String(series || "") === "Lustiges Taschenbuch" ? 0 : 1;
}
