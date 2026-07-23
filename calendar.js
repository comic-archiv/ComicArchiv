const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export const CALENDAR_CATALOG_URL = "./data/kalender-index.json";

export function getMonthName(monthIndex) {
  return MONTH_NAMES[monthIndex] || "";
}

export function createCalendarEventId(prefix = "event") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeCalendarCatalog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Der Kalenderindex ist ungültig.");
  }

  const calendars = Array.isArray(value.calendars) ? value.calendars : [];
  const normalized = calendars
    .map(normalizeCalendarCatalogEntry)
    .filter(Boolean)
    .sort((a, b) => a.year - b.year || a.label.localeCompare(b.label, "de"));

  if (!normalized.length) {
    throw new Error("Im Kalenderindex sind keine gültigen Jahrespläne hinterlegt.");
  }

  return {
    schemaVersion: Number.isSafeInteger(Number(value.schemaVersion)) ? Number(value.schemaVersion) : 1,
    updatedAt: normalizeDate(value.updatedAt) || "",
    calendars: normalized
  };
}

export function normalizeCalendarCatalogEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const year = Number(value.year);
  const file = normalizeLocalCalendarPath(value.file);
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2100 || !file) return null;

  const id = String(value.id || `ltb-${year}`).trim().slice(0, 120);
  return {
    id: id || `ltb-${year}`,
    year,
    label: String(value.label || `LTB Jahresplan ${year}`).trim().slice(0, 160),
    file,
    sourceUrl: normalizeOptionalUrl(value.sourceUrl),
    publisher: String(value.publisher || "Egmont Ehapa Media").trim().slice(0, 160),
    version: String(value.version || "1").trim().slice(0, 80),
    active: value.active !== false,
    notes: String(value.notes || "").trim().slice(0, 500)
  };
}

export function createCalendarCatalogSignature(entry) {
  const normalized = normalizeCalendarCatalogEntry(entry);
  if (!normalized) return "";
  return `${normalized.id}|${normalized.version}|${normalized.file}`;
}

export function normalizeCalendarEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const title = String(value.title || "").trim().slice(0, 200);
  const startDate = normalizeDate(value.startDate);
  if (!title || !startDate) return null;

  const endDate = normalizeDate(value.endDate) || startDate;
  const source = value.source === "publisher" ? "publisher" : "custom";
  const category = ["release", "flea-market", "comic-fair", "other"].includes(value.category)
    ? value.category
    : source === "publisher" ? "release" : "other";

  return {
    id: String(value.id || createCalendarEventId(source)).slice(0, 300),
    uid: String(value.uid || "").trim().slice(0, 500),
    title,
    startDate,
    endDate,
    allDay: value.allDay !== false,
    startTime: normalizeTime(value.startTime),
    endTime: normalizeTime(value.endTime),
    location: String(value.location || "").trim().slice(0, 300),
    notes: String(value.notes || value.description || "").trim().slice(0, 3000),
    url: normalizeOptionalUrl(value.url),
    source,
    sourceId: String(value.sourceId || "").trim().slice(0, 120),
    sourceVersion: String(value.sourceVersion || "").trim().slice(0, 80),
    sourceUrl: normalizeOptionalUrl(value.sourceUrl),
    sourceName: String(value.sourceName || (source === "publisher" ? "LTB Jahresplan" : "Eigener Termin")).trim().slice(0, 120),
    category,
    reminderEnabled: value.reminderEnabled !== false,
    createdAt: normalizeDateTime(value.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(value.updatedAt) || new Date().toISOString()
  };
}

