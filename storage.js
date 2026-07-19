import { DEFAULT_SETTINGS } from "./config.js";

const DATABASE_NAME = "comicarchiv-db";
const DATABASE_VERSION = 2;
const COMICS_STORE = "comics";
const SETTINGS_STORE = "settings";
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
      reject(new Error("Die Datenbank-Aktualisierung ist blockiert. Bitte schließe andere geöffnete ComicArchiv-Fenster."));
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
  const transaction = database.transaction(COMICS_STORE, "readwrite");
  const request = transaction.objectStore(COMICS_STORE).delete(id);
  await requestToPromise(request);
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

function normalizeSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const customSeries = Array.isArray(source.customSeries)
    ? source.customSeries
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim())
    : [];

  const knownHighestBandBySeries = {};
  const knownSource = source.knownHighestBandBySeries;

  if (knownSource && typeof knownSource === "object" && !Array.isArray(knownSource)) {
    Object.entries(knownSource).forEach(([series, value]) => {
      if (typeof series !== "string" || !series.trim()) {
        return;
      }

      const parsedValue = Number(value);
      if (Number.isSafeInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 99999) {
        knownHighestBandBySeries[series.trim()] = parsedValue;
      }
    });
  }

  return {
    theme: source.theme === "light" ? "light" : DEFAULT_SETTINGS.theme,
    lastBackupAt: isValidDateString(source.lastBackupAt) ? source.lastBackupAt : null,
    customSeries: [...new Set(customSeries)],
    knownHighestBandBySeries
  };
}

function isValidDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
