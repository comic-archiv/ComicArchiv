import { DEFAULT_SETTINGS, normalizeDuckipediaPattern } from "./config.js";

const DATABASE_NAME = "comicarchiv-db";
const DATABASE_VERSION = 4;
const COMICS_STORE = "comics";
const SETTINGS_STORE = "settings";
const COVER_STORE = "coverMedia";
const METADATA_STORE = "metadataCache";
const SETTINGS_KEY = "app";

let databasePromise;

function createDatabaseConnection() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Dieser Browser unterstützt die benötigte lokale Datenbank nicht."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(COMICS_STORE)) {
        const store = database.createObjectStore(COMICS_STORE, { keyPath: "id" });
        store.createIndex("series", "series", { unique: false });
        store.createIndex("numericBandNumber", "numericBandNumber", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(COVER_STORE)) {
        const coverStore = database.createObjectStore(COVER_STORE, { keyPath: "comicId" });
        coverStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: "key" });
        metadataStore.createIndex("fetchedAt", "fetchedAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };

      resolve(database);
    };

    request.onerror = () => {
      reject(request.error || new Error("Die lokale Datenbank konnte nicht geöffnet werden."));
    };

    request.onblocked = () => {
      reject(new Error("Die Datenbank-Aktualisierung ist blockiert. Bitte schließe andere geöffnete Sammlerhausen-Fenster."));
    };
  });
}

function getDatabase() {
  if (!databasePromise) {
    databasePromise = createDatabaseConnection().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Die Speicheroperation ist fehlgeschlagen."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Die Speichertransaktion ist fehlgeschlagen."));
    transaction.onabort = () => reject(transaction.error || new Error("Die Speichertransaktion wurde abgebrochen."));
  });
}

export async function getAllComics() {
  const database = await getDatabase();
  const transaction = database.transaction(COMICS_STORE, "readonly");
  const request = transaction.objectStore(COMICS_STORE).getAll();
  const comics = await requestToPromise(request);
  await transactionDone(transaction);
  return comics;
}

export async function saveComic(comic) {
  const database = await getDatabase();
  const transaction = database.transaction(COMICS_STORE, "readwrite");
  const request = transaction.objectStore(COMICS_STORE).put(comic);
  await requestToPromise(request);
  await transactionDone(transaction);
  return comic;
}

export async function deleteComic(id) {
  const database = await getDatabase();
  const transaction = database.transaction([COMICS_STORE, COVER_STORE], "readwrite");
  transaction.objectStore(COMICS_STORE).delete(id);
  transaction.objectStore(COVER_STORE).delete(id);
  await transactionDone(transaction);
}

export async function replaceAllComics(comics) {
  const database = await getDatabase();
  const transaction = database.transaction(COMICS_STORE, "readwrite");
  const store = transaction.objectStore(COMICS_STORE);
  store.clear();
  comics.forEach((comic) => store.put(comic));
  await transactionDone(transaction);
}

export async function upsertComics(comics) {
  const database = await getDatabase();
  const transaction = database.transaction(COMICS_STORE, "readwrite");
  const store = transaction.objectStore(COMICS_STORE);
  comics.forEach((comic) => store.put(comic));
  await transactionDone(transaction);
}

export async function getAppSettings() {
  const database = await getDatabase();
  const transaction = database.transaction(SETTINGS_STORE, "readonly");
  const storedRecord = await requestToPromise(
    transaction.objectStore(SETTINGS_STORE).get(SETTINGS_KEY)
  );
  await transactionDone(transaction);

  return normalizeSettings(storedRecord?.value);
}

export async function saveAppSettings(settings) {
  const normalizedSettings = normalizeSettings(settings);
  const database = await getDatabase();
  const transaction = database.transaction(SETTINGS_STORE, "readwrite");
  transaction.objectStore(SETTINGS_STORE).put({
    key: SETTINGS_KEY,
    value: normalizedSettings
  });
  await transactionDone(transaction);
  return normalizedSettings;
}

export async function getCoverMedia(comicId) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(COVER_STORE).get(comicId));
  await transactionDone(transaction);
  return record || null;
}

