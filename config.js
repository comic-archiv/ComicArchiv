export const APP_CONFIG = Object.freeze({
  appVersion: "3.0.1",
  dataFormatVersion: 3,
  minimumSupportedBackupVersion: 1,
  storageName: "ComicArchiv",
  displayName: "Sammlerhausen",
  publicationYearMaximum: 2035,
  duckipediaSearchBase: "https://www.duckipedia.de/index.php?title=Spezial%3ASuche&fulltext=1&search=",
  series: Object.freeze([
    "Lustiges Taschenbuch",
    "LTB Spezial",
    "LTB Premium",
    "LTB Enten-Edition",
    "LTB Maus-Edition",
    "LTB Ultimate Phantomias",
    "LTB Collection",
    "LTB Fantasy",
    "LTB Crime",
    "LTB Royal",
    "LTB History",
    "LTB Weihnachten",
    "LTB Ostern",
    "LTB Halloween",
    "LTB Sommer",
    "LTB Abenteuer",
    "LTB Young Comics",
    "Sonstige"
  ]),
  conditions: Object.freeze([
    { code: "N", label: "Neu" },
    { code: "NM", label: "Near Mint" },
    { code: "VF", label: "Very Fine" },
    { code: "FN", label: "Fine" },
    { code: "VG", label: "Very Good" },
    { code: "GD", label: "Good" },
    { code: "FR", label: "Fair" },
    { code: "PR", label: "Poor" }
  ]),
  knownHighestBandBySeries: Object.freeze({})
});

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "dark",
  lastBackupAt: null,
  customSeries: Object.freeze([]),
  knownHighestBandBySeries: Object.freeze({}),
  missingBandDetails: Object.freeze({})
});

export function getConditionLabel(code) {
  const condition = APP_CONFIG.conditions.find((entry) => entry.code === code);
  return condition ? `${condition.label} – ${condition.code}` : code;
}

export function getConditionRank(code) {
  const index = APP_CONFIG.conditions.findIndex((entry) => entry.code === code);
  return index === -1 ? APP_CONFIG.conditions.length : index;
}

export function getAvailableSeries(settings = DEFAULT_SETTINGS, comics = []) {
  const customSeries = Array.isArray(settings.customSeries)
    ? settings.customSeries.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  const usedSeries = Array.isArray(comics)
    ? comics
        .map((comic) => comic?.series)
        .filter((entry) => typeof entry === "string" && entry.trim())
    : [];

  return [...new Set([
    ...APP_CONFIG.series,
    ...customSeries.map((entry) => entry.trim()),
    ...usedSeries.map((entry) => entry.trim())
  ])];
}

export function createDuckipediaSearchUrl(series, volumeNumber, title = "") {
  const searchTerm = [series, `Band ${volumeNumber}`, title].filter(Boolean).join(" ");
  return `${APP_CONFIG.duckipediaSearchBase}${encodeURIComponent(searchTerm)}`;
}

export function createMissingDetailKey(series, bandNumber) {
  return `${encodeURIComponent(String(series).trim())}::${Number(bandNumber)}`;
}
