export const APP_CONFIG = Object.freeze({
  appVersion: "3.6.1",
  dataFormatVersion: 7,
  minimumSupportedBackupVersion: 1,
  storageName: "ComicArchiv",
  displayName: "Entenarchiv",
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
    "LTB präsentiert",
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

export const STANDARD_DUCKIPEDIA_PATTERNS = Object.freeze({
  "Lustiges Taschenbuch": "LTB_{band}",
  "LTB Spezial": "LTB_Spezial_{band}",
  "LTB Premium": "LTB_Premium_{band}",
  "LTB Enten-Edition": "LTB_Enten-Edition_{band}",
  "LTB Maus-Edition": "LTB_Maus-Edition_{band}",
  "LTB Ultimate Phantomias": "LTB_Ultimate_{band}",
  "LTB Collection": "LTB_Collection_{band}",
  "LTB Fantasy": "LTB_Fantasy_{band}",
  "LTB Crime": "LTB_Crime_{band}",
  "LTB Royal": "LTB_Royal_{band}",
  "LTB History": "LTB_History_{band}",
  "LTB Weihnachten": "LTB_Weihnachten_{band}",
  "LTB Ostern": "LTB_Ostern_{band}",
  "LTB Halloween": "LTB_Halloween_{band}",
  "LTB Sommer": "LTB_Sommer_{band}",
  "LTB Abenteuer": "LTB_Abenteuer_{band}",
  "LTB Young Comics": "LTB_Young_Comics_{band}",
  "LTB Galaxy": "LTB_Galaxy_{band}",
  "LTB Weltreise": "LTB_Weltreise_{band}",
  "LTB Fantasy Entenhausen": "LTB_Fantasy_Entenhausen_{band}",
  "LTB Space": "LTB_Space_{band}",
  "LTB Phantomias Collection": "LTB_Phantomias_Collection_{band}",
  "LTB Europareise": "LTB_Europareise_{band}",
  "LTB Mystery": "LTB_Mystery_{band}",
  "LTB Extra": "LTB_Extra_{band}",
  "LTB Sommerspiele": "LTB_Sommerspiele_{band}",
  "LTB präsentiert": "LTB_präsentiert_{band}",
  "Lustiges Taschenbuch präsentiert": "LTB_präsentiert_{band}"
});

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "dark",
  lastBackupAt: null,
  lastMediaBackupAt: null,
  customSeries: Object.freeze([]),
  customSeriesConfigs: Object.freeze([]),
  knownHighestBandBySeries: Object.freeze({}),
  missingBandDetails: Object.freeze({}),
  fleaMarketSession: Object.freeze({ items: Object.freeze({}), updatedAt: null }),
  changesSinceBackup: 0,
  mediaChangesSinceBackup: 0,
  lastBackupComicCount: 0,
  showCovers: true,
  duckipediaAutoEnrich: true,
  calendarEvents: Object.freeze([]),
  calendarSourceUrl: "https://www.lustiges-taschenbuch.de/sites/default/files/2025-11/ltb_evt_2026v2.ics",
  calendarSourceName: "LTB Jahresplan",
  calendarLastImportAt: null,
  calendarImportedSources: Object.freeze({}),
  calendarCatalogLastCheckAt: null,
  calendarAutoSync: true,
  calendarSelectedYear: new Date().getFullYear(),
  calendarSelectedMonth: new Date().getMonth(),
  calendarReminderTime: "09:00"
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
  const configuredSeries = Array.isArray(settings.customSeriesConfigs)
    ? settings.customSeriesConfigs
        .map((entry) => entry?.name)
        .filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  const usedSeries = Array.isArray(comics)
    ? comics
        .map((comic) => comic?.series)
        .filter((entry) => typeof entry === "string" && entry.trim())
    : [];

  return [...new Set([
    ...APP_CONFIG.series,
    ...customSeries.map((entry) => entry.trim()),
    ...configuredSeries.map((entry) => entry.trim()),
    ...usedSeries.map((entry) => entry.trim())
  ])];
}

export function getCustomSeriesConfig(series, settings = DEFAULT_SETTINGS) {
  const normalizedSeries = String(series || "").trim();
  if (!normalizedSeries || !Array.isArray(settings.customSeriesConfigs)) return null;
  return settings.customSeriesConfigs.find(
    (entry) => entry?.name?.localeCompare(normalizedSeries, "de", { sensitivity: "base" }) === 0
  ) || null;
}

export function getDuckipediaPattern(series, settings = DEFAULT_SETTINGS) {
  const normalizedSeries = String(series || "").trim().normalize("NFC");
  const customConfig = getCustomSeriesConfig(normalizedSeries, settings);
  if (customConfig?.duckipediaPattern) return customConfig.duckipediaPattern;
  return STANDARD_DUCKIPEDIA_PATTERNS[normalizedSeries] || "";
}

export function normalizeDuckipediaPattern(value) {
  let pattern = String(value || "").trim();
  if (!pattern) return "";

  try {
    const url = new URL(pattern);
    if (url.hostname !== "de.duckipedia.org") return "";
    pattern = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch (error) {
    // Ein relativer Duckipedia-Pfad ist ausdrücklich erlaubt.
  }

  pattern = pattern
    .replace(/^\/+/, "")
    .replace(/\s+/g, "_")
    .slice(0, 200);

  if (!pattern.includes("{band}")) {
    pattern = pattern.replace(/_+$/, "");
    if (pattern) pattern = `${pattern}_{band}`;
  }

  return pattern;
}

function createDuckipediaFallbackSearchUrl(series, volumeNumber, title = "") {
  const searchTerm = [series, `Band ${volumeNumber}`, title].filter(Boolean).join(" ");
  return `${APP_CONFIG.duckipediaSearchBase}${encodeURIComponent(searchTerm)}`;
}

export function createDuckipediaUrl(series, volumeNumber, title = "", settings = DEFAULT_SETTINGS) {
  const normalizedSeries = String(series || "").trim().normalize("NFC");
  const normalizedBand = String(volumeNumber || "").trim();

  if (!/^[1-9]\d*$/.test(normalizedBand)) {
    return createDuckipediaFallbackSearchUrl(normalizedSeries, normalizedBand, title);
  }

  let pattern = getDuckipediaPattern(normalizedSeries, settings);

  if (!pattern && normalizedSeries.startsWith("LTB ")) {
    pattern = `${normalizedSeries
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}_+\-]/gu, "")}_{band}`;
  }

  if (!pattern) {
    return createDuckipediaFallbackSearchUrl(normalizedSeries, normalizedBand, title);
  }

  const pageName = pattern.replaceAll("{band}", normalizedBand);
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
