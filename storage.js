const DATABASE_NAME = "comicarchiv-db";
const DATABASE_VERSION = 1;
const COMICS_STORE = "comics";

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
    };

    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => {
        database.close();
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

export async function getAllComics() {
  const database = await getDatabase();
  const transaction = database.transaction(COMICS_STORE, "readonly");
  const request = transaction.objectStore(COMICS_STORE).getAll();
  const comics = await requestToPromise(request);

  return comics.sort((first, second) => {
    const seriesComparison = first.series.localeCompare(second.series, "de");

    if (seriesComparison !== 0) {
      return seriesComparison;
    }

    const firstNumber = first.numericBandNumber ?? Number.POSITIVE_INFINITY;
    const secondNumber = second.numericBandNumber ?? Number.POSITIVE_INFINITY;

    if (firstNumber !== secondNumber) {
      return firstNumber - secondNumber;
    }

    return first.volumeNumber.localeCompare(second.volumeNumber, "de", { numeric: true });
  });
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

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Die Speichertransaktion ist fehlgeschlagen."));
    transaction.onabort = () => reject(transaction.error || new Error("Die Speichertransaktion wurde abgebrochen."));
  });
}
