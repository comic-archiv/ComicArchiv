import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "data/kalender-index.json");
const DEFAULT_DISCOVERY_URL = "https://www.lustiges-taschenbuch.de/downloads";
const ALLOWED_HOSTS = new Set(["www.lustiges-taschenbuch.de", "lustiges-taschenbuch.de"]);

export function extractIcsLinks(html, baseUrl = DEFAULT_DISCOVERY_URL) {
  const links = new Set();
  const source = String(html || "");
  const expression = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match;
  while ((match = expression.exec(source))) {
    const raw = decodeHtmlEntities(match[1] || match[2] || match[3] || "").trim();
    if (!raw || !/\.ics(?:$|[?#])/i.test(raw)) continue;
    try {
      const url = new URL(raw, baseUrl);
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) continue;
      links.add(url.href);
    } catch {
      // Ungültige Links werden ignoriert.
    }
  }
  return [...links];
}

export function inferCalendarYear(icsText) {
  const years = new Map();
  for (const match of String(icsText || "").matchAll(/^DTSTART(?:;[^:]*)?:(\d{4})\d{4}/gm)) {
    const year = Number(match[1]);
    if (Number.isSafeInteger(year) && year >= 1900 && year <= 2100) {
      years.set(year, (years.get(year) || 0) + 1);
    }
  }
  return [...years.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || null;
}

export function deriveCalendarVersion(url, icsText = "") {
  const filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  const explicit = filename.match(/(?:^|[_-])(?:20\d{2})v(\d+)(?:\D|$)/i)
    || filename.match(/(?:^|[_-])v(\d+)(?:\D|$)/i);
  if (explicit) return `v${Number(explicit[1])}`;
  return `sha-${createHash("sha256").update(String(icsText)).digest("hex").slice(0, 12)}`;
}

export function compareCalendarCandidates(first, second) {
  const firstVersion = Number(String(first.version || "").match(/^v(\d+)$/i)?.[1] || -1);
  const secondVersion = Number(String(second.version || "").match(/^v(\d+)$/i)?.[1] || -1);
  if (firstVersion !== secondVersion) return secondVersion - firstVersion;
  return String(second.sourceUrl || "").localeCompare(String(first.sourceUrl || ""));
}

export function mergeCalendarCatalog(existingCatalog, discoveredEntries, updatedAt = new Date().toISOString().slice(0, 10)) {
  const existing = Array.isArray(existingCatalog?.calendars) ? existingCatalog.calendars : [];
  const discoveredByYear = new Map((Array.isArray(discoveredEntries) ? discoveredEntries : []).map((entry) => [entry.year, entry]));
  const merged = existing
    .filter((entry) => !discoveredByYear.has(Number(entry.year)))
    .map((entry) => ({ ...entry }));
  merged.push(...discoveredByYear.values());
  merged.sort((a, b) => Number(a.year) - Number(b.year));

  return {
    schemaVersion: 2,
    updatedAt,
    discovery: {
      pageUrl: existingCatalog?.discovery?.pageUrl || DEFAULT_DISCOVERY_URL,
      allowedHosts: [...ALLOWED_HOSTS]
    },
    calendars: merged
  };
}

export function validateIcs(text) {
  const source = String(text || "");
  return source.includes("BEGIN:VCALENDAR")
    && source.includes("END:VCALENDAR")
    && source.includes("BEGIN:VEVENT")
    && /^DTSTART(?:;[^:]*)?:\d{8}/m.test(source);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Entenarchiv-Calendar-Sync/4.3 (+https://github.com/)"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function run() {
  const existingCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const discoveryUrl = existingCatalog?.discovery?.pageUrl || DEFAULT_DISCOVERY_URL;
  let discoveredEntries = [];

  try {
    const html = await fetchText(discoveryUrl);
    const links = extractIcsLinks(html, discoveryUrl);
    if (!links.length) throw new Error("Im offiziellen Downloadbereich wurde keine iCal-Datei gefunden.");

    const candidates = [];
    for (const sourceUrl of links) {
      try {
        const icsText = await fetchText(sourceUrl);
        if (!validateIcs(icsText)) throw new Error("Datei enthält keinen gültigen iCal-Jahresplan.");
        const year = inferCalendarYear(icsText);
        if (!year) throw new Error("Kalenderjahr konnte nicht ermittelt werden.");
        candidates.push({
          year,
          sourceUrl,
          icsText,
          version: deriveCalendarVersion(sourceUrl, icsText)
        });
      } catch (error) {
        console.warn(`Warnung: ${sourceUrl} wurde übersprungen: ${error.message}`);
      }
    }

    const bestByYear = new Map();
    for (const candidate of candidates) {
      const current = bestByYear.get(candidate.year);
      if (!current || compareCalendarCandidates(candidate, current) < 0) bestByYear.set(candidate.year, candidate);
    }

    discoveredEntries = [...bestByYear.values()].map((candidate) => ({
      id: `ltb-${candidate.year}-${candidate.version}`,
      year: candidate.year,
      label: `LTB Jahresplan ${candidate.year}`,
      file: `data/ltb-${candidate.year}.ics`,
      sourceUrl: candidate.sourceUrl,
      publisher: "Egmont Ehapa Media",
      version: candidate.version,
      active: true,
      notes: `Automatisch aus dem offiziellen LTB-Downloadbereich synchronisiert`,
      icsText: candidate.icsText
    }));

    if (!discoveredEntries.length) throw new Error("Keine verwertbaren offiziellen Jahrespläne gefunden.");
  } catch (error) {
    console.warn(`Kalender-Synchronisierung verwendet den vorhandenen Stand: ${error.message}`);
    return { updated: false, reason: error.message, catalog: existingCatalog };
  }

  for (const entry of discoveredEntries) {
    await writeFile(resolve(root, entry.file), entry.icsText, "utf8");
  }

  const publicEntries = discoveredEntries.map(({ icsText, ...entry }) => entry);
  const nextCatalog = mergeCalendarCatalog(existingCatalog, publicEntries);
  const previousSerialized = `${JSON.stringify(existingCatalog, null, 2)}\n`;
  const nextSerialized = `${JSON.stringify(nextCatalog, null, 2)}\n`;
  await writeFile(catalogPath, nextSerialized, "utf8");

  const changed = previousSerialized !== nextSerialized;
  console.log(`✓ ${publicEntries.length} offizieller Jahresplan${publicEntries.length === 1 ? "" : "e"} geprüft: ${publicEntries.map((entry) => `${entry.year} ${entry.version}`).join(", ")}`);
  return { updated: changed, catalog: nextCatalog };
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((error) => {
    console.error(`Kalender-Synchronisierung fehlgeschlagen: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
