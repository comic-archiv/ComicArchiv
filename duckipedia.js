import { APP_CONFIG, createDuckipediaUrl } from "./config.js";

const DUCKIPEDIA_HOST = "de.duckipedia.org";
const LOOKUP_TIMEOUT_MS = 8000;

export async function lookupDuckipediaMetadata(series, bandNumber, { signal } = {}) {
  const pageUrl = createDuckipediaUrl(series, bandNumber);
  const parsedUrl = new URL(pageUrl);

  if (parsedUrl.hostname !== DUCKIPEDIA_HOST || parsedUrl.pathname.startsWith("/index.php")) {
    return {
      found: false,
      title: "",
      publicationYear: null,
      pageUrl,
      reason: "Für diese Reihe ist nur eine Duckipedia-Suche verfügbar."
    };
  }

  const pageName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
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
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Duckipedia antwortet mit HTTP ${response.status}.`);
    }

    const payload = await response.json();

    if (payload?.error) {
      return {
        found: false,
        title: "",
        publicationYear: null,
        pageUrl,
        reason: payload.error.info || "Die Bandseite wurde nicht gefunden."
      };
    }

    const wikitext = payload?.parse?.wikitext?.["*"];
    if (typeof wikitext !== "string" || !wikitext.trim()) {
      return {
        found: false,
        title: "",
        publicationYear: null,
        pageUrl,
        reason: "Duckipedia hat keine auswertbaren Banddaten geliefert."
      };
    }

    const parsedMetadata = parseDuckipediaWikitext(wikitext);

    return {
      found: true,
      ...parsedMetadata,
      pageUrl
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        found: false,
        title: "",
        publicationYear: null,
        pageUrl,
        reason: signal?.aborted
          ? "Die Online-Abfrage wurde abgebrochen."
          : "Die Duckipedia-Abfrage hat zu lange gedauert."
      };
    }

    console.warn("Duckipedia-Daten konnten nicht geladen werden:", error);
    return {
      found: false,
      title: "",
      publicationYear: null,
      pageUrl,
      reason: "Titel und Jahr konnten online nicht ergänzt werden. Die Bandnummer bleibt trotzdem nutzbar."
    };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
