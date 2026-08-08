const RELEASE_DECISIONS = new Set(["watch", "ordered", "ignored"]);
const MAX_KNOWN_SIGNATURES = 3000;

export const RELEASE_RADAR_FILTERS = Object.freeze(["open", "new", "watch", "ordered", "ignored", "all"]);

export function normalizeReleaseDecisionMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};

  Object.entries(value).forEach(([key, entry]) => {
    if (typeof key !== "string" || !key.trim() || !entry || typeof entry !== "object" || Array.isArray(entry)) return;
    if (!RELEASE_DECISIONS.has(entry.status)) return;
    result[key.trim().slice(0, 240)] = {
      status: entry.status,
      updatedAt: normalizeDateTime(entry.updatedAt) || new Date(0).toISOString()
    };
  });

  return result;
}

export function normalizeKnownReleaseSignatures(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim().slice(0, 500)))]
    .slice(-MAX_KNOWN_SIGNATURES);
}

export function normalizeReleaseSeriesAliases(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([seriesId, aliases]) => {
    const normalizedId = String(seriesId || "").trim().slice(0, 120);
    if (!normalizedId || !Array.isArray(aliases)) return;
    const cleaned = [...new Set(aliases
      .filter((alias) => typeof alias === "string" && alias.trim())
      .map((alias) => alias.trim().slice(0, 160)))];
    if (cleaned.length) result[normalizedId] = cleaned.slice(0, 40);
  });
  return result;
}

export function normalizeReleaseEventLinks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([signature, entry]) => {
    if (typeof signature !== "string" || !signature.trim() || !entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const seriesId = String(entry.seriesId || "").trim().slice(0, 120);
    const bandNumber = Number(entry.bandNumber);
    if (!seriesId || !Number.isSafeInteger(bandNumber) || bandNumber < 1 || bandNumber > 99999) return;
    result[signature.trim().slice(0, 500)] = {
      seriesId,
      bandNumber,
      updatedAt: normalizeDateTime(entry.updatedAt) || new Date(0).toISOString()
    };
  });
  return result;
}

export function suggestReleaseSeriesDetails(event) {
  const title = String(event?.title || "").replace(/\s+/g, " ").trim();
  if (!title) return { seriesName: "", alias: "", bandNumber: null };
  const match = title.match(/^(.+?)\s+(?:Band\s*)?(\d{1,5})(?=\s*(?:$|[:|–—-]))/i)
    || title.match(/^(.+)\s+(?:Band\s*)?(\d{1,5})\s*$/i);
  if (!match) return { seriesName: title.slice(0, 100), alias: title.slice(0, 160), bandNumber: null };
  const alias = match[1].trim().replace(/[,:;|–—-]+$/, "").trim();
  const bandNumber = Number(match[2]);
  return {
    seriesName: alias.slice(0, 100),
    alias: alias.slice(0, 160),
    bandNumber: Number.isSafeInteger(bandNumber) && bandNumber >= 1 ? bandNumber : null
  };
}

export function normalizeReleaseSeriesCatalog(entries = []) {
  const catalog = [];
  const seen = new Set();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = String(entry.id || entry.seriesId || "").trim().slice(0, 120);
    const name = String(entry.name || entry.series || "").trim().slice(0, 160);
    if (!id || !name || seen.has(id)) return;

    seen.add(id);
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias) => typeof alias === "string" && alias.trim()).map((alias) => alias.trim().slice(0, 160))
      : [];
    catalog.push({ id, name, aliases: [...new Set([name, ...aliases])] });
  });

  return catalog;
}

export function createReleaseEventSignature(event) {
  if (!event || typeof event !== "object") return "";
  const source = String(event.sourceId || event.sourceName || event.source || "publisher").trim();
  const uid = String(event.uid || "").trim();
  const date = String(event.startDate || "").trim();
  const title = normalizeReleaseText(event.title);
  return uid
    ? `${source}|uid:${uid}`.slice(0, 500)
    : `${source}|${date}|${title}`.slice(0, 500);
}

