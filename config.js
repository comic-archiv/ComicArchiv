export const APP_CONFIG = Object.freeze({
  appVersion: "3.3.0",
  dataFormatVersion: 4,
  minimumSupportedBackupVersion: 1,
  storageName: "ComicArchiv",
  displayName: "Sammlerhausen",
  publicationYearMaximum: 2035,
  metadataCacheMaximumAgeDays: 90,
  duckipediaBase: "https://de.duckipedia.org/",
  duckipediaSearchBase: "https://de.duckipedia.org/index.php?title=Spezial%3ASuche&fulltext=1&search=",
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
    "LTB Galaxy",
    "LTB Weltreise",
    "LTB Fantasy Entenhausen",
    "LTB Space",
    "LTB Phantomias Collection",
    "LTB Europareise",
    "LTB Mystery",
    "LTB Extra",
    "LTB Sommerspiele",
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
  lastMediaBackupAt: null,
  customSeries: Object.freeze([]),
  knownHighestBandBySeries: Object.freeze({}),
  missingBandDetails: Object.freeze({}),
  changesSinceBackup: 0,
  mediaChangesSinceBackup: 0,
  lastBackupComicCount: 0,
  showCovers: true,
  duckipediaAutoEnrich: true
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

const DUCKIPEDIA_SERIES_SLUGS = Object.freeze({
  "Lustiges Taschenbuch": "LTB",
  "LTB Spezial": "LTB_Spezial",
  "LTB Premium": "LTB_Premium",
  "LTB Enten-Edition": "LTB_Enten-Edition",
  "LTB Maus-Edition": "LTB_Maus-Edition",
  "LTB Ultimate Phantomias": "LTB_Ultimate",
  "LTB Collection": "LTB_Collection",
  "LTB Fantasy": "LTB_Fantasy",
  "LTB Crime": "LTB_Crime",
  "LTB Royal": "LTB_Royal",
  "LTB History": "LTB_History",
  "LTB Weihnachten": "LTB_Weihnachten",
  "LTB Ostern": "LTB_Ostern",
  "LTB Halloween": "LTB_Halloween",
  "LTB Sommer": "LTB_Sommer",
  "LTB Abenteuer": "LTB_Abenteuer",
  "LTB Young Comics": "LTB_Young_Comics",
  "LTB Galaxy": "LTB_Galaxy",
  "LTB Weltreise": "LTB_Weltreise",
  "LTB Fantasy Entenhausen": "LTB_Fantasy_Entenhausen",
  "LTB Space": "LTB_Space",
  "LTB Phantomias Collection": "LTB_Phantomias_Collection",
  "LTB Europareise": "LTB_Europareise",
  "LTB Mystery": "LTB_Mystery",
  "LTB Extra": "LTB_Extra",
  "LTB Sommerspiele": "LTB_Sommerspiele"
});

function createDuckipediaFallbackSearchUrl(series, volumeNumber, title = "") {
  const searchTerm = [series, `Band ${volumeNumber}`, title].filter(Boolean).join(" ");
  return `${APP_CONFIG.duckipediaSearchBase}${encodeURIComponent(searchTerm)}`;
}

export function createDuckipediaUrl(series, volumeNumber, title = "") {
  const normalizedSeries = String(series || "").trim();
  const normalizedBand = String(volumeNumber || "").trim();

  if (!/^[1-9]\d*$/.test(normalizedBand)) {
    return createDuckipediaFallbackSearchUrl(normalizedSeries, normalizedBand, title);
  }

  let seriesSlug = DUCKIPEDIA_SERIES_SLUGS[normalizedSeries];

  if (!seriesSlug && normalizedSeries.startsWith("LTB ")) {
    seriesSlug = normalizedSeries
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_+\-]/g, "");
  }

  if (!seriesSlug) {
    return createDuckipediaFallbackSearchUrl(normalizedSeries, normalizedBand, title);
  }

  const pageName = `${seriesSlug}_${normalizedBand}`;
  return `${APP_CONFIG.duckipediaBase}${encodeURIComponent(pageName).replace(/%2F/gi, "/")}`;
}

export const createDuckipediaSearchUrl = createDuckipediaUrl;

export function createMissingDetailKey(series, bandNumber) {
  return `${encodeURIComponent(String(series).trim())}::${Number(bandNumber)}`;
}

export function createMetadataCacheKey(series, bandNumber) {
  const numericBand = Number(bandNumber);
  return `${encodeURIComponent(String(series || "").trim())}::${Number.isSafeInteger(numericBand) ? numericBand : String(bandNumber || "").trim()}`;
}