export async function saveCoverMedia(record) {
  if (!record?.comicId || !(record.blob instanceof Blob)) {
    throw new Error("Das Coverbild ist ungültig.");
  }

  const normalized = {
    comicId: String(record.comicId),
    blob: record.blob,
    mimeType: String(record.mimeType || record.blob.type || "image/jpeg"),
    size: Number(record.size || record.blob.size || 0),
    width: Number(record.width || 0),
    height: Number(record.height || 0),
    source: record.source === "import" ? "import" : "user",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
  };

  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  transaction.objectStore(COVER_STORE).put(normalized);
  await transactionDone(transaction);
  return normalized;
}

export async function deleteCoverMedia(comicId) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  transaction.objectStore(COVER_STORE).delete(comicId);
  await transactionDone(transaction);
}

export async function getAllCoverMedia() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const records = await requestToPromise(transaction.objectStore(COVER_STORE).getAll());
  await transactionDone(transaction);
  return records;
}

export async function replaceAllCoverMedia(records) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  const store = transaction.objectStore(COVER_STORE);
  store.clear();
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function upsertCoverMedia(records) {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  const store = transaction.objectStore(COVER_STORE);
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function clearAllCoverMedia() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readwrite");
  transaction.objectStore(COVER_STORE).clear();
  await transactionDone(transaction);
}

export async function getCoverMediaStats() {
  const database = await getDatabase();
  const transaction = database.transaction(COVER_STORE, "readonly");
  const store = transaction.objectStore(COVER_STORE);
  const stats = { count: 0, bytes: 0 };

  await new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error || new Error("Cover-Speicher konnte nicht ausgewertet werden."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const record = cursor.value;
      stats.count += 1;
      stats.bytes += Number(record.size || record.blob?.size || 0);
      cursor.continue();
    };
  });

  await transactionDone(transaction);
  return stats;
}

export async function getMetadataCache(key) {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readonly");
  const record = await requestToPromise(transaction.objectStore(METADATA_STORE).get(key));
  await transactionDone(transaction);
  return record || null;
}

export async function getAllMetadataCache() {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readonly");
  const records = await requestToPromise(transaction.objectStore(METADATA_STORE).getAll());
  await transactionDone(transaction);
  return records;
}

export async function saveMetadataCache(record) {
  if (!record?.key) {
    throw new Error("Der Metadaten-Schlüssel fehlt.");
  }
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  transaction.objectStore(METADATA_STORE).put(record);
  await transactionDone(transaction);
  return record;
}

