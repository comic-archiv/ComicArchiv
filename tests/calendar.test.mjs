import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCalendarIcs,
  mergePublisherCalendarEvents,
  normalizeCalendarCatalog,
  normalizeCalendarEvent,
  parseIcsCalendar
} from "../calendar.js";

test("Der lokale Jahresplan 2026 lässt sich vollständig einlesen", async () => {
  const text = await readFile(new URL("../data/ltb-2026.ics", import.meta.url), "utf8");
  const events = parseIcsCalendar(text, {
    sourceId: "ltb-2026",
    sourceVersion: "v2",
    sourceName: "LTB Jahresplan 2026"
  });
  const rawEventCount = (text.match(/^\s*BEGIN:VEVENT\s*$/gm) || []).length;
  assert.ok(rawEventCount > 0);
  assert.equal(events.length, rawEventCount);
  assert.ok(events.every((event) => event.source === "publisher"));
  assert.ok(events.every((event) => event.startDate.startsWith("2026-")));
});

test("Kalenderindex lehnt Jahr 0 und unsichere Pfade ab", () => {
  const catalog = normalizeCalendarCatalog({
    schemaVersion: 1,
    calendars: [
      { year: 0, file: "./data/bad.ics" },
      { year: 2027, file: "../secret.ics" },
      { year: 2026, file: "data/ltb-2026.ics", label: "2026" }
    ]
  });
  assert.equal(catalog.calendars.length, 1);
  assert.equal(catalog.calendars[0].year, 2026);
});

test("Ein aktualisierter Verlagstermin ersetzt nur denselben Jahrgang", () => {
  const custom = normalizeCalendarEvent({
    id: "custom-1",
    title: "Flohmarkt",
    startDate: "2026-05-01",
    source: "custom",
    category: "flea-market"
  });
  const oldRelease = normalizeCalendarEvent({
    id: "publisher-old",
    uid: "release-1",
    title: "Alter Titel",
    startDate: "2026-03-01",
    source: "publisher"
  });
  const newRelease = normalizeCalendarEvent({
    id: "publisher-new",
    uid: "release-2",
    title: "Neuer Titel",
    startDate: "2026-03-02",
    source: "publisher"
  });
  const merged = mergePublisherCalendarEvents([custom, oldRelease], [newRelease]);
  assert.equal(merged.some((event) => event.title === "Flohmarkt"), true);
  assert.equal(merged.some((event) => event.title === "Alter Titel"), false);
  assert.equal(merged.some((event) => event.title === "Neuer Titel"), true);
});

test("Apple-Kalender-Export enthält eine Erinnerung", () => {
  const ics = buildCalendarIcs([
    normalizeCalendarEvent({
      id: "release-1",
      title: "LTB 700",
      startDate: "2027-01-15",
      source: "publisher",
      category: "release"
    })
  ], { timedReleaseReminders: true, reminderTime: "09:00" });
  assert.match(ics, /DTSTART:20270115T090000/);
  assert.match(ics, /BEGIN:VALARM/);
});
