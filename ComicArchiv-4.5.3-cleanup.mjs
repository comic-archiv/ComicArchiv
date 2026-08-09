import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const changed = [];

function pathFor(file) {
  return resolve(root, file);
}

async function readText(file) {
  return readFile(pathFor(file), "utf8");
}

async function writeText(file, content) {
  await writeFile(pathFor(file), content, "utf8");
  if (!changed.includes(file)) changed.push(file);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleWhitespacePattern(value) {
  return value
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part) => /\s/.test(part) ? "\\s+" : escapeRegExp(part))
    .join("");
}

async function replaceOnce(file, before, after) {
  const source = await readText(file);
  if (source.includes(after)) return false;

  const exactIndex = source.indexOf(before);
  if (exactIndex >= 0) {
    if (source.indexOf(before, exactIndex + before.length) >= 0) {
      throw new Error(`${file}: erwarteter Kontext ist nicht eindeutig: ${before.split(/\r?\n/)[0].slice(0, 100)}`);
    }
    await writeText(file, `${source.slice(0, exactIndex)}${after}${source.slice(exactIndex + before.length)}`);
    console.log(`  ✓ ${file}: ${before.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 90) || "Kontext"}`);
    return true;
  }

  const pattern = new RegExp(flexibleWhitespacePattern(before), "g");
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) {
    const label = before.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 120) || "unbekannter Kontext";
    throw new Error(`${file}: erwarteter Kontext wurde nicht gefunden (${label}). Abbruch ohne unsichere Ersetzung.`);
  }
  if (matches.length > 1) {
    const label = before.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 120) || "unbekannter Kontext";
    throw new Error(`${file}: erwarteter Kontext ist nicht eindeutig (${label}).`);
  }

  const match = matches[0];
  const index = match.index;
  await writeText(file, `${source.slice(0, index)}${after}${source.slice(index + match[0].length)}`);
  console.log(`  ✓ ${file}: ${before.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 90) || "Kontext"} (flexibel)`);
  return true;
}

async function replaceAllLiteral(file, before, after) {
  const source = await readText(file);
  if (!source.includes(before)) {
    if (source.includes(after)) return false;
    throw new Error(`${file}: '${before}' wurde nicht gefunden.`);
  }
  await writeText(file, source.split(before).join(after));
  return true;
}

async function updateJson(file, mutate) {
  const source = await readText(file);
  const parsed = JSON.parse(source);
  const next = mutate(parsed) || parsed;
  const formatted = `${JSON.stringify(next, null, 2)}\n`;
  if (formatted === source) return false;
  await writeText(file, formatted);
  return true;
}

async function appendSection(file, marker, section) {
  const source = await readText(file);
  if (source.includes(marker)) return false;
  await writeText(file, `${source.trimEnd()}\n\n${section.trim()}\n`);
  return true;
}

