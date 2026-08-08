import { APP_CONFIG, getConditionRank } from "./config.js";
import { getComicCopies } from "./archive-model.js";

export const QUALITY_BUCKETS = Object.freeze([
  Object.freeze({ id: "excellent", label: "Zustand 0–1", shortLabel: "0–1", codes: Object.freeze(["0", "0-1", "1"]) }),
  Object.freeze({ id: "good", label: "Zustand 1–2 bis 2", shortLabel: "1–2 / 2", codes: Object.freeze(["1-2", "2"]) }),
  Object.freeze({ id: "used", label: "Zustand 2–3 bis 3", shortLabel: "2–3 / 3", codes: Object.freeze(["2-3", "3"]) }),
  Object.freeze({ id: "weak", label: "Zustand 3–4 bis 5", shortLabel: "3–4 / 5", codes: Object.freeze(["3-4", "4", "5"]) })
]);

const CONDITION_CODES = Object.freeze(APP_CONFIG.conditions.map((entry) => entry.code));

export function buildStatisticsDNA({ comics = [], progressData = [], missingGroups = [] } = {}) {
  const source = Array.isArray(comics) ? comics : [];
  const years = new Map();
  const conditions = new Map(CONDITION_CODES.map((code) => [code, 0]));
  const series = new Map();
  let physicalCopies = 0;
  let readIssues = 0;
  let sealedCopies = 0;
  let conditionRankTotal = 0;
  let rankedCopies = 0;

  source.forEach((comic) => {
    const copies = getComicCopies(comic);
    physicalCopies += copies.length;
    if (copies.some((copy) => copy.isRead)) readIssues += 1;
    sealedCopies += copies.filter((copy) => copy.isSealed).length;

    if (Number.isInteger(comic.publicationYear)) {
      const year = comic.publicationYear;
      const entry = years.get(year) || { year, issues: 0, copies: 0 };
      entry.issues += 1;
      entry.copies += copies.length;
      years.set(year, entry);
    }

    const seriesName = String(comic.series || "Unbekannte Reihe").trim() || "Unbekannte Reihe";
    const seriesEntry = series.get(seriesName) || {
      series: seriesName,
      issues: 0,
      copies: 0,
      readIssues: 0,
      unreadIssues: 0,
      sealedCopies: 0,
      duplicateIssues: 0,
      qualityGood: 0,
      qualityWeak: 0,
      conditionCounts: Object.fromEntries(CONDITION_CODES.map((code) => [code, 0]))
    };
    seriesEntry.issues += 1;
    seriesEntry.copies += copies.length;
    seriesEntry.readIssues += copies.some((copy) => copy.isRead) ? 1 : 0;
    seriesEntry.unreadIssues += copies.some((copy) => copy.isRead) ? 0 : 1;
    seriesEntry.sealedCopies += copies.filter((copy) => copy.isSealed).length;
    seriesEntry.duplicateIssues += copies.length > 1 ? 1 : 0;

    copies.forEach((copy) => {
      const code = String(copy.condition || "");
      if (Object.prototype.hasOwnProperty.call(seriesEntry.conditionCounts, code)) {
        seriesEntry.conditionCounts[code] += 1;
      }
      conditions.set(code, (conditions.get(code) || 0) + 1);
      const rank = getConditionRank(code);
      if (Number.isFinite(rank) && rank < APP_CONFIG.conditions.length) {
        conditionRankTotal += rank;
        rankedCopies += 1;
      }
      if (rank <= getConditionRank("1-2")) seriesEntry.qualityGood += 1;
      if (rank >= getConditionRank("3")) seriesEntry.qualityWeak += 1;
    });
    series.set(seriesName, seriesEntry);
  });

  const yearData = [...years.values()].sort((a, b) => b.copies - a.copies || b.year - a.year);
  const seriesData = [...series.values()].map((entry) => ({
    ...entry,
    qualityRate: entry.copies ? (entry.qualityGood / entry.copies) * 100 : 0,
    weakRate: entry.copies ? (entry.qualityWeak / entry.copies) * 100 : 0,
    duplicateRate: entry.issues ? (entry.duplicateIssues / entry.issues) * 100 : 0,
    qualityBuckets: Object.fromEntries(QUALITY_BUCKETS.map((bucket) => [
      bucket.id,
      bucket.codes.reduce((sum, code) => sum + (entry.conditionCounts[code] || 0), 0)
    ]))
  }));

  const progress = Array.isArray(progressData) ? progressData : [];
  const nearComplete = progress
    .filter((entry) => entry.target > 0 && entry.missing > 0 && entry.missing <= 5)
    .sort((a, b) => a.missing - b.missing || b.percentage - a.percentage || a.series.localeCompare(b.series, "de"));

  const largestGap = findLargestMissingRun(missingGroups);
  const strongestYear = yearData[0] || null;
  const biggestSeries = [...seriesData].sort((a, b) => b.copies - a.copies || a.series.localeCompare(b.series, "de"))[0] || null;
  const bestQualitySeries = [...seriesData]
    .filter((entry) => entry.copies > 0)
    .sort((a, b) => b.qualityRate - a.qualityRate || b.copies - a.copies || a.series.localeCompare(b.series, "de"))[0] || null;
  const averageCondition = rankedCopies ? nearestCondition(conditionRankTotal / rankedCopies) : null;
  const duplicateIssues = source.filter((comic) => getComicCopies(comic).length > 1).length;

  return {
    uniqueIssues: source.length,
    physicalCopies,
    readIssues,
    unreadIssues: Math.max(0, source.length - readIssues),
    sealedCopies,
    duplicateIssues,
    extraCopies: Math.max(0, physicalCopies - source.length),
    averageCondition,
    conditionCounts: Object.fromEntries(conditions),
    years: yearData,
    series: seriesData,
    nearComplete,
    largestGap,
    strongestYear,
    biggestSeries,
    bestQualitySeries,
    completedSeries: progress.filter((entry) => entry.percentage >= 100).length,
    progressSeriesCount: progress.length
  };
}

export function getQualityBucketForCondition(code) {
  return QUALITY_BUCKETS.find((bucket) => bucket.codes.includes(String(code || ""))) || QUALITY_BUCKETS[QUALITY_BUCKETS.length - 1];
}

export function findLargestMissingRun(missingGroups = []) {
  let best = null;
  (Array.isArray(missingGroups) ? missingGroups : []).forEach((group) => {
    const values = [...new Set((group?.missingBands || []).filter((value) => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b);
    if (!values.length) return;
    let start = values[0];
    let previous = values[0];
    const commit = (end) => {
      const length = end - start + 1;
      if (!best || length > best.length || (length === best.length && String(group.series).localeCompare(best.series, "de") < 0)) {
        best = { series: String(group.series || ""), start, end, length };
      }
    };
    values.slice(1).forEach((value) => {
      if (value === previous + 1) {
        previous = value;
        return;
      }
      commit(previous);
      start = value;
      previous = value;
    });
    commit(previous);
  });
  return best;
}

export function formatMissingRun(run) {
  if (!run) return "Keine Lücke";
  return run.start === run.end ? `Band ${run.start}` : `Band ${run.start}–${run.end}`;
}

function nearestCondition(rank) {
  const rounded = Math.max(0, Math.min(APP_CONFIG.conditions.length - 1, Math.round(rank)));
  return APP_CONFIG.conditions[rounded] || null;
}
