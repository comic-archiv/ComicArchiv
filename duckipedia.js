import { APP_CONFIG, createDuckipediaUrl } from "./config.js";

const DUCKIPEDIA_HOST = "de.duckipedia.org";
const LOOKUP_TIMEOUT_MS = 10000;
const COVER_THUMB_WIDTH = 720;

// Version 3 deliberately invalidates older PageImages-based and globally
// parsed cover results. From this version onward the image declared by the
// publication infobox is authoritative.
export const DUCKIPEDIA_LOOKUP_VERSION = 3;

export async function lookupDuckipediaMetadata(series, bandNumber, { signal, settings } = {}) {
  const pageUrl = createDuckipediaUrl(series, bandNumber, "", settings);
  const parsedUrl = new URL(pageUrl);

  if (parsedUrl.hostname !== DUCKIPEDIA_HOST || parsedUrl.pathname.startsWith("/index.php")) {
    return createNotFoundResult(pageUrl, "Für diese Reihe ist nur eine Duckipedia-Suche verfügbar.");
  }

  const pageName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    const wikitext = await fetchPageWikitext(pageName, controller.signal);
    if (wikitext === null) {
      return createNotFoundResult(pageUrl, "Die Bandseite wurde nicht gefunden.");
    }

    const parsedMetadata = parseDuckipediaWikitext(wikitext);
    let coverFileName = parsedMetadata.coverFileName;
    let coverUrl = await resolveDuckipediaCoverUrl(coverFileName, controller.signal);
    let coverSource = coverUrl ? "infobox-wikitext" : "";

    // A few older or unusually structured pages do not expose an image file in
    // their source template. As a fallback, inspect only the rendered infobox
    // on the right-hand side of the page instead of asking PageImages to guess.
    if (!coverUrl) {
      const renderedHtml = await fetchRenderedPageHtml(pageName, controller.signal).catch((error) => {
        if (error?.name === "AbortError") throw error;
        console.warn("Gerenderte Duckipedia-Infobox konnte nicht gelesen werden:", error);
        return "";
      });
      const renderedCover = extractInfoboxCoverFromHtml(renderedHtml, pageUrl);
      coverUrl = renderedCover.coverUrl;
      coverFileName = renderedCover.coverFileName;
      if (coverUrl) coverSource = "infobox-html";
    }

    return {
      found: true,
      title: parsedMetadata.title,
      publicationYear: parsedMetadata.publicationYear,
      coverUrl,
      coverFileName,
      coverSource,
      infoboxTemplate: parsedMetadata.infoboxTemplate,
      pageUrl,
      fetchedAt: new Date().toISOString(),
      lookupVersion: DUCKIPEDIA_LOOKUP_VERSION,
      reason: coverUrl || !coverFileName
        ? ""
        : "Die Bandseite wurde gefunden, das Cover der Infobox konnte aber nicht aufgelöst werden."
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
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

async function fetchPageWikitext(pageName, signal) {
  const queryUrl = createApiUrl({
    action: "query",
    prop: "revisions",
    titles: pageName,
    rvprop: "content",
    rvslots: "main"
  });

  const queryResponse = await fetch(queryUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal
  });

  if (queryResponse.ok) {
    const payload = await queryResponse.json();
    if (!payload?.error) {
      const page = payload?.query?.pages?.[0];
      if (!page || page.missing) return null;
      const revision = page.revisions?.[0];
      return unwrapApiText(
        revision?.slots?.main?.content
        ?? revision?.slots?.main
        ?? revision?.content
        ?? revision
      );
    }
  }

  const parseUrl = createApiUrl({
    action: "parse",
    page: pageName,
    prop: "wikitext"
  });
  const parseResponse = await fetch(parseUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal
  });

  if (!parseResponse.ok) {
    throw new Error(`Duckipedia antwortet mit HTTP ${parseResponse.status}.`);
  }

  const parsePayload = await parseResponse.json();
  if (parsePayload?.error) {
    if (String(parsePayload.error.code || "").toLowerCase().includes("missing")) return null;
    throw new Error(parsePayload.error.info || "Die Duckipedia-Seite konnte nicht gelesen werden.");
  }
  return unwrapApiText(parsePayload?.parse?.wikitext);
}

