import { APP_CONFIG, createDuckipediaUrl } from "./config.js";

const DUCKIPEDIA_HOST = "de.duckipedia.org";
const LOOKUP_TIMEOUT_MS = 10000;

export async function lookupDuckipediaMetadata(series, bandNumber, { signal, settings } = {}) {
  const pageUrl = createDuckipediaUrl(series, bandNumber, "", settings);
  const parsedUrl = new URL(pageUrl);

  if (parsedUrl.hostname !== DUCKIPEDIA_HOST || parsedUrl.pathname.startsWith("/index.php")) {
    return createNotFoundResult(pageUrl, "Für diese Reihe ist nur eine Duckipedia-Suche verfügbar.");
  }

  const pageName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    const apiUrl = new URL(`${APP_CONFIG.duckipediaBase}api.php`);
    apiUrl.searchParams.set("action", "query");
    apiUrl.searchParams.set("prop", "revisions|pageimages");
    apiUrl.searchParams.set("titles", pageName);
    apiUrl.searchParams.set("rvprop", "content");
    apiUrl.searchParams.set("rvslots", "main");
    apiUrl.searchParams.set("piprop", "thumbnail|original");
    apiUrl.searchParams.set("pilicense", "any");
    apiUrl.searchParams.set("pithumbsize", "720");
    apiUrl.searchParams.set("format", "json");
    apiUrl.searchParams.set("formatversion", "2");
    apiUrl.searchParams.set("origin", "*");

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Duckipedia antwortet mit HTTP ${response.status}.`);
    }

    const payload = await response.json();

    if (payload?.error) {
      return await lookupViaParseApi(pageName, pageUrl, controller.signal);
    }

    const page = payload?.query?.pages?.[0];

    if (!page || page.missing) {
      return createNotFoundResult(pageUrl, "Die Bandseite wurde nicht gefunden.");
    }

    const revision = page.revisions?.[0];
    const wikitext = revision?.slots?.main?.content
      ?? revision?.slots?.main?.["*"]
      ?? revision?.content
      ?? revision?.["*"]
      ?? "";
    const parsedMetadata = parseDuckipediaWikitext(wikitext);
    let coverUrl = normalizeImageUrl(page.thumbnail?.source || page.original?.source || "");
    if (!coverUrl) coverUrl = await lookupCoverViaImagesApi(pageName, controller.signal);

    return {
      found: true,
      title: parsedMetadata.title,
      publicationYear: parsedMetadata.publicationYear,
      coverUrl,
      pageUrl,
      fetchedAt: new Date().toISOString(),
      reason: ""
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return createNotFoundResult(
        pageUrl,
        signal?.aborted
          ? "Die Online-Abfrage wurde abgebrochen."
          : "Die Duckipedia-Abfrage hat zu lange gedauert."
      );
    }

    console.warn("Duckipedia-Daten konnten nicht geladen werden:", error);
    return createNotFoundResult(
      pageUrl,
      "Titel, Jahr und Cover konnten online nicht ergänzt werden. Der Band bleibt trotzdem nutzbar."
    );
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

async function lookupViaParseApi(pageName, pageUrl, signal) {
  const apiUrl = new URL(`${APP_CONFIG.duckipediaBase}api.php`);
  apiUrl.searchParams.set("action", "parse");
  apiUrl.searchParams.set("page", pageName);
  apiUrl.searchParams.set("prop", "wikitext");
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("origin", "*");

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal
  });

  if (!response.ok) throw new Error(`Duckipedia antwortet mit HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload?.error) return createNotFoundResult(pageUrl, payload.error.info || "Die Bandseite wurde nicht gefunden.");
  const wikitext = payload?.parse?.wikitext?.["*"] || "";
  const parsedMetadata = parseDuckipediaWikitext(wikitext);
  const coverUrl = await lookupCoverViaImagesApi(pageName, signal);
  return {
    found: true,
    ...parsedMetadata,
    coverUrl,
    pageUrl,
    fetchedAt: new Date().toISOString(),
    reason: ""
  };
}