export function parseIcsCalendar(text, options = {}) {
  const unfolded = unfoldIcsLines(String(text || ""));
  if (!unfolded.some((line) => line.trim().toUpperCase() === "BEGIN:VCALENDAR")) {
    throw new Error("Die Datei ist kein gültiger iCal-Kalender.");
  }

  const events = [];
  let current = null;

  unfolded.forEach((line) => {
    const normalizedLine = line.trim();
    if (normalizedLine === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (normalizedLine === "END:VEVENT") {
      if (!current) return;
      const event = createEventFromIcsProperties(current, options);
      if (event) events.push(event);
      current = null;
      return;
    }
    if (!current) return;

    const colonIndex = line.indexOf(":");
    if (colonIndex < 1) return;
    const left = line.slice(0, colonIndex);
    const rawValue = line.slice(colonIndex + 1);
    const [propertyName, ...parameterParts] = left.split(";");
    const property = propertyName.toUpperCase();
    const parameters = Object.fromEntries(parameterParts.map((part) => {
      const equalIndex = part.indexOf("=");
      if (equalIndex < 1) return [part.toUpperCase(), ""];
      return [part.slice(0, equalIndex).toUpperCase(), part.slice(equalIndex + 1)];
    }));
    if (!current[property]) current[property] = [];
    current[property].push({ value: rawValue, parameters });
  });

  if (events.length === 0) {
    throw new Error("In der iCal-Datei wurden keine Termine gefunden.");
  }
  return deduplicateCalendarEvents(events);
}

function createEventFromIcsProperties(properties, options) {
  const summary = decodeIcsText(firstValue(properties.SUMMARY));
  const startProperty = properties.DTSTART?.[0];
  if (!summary || !startProperty) return null;

  const start = parseIcsDateValue(startProperty.value, startProperty.parameters);
  if (!start) return null;
  const endProperty = properties.DTEND?.[0];
  const end = endProperty ? parseIcsDateValue(endProperty.value, endProperty.parameters) : null;
  const uid = decodeIcsText(firstValue(properties.UID));
  const sourceUrl = normalizeOptionalUrl(options.sourceUrl);
  const sourceName = String(options.sourceName || "LTB Jahresplan").trim().slice(0, 120);
  const sourceId = String(options.sourceId || "").trim().slice(0, 120);
  const sourceVersion = String(options.sourceVersion || "").trim().slice(0, 80);
  const now = new Date().toISOString();

  return normalizeCalendarEvent({
    id: uid ? `publisher-${uid}` : `publisher-${hashString(`${summary}-${start.date}`)}`,
    uid,
    title: summary,
    startDate: start.date,
    endDate: start.allDay && end?.date ? addDays(end.date, -1) : (end?.date || start.date),
    allDay: start.allDay,
    startTime: start.time,
    endTime: end?.time || "",
    location: decodeIcsText(firstValue(properties.LOCATION)),
    notes: decodeIcsText(firstValue(properties.DESCRIPTION)),
    url: normalizeOptionalUrl(decodeIcsText(firstValue(properties.URL))),
    source: "publisher",
    sourceId,
    sourceVersion,
    sourceUrl,
    sourceName,
    category: "release",
    reminderEnabled: true,
    createdAt: now,
    updatedAt: now
  });
}

export function mergePublisherCalendarEvents(existingEvents, importedEvents) {
  const normalizedExisting = (Array.isArray(existingEvents) ? existingEvents : []).map(normalizeCalendarEvent).filter(Boolean);
  const normalizedImported = (Array.isArray(importedEvents) ? importedEvents : []).map(normalizeCalendarEvent).filter(Boolean);
  const years = new Set(normalizedImported.map((event) => Number(event.startDate.slice(0, 4))).filter(Number.isFinite));

  const kept = normalizedExisting.filter((event) => {
    if (event.source !== "publisher") return true;
    const eventYear = Number(event.startDate.slice(0, 4));
    return !years.has(eventYear);
  });

  return deduplicateCalendarEvents([...kept, ...normalizedImported]);
}

export function removePublisherCalendarYear(events, year) {
  const targetYear = Number(year);
  return deduplicateCalendarEvents(events).filter((event) => {
    if (event.source !== "publisher") return true;
    return Number(event.startDate.slice(0, 4)) !== targetYear;
  });
}

export function deduplicateCalendarEvents(events) {
  const byKey = new Map();
  (Array.isArray(events) ? events : []).map(normalizeCalendarEvent).filter(Boolean).forEach((event) => {
    const key = event.uid
      ? `${event.source}:${event.uid}`
      : `${event.source}:${event.startDate}:${event.startTime}:${event.title.toLocaleLowerCase("de")}`;
    const previous = byKey.get(key);
    if (!previous || Date.parse(event.updatedAt) >= Date.parse(previous.updatedAt)) byKey.set(key, event);
  });
  return [...byKey.values()].sort(compareCalendarEvents);
}

export function compareCalendarEvents(a, b) {
  const dateCompare = a.startDate.localeCompare(b.startDate);
  if (dateCompare !== 0) return dateCompare;
  const timeCompare = String(a.startTime || "").localeCompare(String(b.startTime || ""));
  if (timeCompare !== 0) return timeCompare;
  return a.title.localeCompare(b.title, "de", { numeric: true, sensitivity: "base" });
}

export function getEventsForYear(events, year) {
  return deduplicateCalendarEvents(events).filter((event) => Number(event.startDate.slice(0, 4)) === Number(year));
}

export function getEventsForMonth(events, year, monthIndex) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return deduplicateCalendarEvents(events).filter((event) => event.startDate.startsWith(prefix));
}