export async function replaceMetadataCache(records) {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  const store = transaction.objectStore(METADATA_STORE);
  store.clear();
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function upsertMetadataCache(records) {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  const store = transaction.objectStore(METADATA_STORE);
  records.forEach((record) => store.put(record));
  await transactionDone(transaction);
}

export async function clearMetadataCache() {
  const database = await getDatabase();
  const transaction = database.transaction(METADATA_STORE, "readwrite");
  transaction.objectStore(METADATA_STORE).clear();
  await transactionDone(transaction);
}

function normalizeSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const customSeries = Array.isArray(source.customSeries)
    ? source.customSeries
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim().slice(0, 100))
    : [];

  const customSeriesConfigs = normalizeCustomSeriesConfigs(source.customSeriesConfigs, customSeries);

  const knownHighestBandBySeries = {};
  const knownSource = source.knownHighestBandBySeries;

  if (knownSource && typeof knownSource === "object" && !Array.isArray(knownSource)) {
    Object.entries(knownSource).forEach(([series, value]) => {
      if (typeof series !== "string" || !series.trim()) return;
      const parsedValue = Number(value);
      if (Number.isSafeInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 99999) {
        knownHighestBandBySeries[series.trim().slice(0, 100)] = parsedValue;
      }
    });
  }

  const missingBandDetails = {};
  const detailSource = source.missingBandDetails;

  if (detailSource && typeof detailSource === "object" && !Array.isArray(detailSource)) {
    Object.entries(detailSource).forEach(([key, value]) => {
      if (typeof key !== "string" || !key || !value || typeof value !== "object" || Array.isArray(value)) return;
      const publicationYear = value.publicationYear === null || value.publicationYear === undefined || value.publicationYear === ""
        ? null
        : Number(value.publicationYear);

      missingBandDetails[key.slice(0, 500)] = {
        title: typeof value.title === "string" ? value.title.trim().slice(0, 200) : "",
        publicationYear: Number.isInteger(publicationYear) && publicationYear >= 1800 && publicationYear <= 2035
          ? publicationYear
          : null,
        desiredCondition: typeof value.desiredCondition === "string" ? value.desiredCondition.slice(0, 10) : "",
        notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 2000) : "",
        duckipediaUrl: normalizeOptionalUrl(value.duckipediaUrl),
        updatedAt: isValidDateString(value.updatedAt) ? value.updatedAt : null
      };
    });
  }

  const changesSinceBackup = Number(source.changesSinceBackup);
  const mediaChangesSinceBackup = Number(source.mediaChangesSinceBackup);
  const lastBackupComicCount = Number(source.lastBackupComicCount);

  return {
    theme: source.theme === "light" ? "light" : DEFAULT_SETTINGS.theme,
    lastBackupAt: isValidDateString(source.lastBackupAt) ? source.lastBackupAt : null,
    lastMediaBackupAt: isValidDateString(source.lastMediaBackupAt) ? source.lastMediaBackupAt : null,
    customSeries: [...new Set(customSeriesConfigs.map((entry) => entry.name))],
    customSeriesConfigs,
    knownHighestBandBySeries,
    missingBandDetails,
    fleaMarketSession: normalizeFleaMarketSession(source.fleaMarketSession),
    changesSinceBackup: Number.isSafeInteger(changesSinceBackup) && changesSinceBackup >= 0
      ? Math.min(changesSinceBackup, 999999)
      : 0,
    mediaChangesSinceBackup: Number.isSafeInteger(mediaChangesSinceBackup) && mediaChangesSinceBackup >= 0
      ? Math.min(mediaChangesSinceBackup, 999999)
      : 0,
    lastBackupComicCount: Number.isSafeInteger(lastBackupComicCount) && lastBackupComicCount >= 0
      ? Math.min(lastBackupComicCount, 999999)
      : 0,
    showCovers: source.showCovers !== false,
    duckipediaAutoEnrich: source.duckipediaAutoEnrich !== false
  };
}


function normalizeCustomSeriesConfigs(value, legacySeries = []) {
  const entries = Array.isArray(value) ? value : [];
  const normalized = [];

  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 100) : "";
    if (!name) return;
    const duckipediaPattern = normalizeDuckipediaPattern(entry.duckipediaPattern);
    normalized.push({ name, duckipediaPattern });
  });

  legacySeries.forEach((name) => {
    if (!normalized.some((entry) => entry.name.localeCompare(name, "de", { sensitivity: "base" }) === 0)) {
      normalized.push({ name, duckipediaPattern: "" });
    }
  });

  const deduplicated = [];
  normalized.forEach((entry) => {
    if (!deduplicated.some((item) => item.name.localeCompare(entry.name, "de", { sensitivity: "base" }) === 0)) {
      deduplicated.push(entry);
    }
  });
  return deduplicated;
}

function normalizeFleaMarketSession(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceItems = source.items && typeof source.items === "object" && !Array.isArray(source.items)
    ? source.items
    : {};
  const items = {};

  Object.entries(sourceItems).forEach(([key, item]) => {
    if (typeof key !== "string" || !key || !item || typeof item !== "object" || Array.isArray(item)) return;
    const series = typeof item.series === "string" ? item.series.trim().slice(0, 100) : "";
    const bandNumber = Number(item.bandNumber);
    const condition = typeof item.condition === "string" ? item.condition.slice(0, 10) : "VG";
    if (!series || !Number.isSafeInteger(bandNumber) || bandNumber < 1 || bandNumber > 99999) return;
    items[key.slice(0, 500)] = {
      series,
      bandNumber,
      condition,
      markedAt: isValidDateString(item.markedAt) ? item.markedAt : new Date().toISOString()
    };
  });

  return {
    items,
    updatedAt: isValidDateString(source.updatedAt) ? source.updatedAt : null
  };
}

function normalizeOptionalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 1000) : "";
  } catch (error) {
    return "";
  }
}

function isValidDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