async function lookupCoverViaImagesApi(pageName, signal) {
  try {
    const imagesUrl = new URL(`${APP_CONFIG.duckipediaBase}api.php`);
    imagesUrl.searchParams.set("action", "query");
    imagesUrl.searchParams.set("prop", "images");
    imagesUrl.searchParams.set("titles", pageName);
    imagesUrl.searchParams.set("imlimit", "50");
    imagesUrl.searchParams.set("format", "json");
    imagesUrl.searchParams.set("formatversion", "2");
    imagesUrl.searchParams.set("origin", "*");

    const imagesResponse = await fetch(imagesUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal
    });
    if (!imagesResponse.ok) return "";
    const imagesPayload = await imagesResponse.json();
    const imageTitles = (imagesPayload?.query?.pages?.[0]?.images || [])
      .map((entry) => String(entry?.title || ""))
      .filter(Boolean)
      .sort((first, second) => scoreCoverImageTitle(second, pageName) - scoreCoverImageTitle(first, pageName));

    for (const imageTitle of imageTitles.slice(0, 6)) {
      if (scoreCoverImageTitle(imageTitle, pageName) <= 0) continue;
      const infoUrl = new URL(`${APP_CONFIG.duckipediaBase}api.php`);
      infoUrl.searchParams.set("action", "query");
      infoUrl.searchParams.set("prop", "imageinfo");
      infoUrl.searchParams.set("titles", imageTitle);
      infoUrl.searchParams.set("iiprop", "url");
      infoUrl.searchParams.set("iiurlwidth", "720");
      infoUrl.searchParams.set("format", "json");
      infoUrl.searchParams.set("formatversion", "2");
      infoUrl.searchParams.set("origin", "*");
      const infoResponse = await fetch(infoUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal
      });
      if (!infoResponse.ok) continue;
      const infoPayload = await infoResponse.json();
      const info = infoPayload?.query?.pages?.[0]?.imageinfo?.[0];
      const source = normalizeImageUrl(info?.thumburl || info?.url || "");
      if (source) return source;
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    console.warn("Duckipedia-Cover-Fallback ist fehlgeschlagen:", error);
  }
  return "";
}

function scoreCoverImageTitle(imageTitle, pageName) {
  const title = normalizeLookupText(imageTitle);
  const page = normalizeLookupText(pageName);
  const number = page.match(/\d+/)?.[0] || "";
  let score = 0;
  if (/\.(?:jpe?g|png|webp)$/i.test(title)) score += 10;
  if (title.includes("cover")) score += 70;
  if (title.includes("ltb")) score += 55;
  if (number && new RegExp(`(^|[^0-9])0*${escapeRegExp(number)}([^0-9]|$)`).test(title)) score += 100;
  if (page && title.includes(page.replace(/_/g, " "))) score += 80;
  if (/logo|icon|button|pfeil|arrow|flagge|symbol|comicforum|inducks/.test(title)) score -= 180;
  if (/variant|vorschau|seite/.test(title)) score -= 35;
  return score;
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^datei:|^file:/i, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

export function parseDuckipediaWikitext(wikitext) {
  const source = String(wikitext || "");
  const title = cleanWikiValue(findTemplateValue(source, [
    "LTBTITEL",
    "TITEL",
    "BANDTITEL",
    "NAME"
  ]));
  const dateValue = findTemplateValue(source, [
    "EDATUM",
    "ERSCH",
    "ERSCHEINUNGSDATUM",
    "DATUM"
  ]);
  const yearMatch = String(dateValue || "").match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  const publicationYear = yearMatch ? Number(yearMatch[1]) : null;

  return {
    title,
    publicationYear: publicationYear && publicationYear <= APP_CONFIG.publicationYearMaximum
      ? publicationYear
      : null
  };
}

function createNotFoundResult(pageUrl, reason) {
  return {
    found: false,
    title: "",
    publicationYear: null,
    coverUrl: "",
    pageUrl,
    fetchedAt: new Date().toISOString(),
    reason
  };
}

function findTemplateValue(source, fieldNames) {
  for (const fieldName of fieldNames) {
    const expression = new RegExp(`\\|\\s*${escapeRegExp(fieldName)}\\s*=\\s*([\\s\\S]*?)(?=\\n?\\s*\\|\\s*[A-Za-zÄÖÜäöüß_]+\\s*=|\\}\})`, "i");
    const match = source.match(expression);

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return "";
}

function cleanWikiValue(value) {
  return String(value || "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[(?:https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, "$1")
    .replace(/''+/g, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function normalizeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 2000) : "";
  } catch (error) {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