async function updateServiceWorker() {
  const file = "service-worker.js";
  const original = await readText(file);
  let source = original.replace(/\r\n/g, "\n");

  source = source
    .replace(/const APP_VERSION = "4\.5\.[23]";/, 'const APP_VERSION = "4.5.3";')
    .replace(/const CACHE_NAME = `\$\{CACHE_PREFIX\}v4-5-[23]`;/, 'const CACHE_NAME = `${CACHE_PREFIX}v4-5-3`;');

  // CORE_SHELL schlank halten. Die Ersetzungen sind absichtlich zeilenbasiert,
  // damit kleine Formatunterschiede im bestehenden 4.5.2-Worker nicht zum Abbruch führen.
  source = source
    .replace(/^\s*"\.\/",\s*\n/m, "")
    .replace(/^\s*"\.\/scanner\.js",\s*\n/m, "")
    .replace(/^\s*"\.\/share-cards\.js",\s*\n/m, "")
    .replace(/^\s*"\.\/icons\/icon-1024\.png",\s*\n/m, "");

  const optionalBlock = `const OPTIONAL_SHELL = Object.freeze([\n  "./data/kalender-index.json",\n  "./data/ltb-2026.ics",\n  "./scanner.js",\n  "./share-cards.js"\n]);`;
  source = source.replace(
    /const OPTIONAL_SHELL = Object\.freeze\(\[\s*"\.\/data\/kalender-index\.json",\s*"\.\/data\/ltb-2026\.ics"(?:,\s*"\.\/scanner\.js",\s*"\.\/share-cards\.js")?\s*\]\);/m,
    optionalBlock
  );

  if (!source.includes("const NETWORK_FIRST_PATHS")) {
    source = source.replace(
      optionalBlock,
      `${optionalBlock}\nconst NETWORK_FIRST_PATHS = Object.freeze(new Set([\n  "index.html",\n  "version.json",\n  "data/kalender-index.json"\n]));`
    );
  }

  if (!source.includes("shouldUseNetworkFirst(request, requestUrl) ?")) {
    source = source.replace(
      /event\.respondWith\(networkFirst\(request\)\);/,
      'event.respondWith(shouldUseNetworkFirst(request, requestUrl) ? networkFirst(request) : cacheFirst(request));'
    );
  }

  if (!source.includes("async function cacheFirst(request)")) {
    source = source.replace(
      /async function networkFirst\(request\) \{/,
      `function shouldUseNetworkFirst(request, requestUrl) {\n  if (request.mode === "navigate") return true;\n  const scopeUrl = new URL(self.registration.scope);\n  const relativePath = requestUrl.pathname.startsWith(scopeUrl.pathname)\n    ? requestUrl.pathname.slice(scopeUrl.pathname.length)\n    : requestUrl.pathname.replace(/^\\/+/, "");\n  return NETWORK_FIRST_PATHS.has(relativePath) || relativePath.endsWith(".ics");\n}\n\nasync function cacheFirst(request) {\n  const cache = await caches.open(CACHE_NAME);\n  const cachedResponse = await cache.match(request, { ignoreSearch: true });\n  if (cachedResponse) return cachedResponse;\n\n  const networkResponse = await fetch(request);\n  if (networkResponse.ok) {\n    cache.put(request, networkResponse.clone()).catch((error) => {\n      console.warn("Datei konnte nicht im Offline-Cache gespeichert werden:", error);\n    });\n  }\n  return networkResponse;\n}\n\nasync function networkFirst(request) {`
    );
  }

  const requiredChecks = [
    ['const APP_VERSION = "4.5.3";', "App-Version 4.5.3"],
    ['const CACHE_NAME = `${CACHE_PREFIX}v4-5-3`;', "Cache-Version v4-5-3"],
    [optionalBlock, "On-Demand-Assets"],
    ["const NETWORK_FIRST_PATHS", "Network-first-Pfade"],
    ["async function cacheFirst(request)", "Cache-first-Strategie"],
    ["shouldUseNetworkFirst(request, requestUrl) ?", "Strategieauswahl"]
  ];
  for (const [needle, label] of requiredChecks) {
    if (!source.includes(needle)) {
      throw new Error(`${file}: ${label} konnte nicht sicher hergestellt werden.`);
    }
  }

  const coreMatch = source.match(/const CORE_SHELL = Object\.freeze\(\[([\s\S]*?)\]\);/);
  if (!coreMatch) throw new Error(`${file}: CORE_SHELL konnte nicht gelesen werden.`);
  const core = coreMatch[1];
  if (/"\.\/",/.test(core) || /icon-1024\.png/.test(core) || /scanner\.js/.test(core) || /share-cards\.js/.test(core)) {
    throw new Error(`${file}: Core-Precache enthält nach dem Cleanup noch Altlasten.`);
  }

  if (source !== original) await writeText(file, source);
}

async function ensureGitignore() {
  const file = ".gitignore";
  const required = [
    "node_modules/",
    "*.log",
    ".DS_Store",
    "",
    "# Build output - generated by npm run build and GitHub Actions",
    "dist/",
    "",
    "# Entenarchiv exports and private backups",
    "Entenarchiv-Backup-*.json",
    "Entenarchiv-Medien-Backup-*.json",
    "Entenarchiv-Sammlung-*.csv",
    "Entenarchiv-Fehlende-Baende-*.csv",
    "Entenarchiv-Flohmarkt-Suchliste-*.pdf",
    "Entenarchiv-Diagnose-*.json",
    "Entenarchiv-TEST-Diagnose-*.json",
    "Entenarchiv-Migrationsbericht-*.json",
    "Entenarchiv-Share-*.png",
    "Entenarchiv-Erscheinungsradar-*.ics",
    "ComicArchiv-*-cleanup.mjs",
    "ComicArchiv-*-commands.txt"
  ];
  let lines = [];
  if (existsSync(pathFor(file))) lines = (await readText(file)).split(/\r?\n/);
  const existing = new Set(lines.map((line) => line.trim()));
  const additions = required.filter((line) => line && !existing.has(line.trim()));
  if (!lines.length) {
    await writeText(file, `${required.join("\n")}\n`);
    return true;
  }
  if (!additions.length) return false;
  const next = [...lines];
  if (next.at(-1)?.trim()) next.push("");
  next.push(...additions);
  await writeText(file, `${next.join("\n").replace(/\n+$/, "")}\n`);
  return true;
}

async function main() {
  const packageJson = JSON.parse(await readText("package.json"));
  if (packageJson.name !== "entenarchiv") {
    throw new Error("Dieses Script muss im Root des ComicArchiv/Entenarchiv-Repositories ausgeführt werden.");
  }
  if (!["4.5.2", "4.5.3"].includes(packageJson.version)) {
    throw new Error(`Erwartet wurde Entenarchiv 4.5.2 oder 4.5.3, gefunden wurde ${packageJson.version}.`);
  }

  await ensureGitignore();

  await updateJson("package.json", (json) => ({ ...json, version: "4.5.3" }));
  await updateJson("version.json", (json) => ({ ...json, appVersion: "4.5.3", releasedAt: "2026-08-09" }));

  await replaceOnce(
    "config.js",
    '  appVersion: "4.5.2",',
    '  appVersion: "4.5.3",'
  );
  await replaceOnce(
    "config.js",
    '  calendarSourceUrl: "https://www.lustiges-taschenbuch.de/sites/default/files/2025-11/ltb_evt_2026v2.ics",',
    '  calendarSourceUrl: "",'
  );

  await replaceOnce(
    "recovery.js",
    'const APP_VERSION = "4.5.2";',
    'const APP_VERSION = "4.5.3";'
  );
  await replaceOnce(
    "index.html",
    '<span id="app-version">v4.5.2</span>',
    '<span id="app-version">v4.5.3</span>'
  );

  await updateServiceWorker();

  const batchImplementation = `export async function saveComicsBatch(comics) {\n  const entries = Array.isArray(comics) ? comics.filter(Boolean) : [];\n  if (!entries.length) return [];\n  if (entries.length === 1) return [await saveComic(entries[0])];\n\n  const database = await getDatabase();\n  const core = await ensureArchiveCoreReady();\n  if (!core.ready) {\n    const transaction = database.transaction(COMICS_STORE, "readwrite");\n    const store = transaction.objectStore(COMICS_STORE);\n    entries.forEach((comic) => store.put(comic));\n    await transactionDone(transaction);\n    return entries;\n  }\n\n  const [settings, existingSeries, graph] = await Promise.all([\n    readSettingsValue(database),\n    readAll(database, SERIES_STORE),\n    readArchiveGraph(database)\n  ]);\n  const catalog = buildSeriesCatalog({ legacyComics: entries, settings, existingSeries });\n  const issuesById = new Map(graph.issues.map((issue) => [String(issue.id), issue]));\n  const issuesByIdentity = new Map(graph.issues.map((issue) => [String(issue.seriesVolumeKey || ""), issue]).filter(([key]) => key));\n  const copiesByIssue = new Map();\n  graph.copies.forEach((copy) => {\n    const issueId = String(copy.issueId || "");\n    if (!issueId) return;\n    if (!copiesByIssue.has(issueId)) copiesByIssue.set(issueId, []);\n    copiesByIssue.get(issueId).push(copy);\n  });\n  copiesByIssue.forEach((copies) => copies.sort((first, second) => Number(first.displayOrder || 0) - Number(second.displayOrder || 0)));\n\n  const seriesWrites = new Map();\n  const issueWrites = new Map();\n  const issueDeletes = new Set();\n  const copyWrites = new Map();\n  const copyDeletes = new Set();\n  const legacyWrites = new Map();\n  const legacyDeletes = new Set();\n  const coverWrites = new Map();\n  const coverDeletes = new Set();\n  const coverCache = new Map();\n  const projectedRecords = [];\n  const batchNonce = Date.now();\n\n  const readBatchCover = async (comicId) => {\n    const normalizedId = String(comicId || "");\n    if (!normalizedId || coverDeletes.has(normalizedId)) return null;\n    if (coverWrites.has(normalizedId)) return coverWrites.get(normalizedId);\n    if (coverCache.has(normalizedId)) return coverCache.get(normalizedId);\n    const record = await readRecord(database, COVER_STORE, normalizedId);\n    coverCache.set(normalizedId, record || null);\n    return record || null;\n  };\n\n  for (const [entryIndex, comic] of entries.entries()) {\n    const firstPass = legacyComicToArchiveRecords(comic, catalog.series, [], {\n      dataFormatVersion: APP_CONFIG.dataFormatVersion\n    });\n    const identityMatch = issuesByIdentity.get(firstPass.issue.seriesVolumeKey) || null;\n    const requestedIssueId = String(comic.issueId || comic.id || firstPass.issue.id);\n    const targetIssueId = identityMatch?.id || requestedIssueId;\n    const sourceIssueId = requestedIssueId;\n    const previousCopies = [...(copiesByIssue.get(String(targetIssueId)) || [])];\n    const sourceCopies = sourceIssueId !== targetIssueId\n      ? [...(copiesByIssue.get(String(sourceIssueId)) || [])]\n      : [];\n    const isAdditionalLegacyEntry = Boolean(identityMatch && sourceIssueId !== identityMatch.id);\n    const [sourceCover, targetCover] = sourceIssueId !== targetIssueId\n      ? await Promise.all([readBatchCover(sourceIssueId), readBatchCover(targetIssueId)])\n      : [null, null];\n\n    let records = legacyComicToArchiveRecords({\n      ...comic,\n      id: targetIssueId,\n      issueId: targetIssueId,\n      seriesId: firstPass.series.id,\n      createdAt: identityMatch?.createdAt || comic.createdAt\n    }, catalog.series, isAdditionalLegacyEntry ? [] : previousCopies, {\n      dataFormatVersion: APP_CONFIG.dataFormatVersion\n    });\n\n    if (identityMatch) {\n      records.issue = {\n        ...identityMatch,\n        ...records.issue,\n        id: identityMatch.id,\n        createdAt: identityMatch.createdAt || records.issue.createdAt,\n        title: records.issue.title || identityMatch.title || "",\n        publicationYear: records.issue.publicationYear ?? identityMatch.publicationYear ?? null,\n        duckipediaPageUrl: records.issue.duckipediaPageUrl || identityMatch.duckipediaPageUrl || "",\n        duckipediaCoverUrl: records.issue.duckipediaCoverUrl || identityMatch.duckipediaCoverUrl || "",\n        duckipediaCoverFileName: records.issue.duckipediaCoverFileName || identityMatch.duckipediaCoverFileName || "",\n        duckipediaCoverSource: records.issue.duckipediaCoverSource || identityMatch.duckipediaCoverSource || "",\n        duckipediaCoverLookupVersion: Math.max(\n          Number(records.issue.duckipediaCoverLookupVersion || 0),\n          Number(identityMatch.duckipediaCoverLookupVersion || 0)\n        ),\n        legacyComicIds: [...new Set([\n          ...(identityMatch.legacyComicIds || []),\n          ...(records.issue.legacyComicIds || []),\n          requestedIssueId\n        ].filter(Boolean))]\n      };\n      if (isAdditionalLegacyEntry) {\n        const incomingCopies = records.copies.map((copy, index) => ({\n          ...copy,\n          id: previousCopies.some((existing) => existing.id === copy.id) ? \`${'${copy.id}'}-${'${batchNonce}'}-${'${entryIndex + 1}'}-${'${index + 1}'}\` : copy.id,\n          issueId: identityMatch.id,\n          displayOrder: previousCopies.length + index + 1\n        }));\n        records.copies = [\n          ...previousCopies.map((copy, index) => ({ ...copy, issueId: identityMatch.id, displayOrder: index + 1 })),\n          ...incomingCopies\n        ];\n      } else {\n        records.copies = records.copies.map((copy, index) => ({\n          ...copy,\n          issueId: identityMatch.id,\n          displayOrder: index + 1\n        }));\n      }\n    }\n\n    const projected = materializeLegacyComics([records.issue], records.copies, [records.series])[0];\n    const oldCopyIds = [...new Set([\n      ...previousCopies.map((copy) => copy.id),\n      ...sourceCopies.map((copy) => copy.id)\n    ])];\n\n    const previousTargetIssue = issuesById.get(String(targetIssueId));\n    if (previousTargetIssue?.seriesVolumeKey && previousTargetIssue.seriesVolumeKey !== records.issue.seriesVolumeKey) {\n      if (issuesByIdentity.get(previousTargetIssue.seriesVolumeKey)?.id === previousTargetIssue.id) {\n        issuesByIdentity.delete(previousTargetIssue.seriesVolumeKey);\n      }\n    }\n    if (sourceIssueId !== targetIssueId) {\n      const sourceIssue = issuesById.get(String(sourceIssueId));\n      if (sourceIssue?.seriesVolumeKey && issuesByIdentity.get(sourceIssue.seriesVolumeKey)?.id === sourceIssue.id) {\n        issuesByIdentity.delete(sourceIssue.seriesVolumeKey);\n      }\n      issuesById.delete(String(sourceIssueId));\n      copiesByIssue.delete(String(sourceIssueId));\n      issueDeletes.add(String(sourceIssueId));\n    }\n\n    issuesById.set(String(records.issue.id), records.issue);\n    if (records.issue.seriesVolumeKey) issuesByIdentity.set(records.issue.seriesVolumeKey, records.issue);\n    copiesByIssue.set(String(records.issue.id), records.copies);\n    seriesWrites.set(String(records.series.id), records.series);\n    issueWrites.set(String(records.issue.id), records.issue);\n    oldCopyIds.forEach((copyId) => {\n      copyDeletes.add(String(copyId));\n      copyWrites.delete(String(copyId));\n    });\n    records.copies.forEach((copy) => copyWrites.set(String(copy.id), copy));\n    legacyWrites.set(String(projected.id), projected);\n    if (sourceIssueId !== projected.id) {\n      legacyDeletes.add(String(sourceIssueId));\n      legacyWrites.delete(String(sourceIssueId));\n    }\n\n    if (sourceIssueId !== targetIssueId) {\n      if (sourceCover) {\n        const sourceIsNewer = Date.parse(sourceCover.updatedAt || 0) > Date.parse(targetCover?.updatedAt || 0);\n        if (!targetCover || sourceIsNewer) {\n          const remappedCover = { ...sourceCover, comicId: targetIssueId };\n          coverWrites.set(String(targetIssueId), remappedCover);\n          coverDeletes.delete(String(targetIssueId));\n          coverCache.set(String(targetIssueId), remappedCover);\n        }\n      }\n      coverDeletes.add(String(sourceIssueId));\n      coverWrites.delete(String(sourceIssueId));\n      coverCache.set(String(sourceIssueId), null);\n    }\n\n    projectedRecords.push(projected);\n  }\n\n  const stores = [SERIES_STORE, ISSUES_STORE, COPIES_STORE, COMICS_STORE];\n  if (coverWrites.size || coverDeletes.size) stores.push(COVER_STORE);\n  const transaction = database.transaction(stores, "readwrite");\n  const seriesStore = transaction.objectStore(SERIES_STORE);\n  const issuesStore = transaction.objectStore(ISSUES_STORE);\n  const copiesStore = transaction.objectStore(COPIES_STORE);\n  const legacyStore = transaction.objectStore(COMICS_STORE);\n\n  seriesWrites.forEach((record) => seriesStore.put(record));\n  issueDeletes.forEach((issueId) => issuesStore.delete(issueId));\n  issueWrites.forEach((record) => issuesStore.put(record));\n  copyDeletes.forEach((copyId) => copiesStore.delete(copyId));\n  copyWrites.forEach((record) => copiesStore.put(record));\n  legacyDeletes.forEach((issueId) => legacyStore.delete(issueId));\n  legacyWrites.forEach((record) => legacyStore.put(record));\n\n  if (stores.includes(COVER_STORE)) {\n    const coverStore = transaction.objectStore(COVER_STORE);\n    coverDeletes.forEach((comicId) => coverStore.delete(comicId));\n    coverWrites.forEach((record) => coverStore.put(record));\n  }\n\n  await transactionDone(transaction);\n  return projectedRecords;\n}\n\nexport async function upsertComics(comics) {\n  return saveComicsBatch(comics);\n}`;

  await replaceOnce(
    "storage.js",
    `export async function upsertComics(comics) {\n  for (const comic of comics) await saveComic(comic);\n}`,
    batchImplementation
  );

  await replaceOnce(
    "storage.js",
    `export async function clearMetadataCache() {\n  const database = await getDatabase();\n  const transaction = database.transaction(METADATA_STORE, "readwrite");\n  transaction.objectStore(METADATA_STORE).clear();\n  await transactionDone(transaction);\n}`,
    `export async function clearMetadataCache() {\n  const database = await getDatabase();\n  const transaction = database.transaction(METADATA_STORE, "readwrite");\n  transaction.objectStore(METADATA_STORE).clear();\n  await transactionDone(transaction);\n}\n\nexport async function pruneMetadataCache({ maximumAgeDays = APP_CONFIG.metadataCacheMaximumAgeDays, now = Date.now() } = {}) {\n  const ageDays = Number(maximumAgeDays);\n  const referenceTime = Number(now);\n  if (!Number.isFinite(ageDays) || ageDays <= 0 || !Number.isFinite(referenceTime)) {\n    return { removed: 0, kept: 0 };\n  }\n  const cutoff = referenceTime - ageDays * 24 * 60 * 60 * 1000;\n  const database = await getDatabase();\n  const transaction = database.transaction(METADATA_STORE, "readwrite");\n  const store = transaction.objectStore(METADATA_STORE);\n  const result = { removed: 0, kept: 0 };\n\n  await new Promise((resolve, reject) => {\n    const request = store.openCursor();\n    request.onerror = () => reject(request.error || new Error("Metadaten-Cache konnte nicht bereinigt werden."));\n    request.onsuccess = () => {\n      const cursor = request.result;\n      if (!cursor) {\n        resolve();\n        return;\n      }\n      const fetchedAt = Date.parse(cursor.value?.fetchedAt || "");\n      if (!Number.isFinite(fetchedAt) || fetchedAt < cutoff) {\n        cursor.delete();\n        result.removed += 1;\n      } else {\n        result.kept += 1;\n      }\n      cursor.continue();\n    };\n  });\n  await transactionDone(transaction);\n  return result;\n}`
  );

  await replaceOnce(
    "app.js",
    `  getMetadataCache,\n  replaceAllComics,`,
    `  getMetadataCache,\n  pruneMetadataCache,\n  replaceAllComics,`
  );
  await replaceOnce(
    "app.js",
    `  await Promise.allSettled([\n    runOptionalStartupTask("Speicherstatus", refreshStorageStatus),\n    runOptionalStartupTask("Medienstatus", refreshMediaStatus)\n  ]);`,
    `  await Promise.allSettled([\n    runOptionalStartupTask("Speicherstatus", refreshStorageStatus),\n    runOptionalStartupTask("Duckipedia-Cache", async () => {\n      const result = await pruneMetadataCache();\n      if (result.removed > 0) console.info(\`${'${result.removed}'} veraltete Duckipedia-Cache-Einträge entfernt.\`);\n    }),\n    runOptionalStartupTask("Medienstatus", refreshMediaStatus)\n  ]);`
  );
  await replaceOnce(
    "app.js",
    `    renderCollection();\n    renderStats();\n    renderMissingBands();\n    renderFleaMarketHubStatus();\n    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();\n    renderSeriesProgress();`,
    `    if (!elements.collectionPage.classList.contains("hidden")) renderCollection();\n    renderStats();\n    if (!elements.missingPage.classList.contains("hidden")) renderMissingBands();\n    renderFleaMarketHubStatus();\n    if (!elements.fleaMarketPage.classList.contains("hidden")) renderFleaMarket();\n    if (!elements.progressPage.classList.contains("hidden")) renderSeriesProgress();`
  );
  await replaceOnce(
    "app.js",
    '  elements.conditionStatsTotal.textContent = physicalCopies === 1 ? "1 Exemplar" : `${physicalCopies} Exemplare`;',
    '  if (elements.statisticsPage.classList.contains("hidden")) return;\n\n  elements.conditionStatsTotal.textContent = physicalCopies === 1 ? "1 Exemplar" : `${physicalCopies} Exemplare`;'
  );
  await replaceOnce(
    "app.js",
    `function openStatisticsPage() {\n  renderStatistics();\n  elements.statisticsPage.classList.remove("hidden");`,
    `function openStatisticsPage() {\n  elements.statisticsPage.classList.remove("hidden");\n  renderStats();`
  );

  await replaceOnce(
    "app.js",
    `  for (const comic of entries) {\n    await saveComic(comic);\n  }`,
    `  await upsertComics(entries);`
  );

  await replaceOnce(
    "app.js",
    `import { MagazineBarcodeScanner, parseSupplementToBandNumber } from "./scanner.js";\nimport {\n  SCANNER_MODES,`,
    `// Scanner-Implementierung wird erst beim Öffnen dynamisch geladen.\nimport {\n  SCANNER_MODES,`
  );
  await replaceOnce(
    "app.js",
    `import {\n  buildShareCardPayload,\n  canvasToPngBlob,\n  renderShareCard\n} from "./share-cards.js";\nimport {\n  RELEASE_RADAR_FILTERS,`,
    `// Share-Card-Renderer wird erst beim Öffnen dynamisch geladen.\nimport {\n  RELEASE_RADAR_FILTERS,`
  );
  await replaceOnce(
    "app.js",
    `} from "./release-radar.js";\nconst THEME_STORAGE_KEY = "comicarchiv-theme";`,
    `} from "./release-radar.js";\n\nlet scannerModulePromise = null;\nlet shareCardsModulePromise = null;\nfunction loadScannerModule() {\n  if (!scannerModulePromise) scannerModulePromise = import("./scanner.js");\n  return scannerModulePromise;\n}\nfunction loadShareCardsModule() {\n  if (!shareCardsModulePromise) shareCardsModulePromise = import("./share-cards.js");\n  return shareCardsModulePromise;\n}\n\nconst THEME_STORAGE_KEY = "comicarchiv-theme";`
  );
  await replaceOnce(
    "app.js",
    `function getBarcodeScanner() {\n  if (!barcodeScanner) {\n    barcodeScanner = new MagazineBarcodeScanner(elements.scannerCameraTarget);\n  }\n  return barcodeScanner;\n}`,
    `async function getBarcodeScanner() {\n  if (!barcodeScanner) {\n    const { MagazineBarcodeScanner } = await loadScannerModule();\n    barcodeScanner = new MagazineBarcodeScanner(elements.scannerCameraTarget);\n  }\n  return barcodeScanner;\n}`
  );
  await replaceOnce(
    "app.js",
    `  const scanner = getBarcodeScanner();\n  if (!scanner.isSupported()) {`,
    `  const scanner = await getBarcodeScanner();\n  if (!scanner.isSupported()) {`
  );
  await replaceOnce(
    "app.js",
    `    await ensureScannerLibrary();\n    const payload = await getBarcodeScanner().decodeImageFile(file);`,
    `    await ensureScannerLibrary();\n    const scanner = await getBarcodeScanner();\n    const payload = await scanner.decodeImageFile(file);`
  );
  await replaceOnce(
    "app.js",
    `async function handleScannerManualCode() {\n  const extension = elements.scannerManualCode.value.trim();\n  const bandNumber = parseSupplementToBandNumber(extension);`,
    `async function handleScannerManualCode() {\n  const extension = elements.scannerManualCode.value.trim();\n  const { parseSupplementToBandNumber } = await loadScannerModule();\n  const bandNumber = parseSupplementToBandNumber(extension);`
  );
  await replaceOnce(
    "app.js",
    `  try {\n    const payload = buildShareCardPayload(elements.shareCardTemplate.value, createShareCardContext());\n    await renderShareCard(elements.shareCardCanvas, payload);\n    elements.shareCardMessage.textContent = "";`,
    `  try {\n    const { buildShareCardPayload, renderShareCard } = await loadShareCardsModule();\n    const payload = buildShareCardPayload(elements.shareCardTemplate.value, createShareCardContext());\n    await renderShareCard(elements.shareCardCanvas, payload);\n    elements.shareCardMessage.textContent = "";`
  );
  await replaceOnce(
    "app.js",
    `  try {\n    const payload = buildShareCardPayload(elements.shareCardTemplate.value, createShareCardContext());\n    await renderShareCard(elements.shareCardCanvas, payload);\n    const blob = await canvasToPngBlob(elements.shareCardCanvas);`,
    `  try {\n    const { buildShareCardPayload, canvasToPngBlob, renderShareCard } = await loadShareCardsModule();\n    const payload = buildShareCardPayload(elements.shareCardTemplate.value, createShareCardContext());\n    await renderShareCard(elements.shareCardCanvas, payload);\n    const blob = await canvasToPngBlob(elements.shareCardCanvas);`
  );

  await replaceOnce(
    "scripts/validate-project.mjs",
    `const requiredFiles = [\n  "index.html",`,
    `const requiredFiles = [\n  ".gitignore",\n  "index.html",`
  );
  await replaceOnce(
    "scripts/validate-project.mjs",
    `const sourceFiles = await walk(root);\nconst syntaxFiles = sourceFiles.filter((file) => [".js", ".mjs"].includes(extname(file)) && !file.includes(\`${'${join(root, "vendor")}'}\`));`,
    `const sourceFiles = await walk(root);\nconst privateExportPatterns = [\n  /^Entenarchiv-(?:Backup|Medien-Backup|Diagnose|TEST-Diagnose|Migrationsbericht)-.*\\.json$/i,\n  /^Entenarchiv-(?:Sammlung|Fehlende-Baende)-.*\\.csv$/i,\n  /^Entenarchiv-Flohmarkt-Suchliste-.*\\.pdf$/i,\n  /^Entenarchiv-Share-.*\\.png$/i,\n  /^Entenarchiv-Erscheinungsradar-.*\\.ics$/i\n];\nconst privateExports = sourceFiles.filter((file) => {\n  const name = relative(root, file).split(/[\\\\/]/).pop() || "";\n  return privateExportPatterns.some((pattern) => pattern.test(name));\n});\nif (privateExports.length) {\n  errors.push(\`Private Entenarchiv-Exporte im Repository gefunden: ${'${privateExports.map((file) => relative(root, file)).join(", ")}'}\`);\n}\nconst syntaxFiles = sourceFiles.filter((file) => [".js", ".mjs"].includes(extname(file)) && !file.includes(\`${'${join(root, "vendor")}'}\`));`
  );
  await replaceOnce(
    "scripts/validate-project.mjs",
    `for (const asset of shellAssets) {\n  if (!asset.startsWith("./") || asset === "./") continue;\n  const localPath = asset.slice(2).split(/[?#]/)[0];\n  if (!existsSync(join(root, localPath))) errors.push(\`Service Worker referenziert fehlende Datei: ${'${asset}'}\`);\n}`,
    `for (const asset of shellAssets) {\n  if (!asset.startsWith("./") || asset === "./") continue;\n  const localPath = asset.slice(2).split(/[?#]/)[0];\n  if (!existsSync(join(root, localPath))) errors.push(\`Service Worker referenziert fehlende Datei: ${'${asset}'}\`);\n}\nconst coreShellAssets = extractArrayStrings(serviceWorkerSource, "CORE_SHELL");\nif (coreShellAssets.includes("./")) errors.push("Service Worker darf ./ und ./index.html nicht doppelt precachen.");\nif (coreShellAssets.includes("./icons/icon-1024.png")) errors.push("Das 1024er Icon darf nicht Teil des Core-Precaches sein.");\nif (!serviceWorkerSource.includes("async function cacheFirst(request)")) errors.push("Cache-first-Strategie für statische Assets fehlt im Service Worker.");`
  );

  // Bestehende UI-Tests an die neue On-Demand-Modulstruktur anpassen.
  // Funktionalität bleibt gleich: Scanner und Share Cards sind weiterhin App-, Build-
  // und Offline-Bestandteil, werden im App-Code aber dynamisch statt statisch importiert.
  {
    const file = "tests/ui-45.test.mjs";
    const source = await readText(file);
    const lines = source.split(/\r?\n/);
    let changedTest = false;

    const replaceStaticImportAssertion = (moduleName) => {
      const candidates = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) =>
          line.includes("assert.match(app") &&
          line.includes(moduleName) &&
          line.includes("from")
        );

      if (candidates.length > 1) {
        throw new Error(`${file}: mehrere alte Static-Import-Tests für ${moduleName} gefunden.`);
      }
      if (candidates.length === 1) {
        const { index } = candidates[0];
        lines[index] = `  assert.match(app, /import\\("\\.\\/${moduleName.replace(/\./g, "\\.")}"\\)/);`;
        changedTest = true;
        console.log(`  ✓ ${file}: ${moduleName} auf Dynamic-Import-Test umgestellt`);
        return;
      }

      const dynamicAlreadyPresent = lines.some((line) =>
        line.includes("assert.match(app") &&
        line.includes(moduleName) &&
        line.includes("import")
      );
      if (!dynamicAlreadyPresent) {
        throw new Error(`${file}: weder alter noch neuer Import-Test für ${moduleName} gefunden.`);
      }
    };

    replaceStaticImportAssertion("share-cards.js");
    replaceStaticImportAssertion("scanner.js");

    if (changedTest) {
      await writeText(file, `${lines.join("\n").replace(/\n+$/, "")}\n`);
    }
  }

  const cleanupTest = `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport { dirname, resolve } from "node:path";\nimport { fileURLToPath } from "node:url";\n\nconst root = resolve(dirname(fileURLToPath(import.meta.url)), "..");\nconst source = (file) => readFile(resolve(root, file), "utf8");\n\ntest("4.5.3 nutzt einen schlanken, strategiegetrennten Service Worker", async () => {\n  const worker = await source("service-worker.js");\n  const core = worker.match(/const CORE_SHELL = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);/)?.[1] || "";\n  assert.doesNotMatch(core, /\"\\.\\/\",/);\n  assert.doesNotMatch(core, /icon-1024\\.png/);\n  assert.match(worker, /async function cacheFirst\\(request\\)/);\n  assert.match(worker, /shouldUseNetworkFirst\\(request, requestUrl\\)/);\n  assert.doesNotMatch(core, /scanner\\.js|share-cards\\.js/);\n  const optional = worker.match(/const OPTIONAL_SHELL = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);/)?.[1] || "";\n  assert.match(optional, /scanner\\.js/);\n  assert.match(optional, /share-cards\\.js/);\n});\n\ntest("versteckte Vollansichten werden nicht bei jedem Collection-Refresh gerendert", async () => {\n  const app = await source("app.js");\n  assert.match(app, /if \\(!elements\\.collectionPage\\.classList\\.contains\\(\"hidden\"\\)\\) renderCollection\\(\\);/);\n  assert.match(app, /if \\(!elements\\.missingPage\\.classList\\.contains\\(\"hidden\"\\)\\) renderMissingBands\\(\\);/);\n  assert.match(app, /if \\(!elements\\.progressPage\\.classList\\.contains\\(\"hidden\"\\)\\) renderSeriesProgress\\(\\);/);\n  assert.match(app, /if \\(elements\\.statisticsPage\\.classList\\.contains\\("hidden"\\)\\) return;/);\n  assert.match(app, /function openStatisticsPage\\(\\) \\{\\s+elements\\.statisticsPage\\.classList\\.remove\\("hidden"\\);\\s+renderStats\\(\\);/);\n  assert.doesNotMatch(app, /from "\\.\\/scanner\\.js"/);\n  assert.doesNotMatch(app, /from "\\.\\/share-cards\\.js"/);\n  assert.match(app, /import\\("\\.\\/scanner\\.js"\\)/);\n  assert.match(app, /import\\("\\.\\/share-cards\\.js"\\)/);\n});\n\ntest("Bulk-Speicherung und Metadaten-GC sind im Storage-Layer vorhanden", async () => {\n  const storage = await source("storage.js");\n  const app = await source("app.js");\n  assert.match(storage, /export async function saveComicsBatch\\(comics\\)/);\n  assert.match(storage, /database\\.transaction\\(stores, \"readwrite\"\\)/);\n  assert.match(storage, /export async function pruneMetadataCache/);\n  assert.match(app, /await upsertComics\\(entries\\);/);\n});\n\ntest("private Exporte und generiertes dist sind von Git ausgeschlossen", async () => {\n  const gitignore = await source(".gitignore");\n  assert.match(gitignore, /^dist\\/$/m);\n  assert.match(gitignore, /^Entenarchiv-Medien-Backup-\\*\\.json$/m);\n  assert.match(gitignore, /^Entenarchiv-Diagnose-\\*\\.json$/m);\n});\n`;
  const cleanupTestPath = "tests/core-cleanup.test.mjs";
  if (!existsSync(pathFor(cleanupTestPath)) || (await readText(cleanupTestPath)) !== cleanupTest) {
    await writeText(cleanupTestPath, cleanupTest);
  }

  await appendSection(
    "THIRD-PARTY-NOTICES.md",
    "## Duckipedia",
    `## Duckipedia\n\n- Dienst: Duckipedia / MediaWiki-API\n- Quelle: https://de.duckipedia.org/\n- Verwendung: optionale Metadatenabfrage und Remote-Covervorschau\n\nEntenarchiv legt keine Duckipedia-Cover im Repository oder Produktionspaket ab. Wenn kein eigenes Coverfoto vorhanden ist, kann der Browser eine Vorschaudatei direkt von Duckipedia laden. Eigene Coverfotos haben immer Vorrang.\n\nCover, Scans und andere Bilder können Rechten von Disney, Egmont oder weiteren Rechteinhabern unterliegen. Die Nutzung als externe Vorschau überträgt keine Bildrechte an dieses Projekt. Die Lizenz- und Nutzungshinweise von Duckipedia sind separat zu beachten.`
  );

  await replaceOnce("README.md", "# Entenarchiv 4.5.2", "# Entenarchiv 4.5.3");
  await replaceOnce(
    "README.md",
    "Entenarchiv ist eine private, offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderreihen. Version 4.5.2 ist ein gezielter **UI-Polish für Dashboard, Share Cards und Kalender** auf Basis des Design-Systems von 4.5.1.",
    "Entenarchiv ist eine private, offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderreihen. Version 4.5.3 ist ein technischer **Core-Cleanup ohne Datenmigration**. Datenformat und IndexedDB-Schema bleiben unverändert."
  );
  await replaceOnce(
    "README.md",
    "## Neu in 4.5.2",
    `## Neu in 4.5.3\n\n- statische App-Dateien werden nach der Installation cache-first geladen; Navigation, Versions- und Kalenderdaten bleiben frisch\n- das 1024er App-Icon und der doppelte Root-Einstieg wurden aus dem Core-Precache entfernt\n- Collection-Refreshes rendern schwere Unterseiten und die Statistik nur noch, wenn sie tatsächlich sichtbar sind\n- Scanner- und Share-Card-Module werden erst bei tatsächlicher Nutzung dynamisch geladen\n- Bulk-Änderungen laufen über einen gemeinsamen Storage-Batch statt über viele einzelne Save-Zyklen\n- veraltete Duckipedia-Cache-Einträge werden beim Start automatisch nach der konfigurierten TTL entfernt\n- private Backups/Exporte und generiertes dist sind vor versehentlichen Commits geschützt\n- fest verdrahtete 2026er Kalender-URL als Default entfernt; Jahrespläne kommen über den Kalenderindex\n- keine Datenmigration; Datenformat 9, Archivmodell 1 und IndexedDB-Schema 5 bleiben unverändert\n\n## Neu in 4.5.2`
  );
  await replaceOnce(
    "README.md",
    `- Für Share Cards werden weder Sammlungsdaten noch Bilder an einen externen Dienst übertragen.\n- Regelmäßige JSON- und Medien-Backups bleiben notwendig.`,
    `- Für Share Cards werden weder Sammlungsdaten noch Bilder an einen externen Dienst übertragen.\n- Eigene Coverfotos werden lokal komprimiert in IndexedDB gespeichert und nicht in das GitHub-Repository hochgeladen.\n- Cover-Priorität: eigenes Foto → optionale Duckipedia-Remotevorschau → Platzhalter.\n- Duckipedia-Vorschaubilder werden nur bei Bedarf extern geladen und nicht in den Entenarchiv-Service-Worker-Cache übernommen.\n- Medien-Backups enthalten eigene Coverfotos und gehören deshalb nicht in das öffentliche Repository.\n- Regelmäßige JSON- und Medien-Backups bleiben notwendig.`
  );
  await replaceOnce("README.md", "- App-Version: `4.5.2`", "- App-Version: `4.5.3`");
  await replaceOnce("README.md", "- keine Datenmigration von 4.4.0 erforderlich", "- keine Datenmigration für 4.5.3 erforderlich");
  await replaceOnce("README.md", "- Service-Worker-Cache: `v4-5-2`", "- Service-Worker-Cache: `v4-5-3`");

  await replaceOnce(
    "CHANGELOG.md",
    `# Änderungen\n\n## 4.5.2 – Dashboard-, Share-Card- und Kalender-Polish`,
    `# Änderungen\n\n## 4.5.3 – Core Cleanup\n### Performance\n- statische App-Assets laufen nach Installation cache-first; Navigation, Versionsdatei und Kalenderdaten bleiben network-first\n- 1024er Icon und doppelter Root-Einstieg aus dem Core-Precache entfernt\n- schwere Collection-Unterseiten und die Statistik rendern nur noch, wenn sie sichtbar sind\n- Scanner und Share Cards werden als echte On-Demand-Module dynamisch geladen\n- Bulk-Speicherpfad bündelt Änderungen in einer IndexedDB-Transaktion\n\n### Datenhygiene\n- Duckipedia-Metadaten-Cache wird anhand der bestehenden 90-Tage-TTL automatisch bereinigt\n- feste 2026er Kalender-URL aus den Defaults entfernt; der Kalenderindex ist die Quelle für Jahrespläne\n- private Backups/Exporte und generiertes dist werden über .gitignore geschützt\n- Duckipedia-Nutzung in den Drittanbieterhinweisen dokumentiert\n\n### Technik\n- App-Version und Service-Worker-Cache auf 4.5.3 angehoben\n- Datenformat bleibt Version 9\n- Archivmodell bleibt Version 1\n- IndexedDB-Schema bleibt Version 5\n- keine Datenmigration erforderlich\n- zusätzliche Regressionstests für Cache-, Render-, Batch- und Repo-Hygiene\n\n## 4.5.2 – Dashboard-, Share-Card- und Kalender-Polish`
  );

  if (existsSync(resolve(root, ".git"))) {
    try {
      execFileSync("git", ["rm", "-r", "--cached", "--ignore-unmatch", "dist"], { cwd: root, stdio: "inherit" });
    } catch (error) {
      console.warn("Hinweis: dist konnte nicht automatisch aus dem Git-Index entfernt werden. Bitte manuell 'git rm -r --cached dist' ausführen.");
    }
  }

  console.log("\n✓ Entenarchiv 4.5.3 Core-Cleanup angewendet.");
  console.log(`✓ Geänderte/ergänzte Dateien: ${changed.length}`);
  changed.forEach((file) => console.log(`  - ${file}`));
  console.log("\nAls Nächstes im Repository ausführen:");
  console.log("  npm run ci");
  console.log("  git status");
}

main().catch((error) => {
  console.error(`\nCleanup abgebrochen: ${error.message}`);
  process.exitCode = 1;
});
