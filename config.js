export const DEFAULT_CONDITION_CODE = "2";

export const LEGACY_CONDITION_MAP = Object.freeze({
  N: "0-1",
  NM: "1",
  VF: "1-2",
  FN: "2",
  VG: "2-3",
  GD: "3",
  FR: "3-4",
  PR: "4"
});

export const APP_CONFIG = Object.freeze({
  appVersion: "3.8.0",
  dataFormatVersion: 8,
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
    {
      code: "0",
      label: "Perfekt",
      priceRelation: "ca. 150 % von Zustand 1",
      description: "Ein Heft, auf dem praktisch kein Stäubchen lastet. Nur produktionsbedingte Unregelmäßigkeiten wie minimale Bindefehler oder andere minimale Druckmängel, die erst auf den zweiten Blick auffallen, können auftreten. Das Heft sollte ungelesen wirken."
    },
    {
      code: "0-1",
      label: "Fast perfekt",
      priceRelation: "Zwischenstufe zwischen Zustand 0 und 1",
      description: "Ein neuwertiges Heft, dem man erst auf den zweiten Blick ansieht, dass es einmal aufgeblättert wurde. Neben kleinen produktionsbedingten Fehlern dürfen auch minimale Lagerungsspuren wie eine Druckstelle, eine angestoßene Ecke oder die Rundung einer Eckkante auftreten."
    },
    {
      code: "1",
      label: "Sehr gut",
      priceRelation: "Basispreis = 100 %",
      description: "Ein neuwertig wirkendes, nahezu fehlerfreies Heft. Nur der eine oder andere Kleinstfehler, zum Beispiel ein Einriss im Millimeterbereich, ein kleiner Knick oder angelaufene Klammern, ist zulässig. Diese Fehler dürfen nicht auf den ersten Blick auffallen oder den hervorragenden Gesamteindruck stören."
    },
    {
      code: "1-2",
      label: "Fast sehr gut",
      priceRelation: "Zwischenstufe zwischen Zustand 1 und 2",
      description: "Ein sehr gepflegtes Heft, bei dem mehr Kleinstfehler auftreten dürfen als bei Zustand 1. Möglich sind ein kaum störender Schriftzug oder Stempel, ein leichter Wasserschaden oder eine leichte Verschmutzung der Rückseite. Bei einem sonst sehr guten Heft darf auch ein einzelner größerer Mangel wie ein Riss bis etwa 2 cm oder ein kleiner Fettfleck vorkommen. Fehlende Sammelmarken müssen angegeben werden."
    },
    {
      code: "2",
      label: "Gut",
      priceRelation: "ca. 40 % von Zustand 1",
      description: "Ein ordentliches Heft, dessen Gesamteindruck weiterhin ohne Einschränkung als gut bezeichnet werden kann. In tolerierbarer Anzahl und Intensität dürfen Stempel oder Schriftzüge, gelöste Rätsel, Knicke, Risse und Verschmutzungen auftreten. Sammelmarke oder Sammelbild können fehlen."
    },
    {
      code: "2-3",
      label: "Noch recht gut",
      priceRelation: "Zwischenstufe zwischen Zustand 2 und 3",
      description: "Ein insgesamt befriedigend erhaltenes, aber erkennbar gebrauchtes Heft. Häufigkeit oder Intensität der Mängel ist höher als bei Zustand 2. Zusätzlich möglich sind eine stärkere Wulst, ein größerer Wasserschaden, ein Riss bis etwa 5 cm, deutlichere Beschriftungen sowie Stock- und andere Flecken. Professionelle Restaurationen und sparsam verwendeter Tesa-Film müssen angegeben werden. Fehlstellen werden nur im Bereich weniger Millimeter toleriert."
    },
    {
      code: "3",
      label: "Noch sammelwürdig",
      priceRelation: "ca. 20 % von Zustand 1",
      description: "Ein vollständiges, aber oft gelesenes Heft. Zusätzlich möglich sind ordentliche Klebungen, kleinere Fehlstellen ohne Textverlust und starke Falzschäden. Umschlag oder Mittelseite dürfen von den Klammern gelöst sein. Trotz der Mängel muss das Heft noch sammelwürdig und nicht unappetitlich wirken. Gelochte Hefte in sonst gutem Zustand gehören ebenfalls hierher; die Lochung ist anzugeben."
    },
    {
      code: "3-4",
      label: "Schlecht",
      priceRelation: "Zwischenstufe zwischen Zustand 3 und 4",
      description: "Ein überaus stark gebrauchtes Heft mit sehr großer Häufung oder Intensität an Mängeln. Es besitzt noch Lesewert, auch wenn es nicht unbedingt appetitlich wirkt. Fehlstellen dürfen größer sein, den Fortgang der Geschichte aber nicht stören. Häufig sind unsachgemäße Klebungen oder Restaurationen mit Fremdmaterial. Dazu gehören auch gelochte Hefte im durchschnittlichen Zustand sowie beschnittene Hefte aus Sammelbänden."
    },
    {
      code: "4",
      label: "Zum Wegwerfen zu schade",
      priceRelation: "ca. 10 % von Zustand 1",
      description: "Auch in diesem Zustand müssen der Comicteil und die Umschlagseiten vollständig sein; Redaktionsseiten dürfen fehlen. An Mängeln ist nahezu alles erlaubt. Bilder können bemalt sein und auch größere Stücke dürfen fehlen. Comics in diesem Zustand dienen in der Regel nur als Platzhalter."
    },
    {
      code: "5",
      label: "Unvollständiger Comic",
      priceRelation: "Keine reguläre Zustandsbewertung",
      description: "Der Comicteil ist nicht vollständig. Solche Hefte können nicht in das reguläre Zustandssystem einbezogen werden und werden als unvollständiger Comic beziehungsweise Zustand 5 geführt."
    }
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

export function normalizeConditionCode(code, fallback = "") {
  const normalized = String(code ?? "").trim().toUpperCase().replace(/–/g, "-");
  if (!normalized) return fallback;
  if (Object.prototype.hasOwnProperty.call(LEGACY_CONDITION_MAP, normalized)) {
    return LEGACY_CONDITION_MAP[normalized];
  }
  const direct = APP_CONFIG.conditions.find((entry) => entry.code === normalized);
  return direct ? direct.code : fallback;
}

export function getConditionDetails(code) {
  const normalized = normalizeConditionCode(code);
  return APP_CONFIG.conditions.find((entry) => entry.code === normalized) || null;
}

export function getConditionLabel(code) {
  const condition = getConditionDetails(code);
  return condition ? `Zustand ${condition.code} – ${condition.label}` : String(code || "");
}

export function getConditionRank(code) {
  const normalized = normalizeConditionCode(code);
  const index = APP_CONFIG.conditions.findIndex((entry) => entry.code === normalized);
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