async function fetchRenderedPageHtml(pageName, signal) {
  const parseUrl = createApiUrl({
    action: "parse",
    page: pageName,
    prop: "text"
  });
  const response = await fetch(parseUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal
  });
  if (!response.ok) throw new Error(`Duckipedia antwortet mit HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.info || "Die Duckipedia-Seite konnte nicht gerendert werden.");
  const text = payload?.parse?.text;
  return typeof text === "string" ? text : text?.["*"] || "";
}

export async function resolveDuckipediaCoverUrl(coverFileName, signal) {
  const normalizedFileTitle = normalizeCoverFileTitle(coverFileName);
  if (!normalizedFileTitle) return "";

  try {
    const imageUrl = createApiUrl({
      action: "query",
      prop: "imageinfo",
      titles: normalizedFileTitle,
      iiprop: "url",
      iiurlwidth: String(COVER_THUMB_WIDTH)
    });
    const response = await fetch(imageUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "force-cache",
      signal
    });
    if (!response.ok) return "";
    const payload = await response.json();
    const page = payload?.query?.pages?.[0];
    const info = page?.imageinfo?.[0];
    return normalizeImageUrl(info?.thumburl || info?.url || "");
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    console.warn("Duckipedia-Cover konnte nicht aufgelöst werden:", error);
    return "";
  }
}

export function parseDuckipediaWikitext(wikitext) {
  const source = String(wikitext || "");
  const infobox = extractPublicationInfobox(source);
  const parameters = parseTemplateParameters(infobox?.source || source);
  const readField = (...names) => {
    for (const name of names) {
      const value = parameters.get(normalizeParameterName(name));
      if (String(value || "").trim()) return String(value).trim();
    }
    return "";
  };

  const title = cleanWikiValue(readField("LTBTITEL", "TITEL", "BANDTITEL", "NAME"));
  const dateValue = readField("EDATUM", "ERSCH", "ERSCHEINUNGSDATUM", "DATUM");
  const coverValue = readField("BILD", "COVER", "COVERBILD", "TITELBILD");
  const yearMatch = String(dateValue || "").match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  const publicationYear = yearMatch ? Number(yearMatch[1]) : null;

  return {
    title,
    publicationYear: publicationYear && publicationYear <= APP_CONFIG.publicationYearMaximum
      ? publicationYear
      : null,
    coverFileName: extractCoverFileName(coverValue),
    infoboxTemplate: infobox?.name || ""
  };
}

/**
 * Finds the publication infobox rather than the first image-like parameter on
 * the page. This prevents review badges, article screenshots and story images
 * from being mistaken for the book cover.
 */
export function extractPublicationInfobox(wikitext) {
  const source = String(wikitext || "").replace(/<!--([\s\S]*?)-->/g, "");
  const candidates = extractTemplateBlocks(source)
    .map((template) => ({ ...template, score: scoreInfoboxCandidate(template) }))
    .filter((template) => template.score > 0)
    .sort((first, second) => second.score - first.score || first.start - second.start);
  return candidates[0] || null;
}

export function extractInfoboxCoverFromHtml(html, pageUrl = APP_CONFIG.duckipediaBase) {
  const coverUrl = extractInfoboxCoverUrlFromHtml(html, pageUrl);
  return {
    coverFileName: extractFileNameFromImageUrl(coverUrl),
    coverUrl
  };
}

export function extractInfoboxCoverUrlFromHtml(html, pageUrl = APP_CONFIG.duckipediaBase) {
  const source = String(html || "");
  if (!source.trim()) return "";

  if (typeof globalThis.DOMParser === "function") {
    try {
      const document = new DOMParser().parseFromString(source, "text/html");
      const containers = [
        ...document.querySelectorAll("table.infobox, .infobox, table[style*='float:right' i], table[style*='float: right' i], div[style*='float:right' i], div[style*='float: right' i]")
      ];
      const resolved = chooseBestInfoboxImage(
        containers.flatMap((container, containerIndex) => [...container.querySelectorAll("img")].map((image) => ({
          source: image.getAttribute("src") || image.getAttribute("data-src") || "",
          srcset: image.getAttribute("srcset") || "",
          width: Number(image.getAttribute("width") || image.dataset?.fileWidth || 0),
          height: Number(image.getAttribute("height") || image.dataset?.fileHeight || 0),
          alt: image.getAttribute("alt") || "",
          containerText: container.textContent || "",
          containerIndex
        }))),
        pageUrl
      );
      if (resolved) return resolved;
    } catch (error) {
      console.warn("Duckipedia-Infobox konnte nicht mit DOMParser ausgewertet werden:", error);
    }
  }

  return extractInfoboxCoverUrlWithRegex(source, pageUrl);
}

export function extractCoverFileName(value) {
  const source = String(value || "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .trim();
  if (!source) return "";

  const linked = source.match(/\[\[(?:Datei|File|Bild)\s*:\s*([^\]|]+)(?:\|[^\]]*)?\]\]/i);
  const raw = linked?.[1]
    || source.replace(/^(?:Datei|File|Bild)\s*:\s*/i, "").split("|")[0];
  return String(raw || "")
    .replace(/[\[\]]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}


function unwrapApiText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value["*"] === "string") return value["*"];
  if (typeof value.content === "string") return value.content;
  return "";
}

function createNotFoundResult(pageUrl, reason) {
  return {
    found: false,
    title: "",
    publicationYear: null,
    coverUrl: "",
    coverFileName: "",
    coverSource: "",
    infoboxTemplate: "",
    pageUrl,
    fetchedAt: new Date().toISOString(),
    lookupVersion: DUCKIPEDIA_LOOKUP_VERSION,
    reason
  };
}

function extractTemplateBlocks(source) {
  const templates = [];
  const stack = [];
  for (let index = 0; index < source.length - 1; index += 1) {
    const pair = source.slice(index, index + 2);
    if (pair === "{{") {
      stack.push(index);
      index += 1;
      continue;
    }
    if (pair !== "}}" || stack.length === 0) continue;
    const start = stack.pop();
    const end = index + 2;
    const templateSource = source.slice(start, end);
    const name = readTemplateName(templateSource);
    templates.push({ source: templateSource, name, start, end });
    index += 1;
  }
  return templates;
}

function readTemplateName(templateSource) {
  const body = String(templateSource || "").replace(/^\{\{/, "").replace(/\}\}$/, "");
  const separator = findTopLevelCharacter(body, "|");
  return cleanWikiValue(separator === -1 ? body : body.slice(0, separator)).trim();
}

function scoreInfoboxCandidate(template) {
  const name = normalizeText(template.name);
  const source = template.source;
  let score = 0;
  if (/^infobox\b/.test(name)) score += 120;
  if (/\b(ltb|lustiges taschenbuch|taschenbuch|classic edition|enten edition|maus edition|sonderband|weihnachten|premium|collection)\b/.test(name)) score += 55;
  if (/\|\s*(?:BILD|COVER|COVERBILD|TITELBILD)\s*=/i.test(source)) score += 35;
  if (/\|\s*(?:LTBTITEL|TITEL|BANDTITEL|NAME)\s*=/i.test(source)) score += 20;
  if (/\|\s*(?:EDATUM|ERSCH|ERSCHEINUNGSDATUM|DATUM)\s*=/i.test(source)) score += 20;
  if (/\b(rezi|rezension|hinweis|navigation)\b/.test(name)) score -= 180;
  return score;
}

export function parseTemplateParameters(templateSource) {
  const source = String(templateSource || "").replace(/<!--([\s\S]*?)-->/g, "").trim();
  const hasBraces = source.startsWith("{{") && source.endsWith("}}");
  const body = hasBraces ? source.slice(2, -2) : source;
  const segments = splitTopLevel(body, "|");
  const parameters = new Map();

  // The first segment is the template name when an actual template block was
  // supplied. When parsing a plain source fallback it is simply ignored.
  for (let index = hasBraces ? 1 : 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const separator = findTopLevelCharacter(segment, "=");
    if (separator <= 0) continue;
    const key = normalizeParameterName(segment.slice(0, separator));
    const value = segment.slice(separator + 1).trim();
    if (key && !parameters.has(key)) parameters.set(key, value);
  }

  // A malformed or very old page can still be parsed with the conservative
  // field expression used by earlier Entenarchiv versions.
  if (parameters.size === 0) {
    ["LTBTITEL", "TITEL", "BANDTITEL", "NAME", "EDATUM", "ERSCH", "ERSCHEINUNGSDATUM", "DATUM", "BILD", "COVER", "COVERBILD", "TITELBILD"]
      .forEach((fieldName) => {
        const value = findTemplateValue(source, [fieldName]);
        if (value) parameters.set(normalizeParameterName(fieldName), value);
      });
  }
  return parameters;
}

function splitTopLevel(source, separatorCharacter) {
  const parts = [];
  let start = 0;
  let templateDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const pair = source.slice(index, index + 2);
    if (pair === "{{") { templateDepth += 1; index += 1; continue; }
    if (pair === "}}" && templateDepth > 0) { templateDepth -= 1; index += 1; continue; }
    if (pair === "[[") { linkDepth += 1; index += 1; continue; }
    if (pair === "]]" && linkDepth > 0) { linkDepth -= 1; index += 1; continue; }
    if (source[index] === separatorCharacter && templateDepth === 0 && linkDepth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function findTopLevelCharacter(source, character) {
  let templateDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const pair = source.slice(index, index + 2);
    if (pair === "{{") { templateDepth += 1; index += 1; continue; }
    if (pair === "}}" && templateDepth > 0) { templateDepth -= 1; index += 1; continue; }
    if (pair === "[[") { linkDepth += 1; index += 1; continue; }
    if (pair === "]]" && linkDepth > 0) { linkDepth -= 1; index += 1; continue; }
    if (source[index] === character && templateDepth === 0 && linkDepth === 0) return index;
  }
  return -1;
}

function extractInfoboxCoverUrlWithRegex(source, pageUrl) {
  const containers = [];
  const tableExpression = /<table\b([^>]*(?:class\s*=\s*["'][^"']*infobox[^"']*["']|style\s*=\s*["'][^"']*float\s*:\s*right[^"']*["'])[^>]*)>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableExpression.exec(source))) {
    containers.push({ attributes: tableMatch[1] || "", html: tableMatch[2] || "", containerIndex: containers.length });
  }
  if (!containers.length) return "";

  const images = [];
  for (const container of containers) {
    const imageExpression = /<img\b([^>]+)>/gi;
    let imageMatch;
    while ((imageMatch = imageExpression.exec(container.html))) {
      const attributes = parseHtmlAttributes(imageMatch[1] || "");
      images.push({
        source: attributes.src || attributes["data-src"] || "",
        srcset: attributes.srcset || "",
        width: Number(attributes.width || attributes["data-file-width"] || 0),
        height: Number(attributes.height || attributes["data-file-height"] || 0),
        alt: attributes.alt || "",
        containerText: stripHtml(container.html),
        containerIndex: container.containerIndex
      });
    }
  }
  return chooseBestInfoboxImage(images, pageUrl);
}

function chooseBestInfoboxImage(images, pageUrl) {
  const scored = images
    .map((image) => {
      const source = chooseLargestSrcsetCandidate(image.srcset) || image.source;
      const normalizedSource = normalizeImageUrlWithBase(source, pageUrl);
      if (!normalizedSource) return null;
      const width = Number(image.width || readImageDimensionFromUrl(normalizedSource) || 0);
      const height = Number(image.height || 0);
      const description = normalizeText(`${image.alt || ""} ${normalizedSource} ${image.containerText || ""}`);
      let score = Math.min(160, Math.sqrt(Math.max(1, width * Math.max(height, width * 1.35))) / 3);
      if (width >= 180) score += 80;
      if (height >= 220) score += 80;
      if (/cover|titelbild|lustiges taschenbuch|\bltb\b|band\s*\d+/.test(description)) score += 45;
      if (/erscheinungsdatum|geschichtenanzahl|seitenanzahl/.test(description)) score += 30;
      if (/inducks|logo|icon|rezension|review|commons|button|20px|30px|40px|50px/.test(description)) score -= 140;
      if (width > 0 && width < 100) score -= 100;
      score -= Number(image.containerIndex || 0) * 2;
      return { url: normalizedSource, score };
    })
    .filter(Boolean)
    .sort((first, second) => second.score - first.score);
  return scored[0]?.score > 0 ? scored[0].url : "";
}

function chooseLargestSrcsetCandidate(srcset) {
  const candidates = String(srcset || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  let best = null;
  for (const candidate of candidates) {
    const match = candidate.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i);
    if (!match) continue;
    const value = Number(match[2]);
    if (!best || value > best.value) best = { url: match[1], value };
  }
  return best?.url || "";
}

function readImageDimensionFromUrl(url) {
  const match = String(url || "").match(/\/(\d+)px-[^/]+$/i);
  return match ? Number(match[1]) : 0;
}

function extractFileNameFromImageUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  let decoded = source;
  try { decoded = decodeURIComponent(source); } catch (error) { /* URL remains usable */ }
  const thumbMatch = decoded.match(/\/thumb\/[^/]+\/[^/]+\/([^/]+)\//i);
  if (thumbMatch?.[1]) return extractCoverFileName(thumbMatch[1]);
  const cleanPath = decoded.split(/[?#]/)[0];
  const lastSegment = cleanPath.split("/").filter(Boolean).pop() || "";
  return extractCoverFileName(lastSegment.replace(/^\d+px-/i, ""));
}

function parseHtmlAttributes(source) {
  const attributes = {};
  const expression = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = expression.exec(String(source || "")))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function findTemplateValue(source, fieldNames) {
  for (const fieldName of fieldNames) {
    const expression = new RegExp(`\\|\\s*${escapeRegExp(fieldName)}\\s*=\\s*([\\s\\S]*?)(?=\\n?\\s*\\|\\s*[A-Za-zÄÖÜäöüß0-9_-]+\\s*=|\\}\\})`, "i");
    const match = source.match(expression);
    if (match?.[1]?.trim()) return match[1].trim();
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

function normalizeParameterName(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCoverFileTitle(value) {
  const fileName = extractCoverFileName(value);
  return fileName ? `Datei:${fileName}` : "";
}

function normalizeImageUrl(value) {
  return normalizeImageUrlWithBase(value, APP_CONFIG.duckipediaBase);
}

function normalizeImageUrlWithBase(value, base) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const source = value.trim().startsWith("//") ? `https:${value.trim()}` : value.trim();
    const url = new URL(source, base || APP_CONFIG.duckipediaBase);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 2000) : "";
  } catch (error) {
    return "";
  }
}

function createApiUrl(parameters) {
  const apiUrl = new URL(`${APP_CONFIG.duckipediaBase}api.php`);
  Object.entries(parameters).forEach(([key, value]) => apiUrl.searchParams.set(key, String(value)));
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("formatversion", "2");
  apiUrl.searchParams.set("origin", "*");
  return apiUrl;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