export function filterCalendarEvents(events, { category = "all", query = "" } = {}) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("de");
  return deduplicateCalendarEvents(events).filter((event) => {
    if (category !== "all" && event.category !== category) return false;
    if (!normalizedQuery) return true;
    return [event.title, event.location, event.notes, event.sourceName]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("de").includes(normalizedQuery));
  });
}

export function buildCalendarIcs(events, options = {}) {
  const reminderTime = normalizeTime(options.reminderTime) || "09:00";
  const calendarName = escapeIcsText(options.calendarName || "Entenarchiv");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Entenarchiv//Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calendarName}`
  ];

  deduplicateCalendarEvents(events).forEach((event) => {
    const uid = event.uid || `${event.id}@entenarchiv.local`;
    const isTimedCustom = event.source === "custom" && event.allDay === false && event.startTime;
    const reminderEnabled = event.reminderEnabled !== false;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(uid)}`);
    lines.push(`DTSTAMP:${formatUtcTimestamp(new Date())}`);

    if (isTimedCustom) {
      lines.push(`DTSTART:${formatLocalDateTime(event.startDate, event.startTime)}`);
      lines.push(`DTEND:${formatLocalDateTime(event.endDate || event.startDate, event.endTime || addMinutes(event.startTime, 60))}`);
    } else if (options.timedReleaseReminders && event.source === "publisher") {
      lines.push(`DTSTART:${formatLocalDateTime(event.startDate, reminderTime)}`);
      lines.push(`DTEND:${formatLocalDateTime(event.startDate, addMinutes(reminderTime, 15))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${event.startDate.replaceAll("-", "")}`);
      const exclusiveEnd = addDays(event.endDate || event.startDate, 1);
      lines.push(`DTEND;VALUE=DATE:${exclusiveEnd.replaceAll("-", "")}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push(`CATEGORIES:${event.category === "release" ? "Neuerscheinung" : event.category === "flea-market" ? "Flohmarkt" : event.category === "comic-fair" ? "Comicbörse" : "Eigener Termin"}`);

    if (reminderEnabled) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeIcsText(event.title)}`);
      lines.push("TRIGGER:-PT0M");
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function formatCalendarDate(dateString, options = {}) {
  const date = parseLocalDate(dateString);
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: options.includeWeekday === false ? undefined : "short",
    day: "2-digit",
    month: options.includeMonth === false ? undefined : "2-digit",
    year: options.includeYear ? "numeric" : undefined
  }).format(date);
}

export function isToday(dateString) {
  const today = new Date();
  return dateString === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function getUpcomingEvents(events, fromDate = new Date(), limit = 3) {
  const start = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
  return deduplicateCalendarEvents(events).filter((event) => event.startDate >= start).slice(0, limit);
}

function firstValue(entries) {
  return Array.isArray(entries) && entries[0] ? entries[0].value : "";
}

function unfoldIcsLines(text) {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = [];
  rawLines.forEach((line) => {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  });
  return lines;
}

function parseIcsDateValue(value, parameters = {}) {
  const raw = String(value || "").trim();
  const isAllDay = parameters.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(raw);
  if (isAllDay) {
    const date = parseCompactDate(raw.slice(0, 8));
    return date ? { date, time: "", allDay: true } : null;
  }
  const match = raw.match(/^(\d{8})T(\d{2})(\d{2})(\d{2})?Z?$/);
  if (!match) return null;
  const date = parseCompactDate(match[1]);
  if (!date) return null;
  return { date, time: `${match[2]}:${match[3]}`, allDay: false };
}

function parseCompactDate(value) {
  if (!/^\d{8}$/.test(value)) return "";
  return normalizeDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
}

function decodeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const date = parseLocalDate(raw);
  if (!date) return "";
  const roundTrip = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return roundTrip === raw ? raw : "";
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return "";
  return raw;
}

function normalizeDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : "";
}

function normalizeOptionalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href.slice(0, 1200) : "";
  } catch {
    return "";
  }
}

function normalizeLocalCalendarPath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/");
  if (!path || path.includes("..") || /^(?:[a-z]+:)?\/\//i.test(path)) return "";
  const cleaned = path.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!cleaned.toLowerCase().endsWith(".ics")) return "";
  return `./${cleaned.slice(0, 500)}`;
}

function parseLocalDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(dateString, amount) {
  const date = parseLocalDate(dateString);
  if (!date) return dateString;
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMinutes(timeString, minutes) {
  const [hours, mins] = (normalizeTime(timeString) || "09:00").split(":").map(Number);
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatLocalDateTime(dateString, timeString) {
  return `${dateString.replaceAll("-", "")}T${timeString.replace(":", "")}00`;
}

function formatUtcTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