export function resolveReleaseIdentity(event, seriesCatalog = [], eventLinks = {}) {
  if (!event || event.source !== "publisher" || event.category !== "release") return null;
  const title = String(event.title || "").trim();
  const normalizedTitle = normalizeReleaseText(title);
  if (!normalizedTitle) return null;

  const catalog = normalizeReleaseSeriesCatalog(seriesCatalog);
  const signature = createReleaseEventSignature(event);
  const manualLink = normalizeReleaseEventLinks(eventLinks)[signature];
  if (manualLink) {
    const series = catalog.find((entry) => entry.id === manualLink.seriesId);
    if (series) {
      return {
        seriesId: series.id,
        series: series.name,
        bandNumber: manualLink.bandNumber,
        key: `${series.id}:${manualLink.bandNumber}`,
        matchedAlias: "Manuelle Zuordnung",
        title,
        manualLink: true
      };
    }
  }
  const aliases = catalog
    .flatMap((series) => series.aliases.map((alias) => ({
      series,
      rawAlias: alias,
      normalizedAlias: normalizeReleaseText(alias)
    })))
    .filter((entry) => entry.normalizedAlias)
    .sort((first, second) => second.normalizedAlias.length - first.normalizedAlias.length);

  for (const entry of aliases) {
    if (normalizedTitle !== entry.normalizedAlias && !normalizedTitle.startsWith(`${entry.normalizedAlias} `)) continue;
    const remainder = normalizedTitle.slice(entry.normalizedAlias.length).trim();
    const bandMatch = remainder.match(/^(?:band\s*)?(\d{1,5})(?:\b|\s|$)/);
    if (!bandMatch) continue;
    const bandNumber = Number(bandMatch[1]);
    if (!Number.isSafeInteger(bandNumber) || bandNumber < 1 || bandNumber > 99999) continue;
    return {
      seriesId: entry.series.id,
      series: entry.series.name,
      bandNumber,
      key: `${entry.series.id}:${bandNumber}`,
      matchedAlias: entry.rawAlias,
      title
    };
  }

  const fallback = normalizedTitle.match(/^ltb\s+(?:band\s*)?(\d{1,5})(?:\b|\s|$)/);
  if (fallback) {
    const main = catalog.find((series) => series.id === "ltb-main");
    const bandNumber = Number(fallback[1]);
    if (main && Number.isSafeInteger(bandNumber) && bandNumber >= 1) {
      return {
        seriesId: main.id,
        series: main.name,
        bandNumber,
        key: `${main.id}:${bandNumber}`,
        matchedAlias: "LTB",
        title
      };
    }
  }

  return null;
}

export function getReleaseCollectionState(identity, comics = [], missingGroups = []) {
  if (!identity) return { type: "unlinked", label: "Nicht zugeordnet" };

  const owned = (Array.isArray(comics) ? comics : []).some((comic) => {
    const sameSeries = comic?.seriesId
      ? comic.seriesId === identity.seriesId
      : normalizeReleaseText(comic?.series) === normalizeReleaseText(identity.series);
    return sameSeries && Number(comic?.numericBandNumber) === identity.bandNumber;
  });
  if (owned) return { type: "owned", label: "Im Besitz" };

  const missing = (Array.isArray(missingGroups) ? missingGroups : []).some((group) => {
    const sameSeries = group?.seriesId
      ? group.seriesId === identity.seriesId
      : normalizeReleaseText(group?.series) === normalizeReleaseText(identity.series);
    return sameSeries && Array.isArray(group?.missingBands) && group.missingBands.includes(identity.bandNumber);
  });
  if (missing) return { type: "missing", label: "Fehlt" };

  return { type: "unplanned", label: "Nicht vorgemerkt" };
}

export function buildReleaseRadarItems(events, {
  seriesCatalog = [],
  comics = [],
  missingGroups = [],
  decisions = {},
  knownSignatures = [],
  eventLinks = {},
  today = formatToday()
} = {}) {
  const decisionMap = normalizeReleaseDecisionMap(decisions);
  const known = new Set(normalizeKnownReleaseSignatures(knownSignatures));
  const seenKeys = new Set();
  const items = [];

  (Array.isArray(events) ? events : []).forEach((event) => {
    if (event?.source !== "publisher" || event?.category !== "release") return;
    const signature = createReleaseEventSignature(event);
    if (!signature) return;

    const identity = resolveReleaseIdentity(event, seriesCatalog, eventLinks);
    const key = identity?.key || `event:${signature}`;
    const dedupeKey = identity ? `${identity.key}|${event.startDate}` : signature;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    const collection = getReleaseCollectionState(identity, comics, missingGroups);
    const decision = decisionMap[key] || null;
    const timingCompare = compareDateStrings(event.startDate, today);
    const daysUntil = differenceInDays(today, event.startDate);
    const effectiveStatus = collection.type === "owned"
      ? "owned"
      : decision?.status || (collection.type === "missing" ? "watch" : "open");

    items.push({
      event,
      identity,
      key,
      signature,
      collection,
      decision,
      effectiveStatus,
      timing: timingCompare === 0 ? "today" : timingCompare > 0 ? "upcoming" : "past",
      daysUntil,
      isNew: !known.has(signature)
    });
  });

  return items.sort((first, second) => {
    const firstPast = first.timing === "past" ? 1 : 0;
    const secondPast = second.timing === "past" ? 1 : 0;
    if (firstPast !== secondPast) return firstPast - secondPast;
    const dateCompare = first.event.startDate.localeCompare(second.event.startDate);
    if (dateCompare !== 0) return first.timing === "past" ? -dateCompare : dateCompare;
    const firstSeries = first.identity?.series || first.event.title;
    const secondSeries = second.identity?.series || second.event.title;
    return firstSeries.localeCompare(secondSeries, "de", { numeric: true, sensitivity: "base" });
  });
}

