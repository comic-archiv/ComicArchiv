// Pure/portable helpers extracted from app.js. Keep this module DOM-state free.

export function parseStrictPositiveInteger(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0 && parsedValue <= 99999
    ? parsedValue
    : null;
}

export function createStableId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `comic-${Date.now()}-${randomPart}`;
}

export function compareSeriesAndBand(first, second) {
  return compareSeries(first, second) || compareBandNumbers(first, second);
}

export function compareSeries(first, second) {
  return String(first.series).localeCompare(String(second.series), "de", { sensitivity: "base" });
}

export function compareBandNumbers(first, second) {
  const firstNumber = Number.isSafeInteger(first.numericBandNumber)
    ? first.numericBandNumber
    : Number.POSITIVE_INFINITY;
  const secondNumber = Number.isSafeInteger(second.numericBandNumber)
    ? second.numericBandNumber
    : Number.POSITIVE_INFINITY;

  if (firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return String(first.volumeNumber).localeCompare(String(second.volumeNumber), "de", {
    numeric: true,
    sensitivity: "base"
  });
}

export function compareOptionalText(firstValue, secondValue) {
  const first = String(firstValue || "").trim();
  const second = String(secondValue || "").trim();

  if (!first && second) {
    return 1;
  }

  if (first && !second) {
    return -1;
  }

  return first.localeCompare(second, "de", { sensitivity: "base", numeric: true });
}

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .trim();
}

export function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function normalizeHttpUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

export function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatEntryCount(count) {
  return count === 1 ? "1 Eintrag" : `${count} Einträge`;
}

export function formatDiagnosticDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Zeitpunkt unbekannt"
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
}