export function filterReleaseRadarItems(items, filter = "open") {
  const normalizedFilter = RELEASE_RADAR_FILTERS.includes(filter) ? filter : "open";
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (normalizedFilter === "all") return true;
    if (normalizedFilter === "new") return item.isNew && !["owned", "ignored"].includes(item.effectiveStatus);
    if (normalizedFilter === "watch") return item.effectiveStatus === "watch";
    if (normalizedFilter === "ordered") return item.effectiveStatus === "ordered";
    if (normalizedFilter === "ignored") return item.effectiveStatus === "ignored";
    return item.timing !== "past" && !["owned", "ignored"].includes(item.effectiveStatus);
  });
}

export function summarizeReleaseRadar(items, today = formatToday()) {
  const safeItems = Array.isArray(items) ? items : [];
  const upcoming = safeItems.filter((item) => item.timing !== "past" && !["owned", "ignored"].includes(item.effectiveStatus));
  return {
    total: safeItems.length,
    upcoming: upcoming.length,
    newCount: safeItems.filter((item) => item.isNew && !["owned", "ignored"].includes(item.effectiveStatus)).length,
    todayCount: safeItems.filter((item) => item.event.startDate === today && !["owned", "ignored"].includes(item.effectiveStatus)).length,
    watchedCount: safeItems.filter((item) => item.effectiveStatus === "watch").length,
    orderedCount: safeItems.filter((item) => item.effectiveStatus === "ordered").length,
    ownedCount: safeItems.filter((item) => item.effectiveStatus === "owned").length,
    next: upcoming[0] || null
  };
}

export function getReleaseRadarBadgeCount(items, today = formatToday()) {
  const releases = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const actionable = !["owned", "ignored"].includes(item.effectiveStatus);
    const shouldBadge = actionable && (
      (item.isNew && item.timing !== "past")
      || item.event.startDate === today
    );
    if (shouldBadge) releases.add(item.identity?.key || item.signature || item.key);
  });
  return Math.min(releases.size, 99);
}

export function mergeKnownReleaseSignatures(previous, events) {
  const merged = [
    ...normalizeKnownReleaseSignatures(previous),
    ...(Array.isArray(events) ? events : []).map((entry) => entry?.signature || createReleaseEventSignature(entry)).filter(Boolean)
  ];
  return normalizeKnownReleaseSignatures(merged.slice(-MAX_KNOWN_SIGNATURES));
}

export function getReleaseTimingLabel(item) {
  if (!item) return "";
  if (item.timing === "today") return "Heute";
  if (item.timing === "past") {
    const days = Math.abs(item.daysUntil);
    return days === 1 ? "Seit gestern erhältlich" : `Seit ${days} Tagen erhältlich`;
  }
  if (item.daysUntil === 1) return "Morgen";
  if (item.daysUntil <= 14) return `In ${item.daysUntil} Tagen`;
  return "Demnächst";
}

export function normalizeReleaseText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/[„“”"'’]/g, "")
    .replace(/[^a-zA-Z0-9+\-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("de");
}

function compareDateStrings(first, second) {
  if (first === second) return 0;
  return first > second ? 1 : -1;
}

function differenceInDays(from, to) {
  const first = parseDateUtc(from);
  const second = parseDateUtc(to);
  if (first === null || second === null) return 0;
  return Math.round((second - first) / 86400000);
}

function parseDateUtc(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? time : null;
}

function formatToday(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDateTime(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  return Number.isFinite(Date.parse(value)) ? value : "";
}
