import test from "node:test";
import assert from "node:assert/strict";
import {
  compareCalendarCandidates,
  deriveCalendarVersion,
  extractIcsLinks,
  inferCalendarYear,
  mergeCalendarCatalog,
  validateIcs
} from "../scripts/sync-release-calendars.mjs";

const ics = (year) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${year}0102\r\nSUMMARY:LTB 1\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

test("offizielle relative und absolute iCal-Links werden gefunden", () => {
  const html = `
    <a href="/sites/default/files/2025-11/ltb_evt_2026v2.ics">2026</a>
    <a href='https://www.lustiges-taschenbuch.de/files/ltb_evt_2027.ics?download=1'>2027</a>
    <a href="https://example.com/fremd.ics">fremd</a>
    <a href="http://www.lustiges-taschenbuch.de/unsicher.ics">http</a>`;
  assert.deepEqual(extractIcsLinks(html), [
    "https://www.lustiges-taschenbuch.de/sites/default/files/2025-11/ltb_evt_2026v2.ics",
    "https://www.lustiges-taschenbuch.de/files/ltb_evt_2027.ics?download=1"
  ]);
});

test("Kalenderjahr wird aus den häufigsten DTSTART-Werten ermittelt", () => {
  const mixed = `${ics(2026)}\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20260203\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20270101\nEND:VEVENT\n`;
  assert.equal(inferCalendarYear(mixed), 2026);
  assert.equal(inferCalendarYear("BEGIN:VCALENDAR\nEND:VCALENDAR"), null);
});

test("explizite v2-Dateien gewinnen vor v1 und Hash-Versionen", () => {
  assert.equal(deriveCalendarVersion("https://www.lustiges-taschenbuch.de/ltb_evt_2026v2.ics", ics(2026)), "v2");
  assert.match(deriveCalendarVersion("https://www.lustiges-taschenbuch.de/ltb_evt_2026.ics", ics(2026)), /^sha-[a-f0-9]{12}$/);
  const candidates = [
    { version: "v1", sourceUrl: "https://www.lustiges-taschenbuch.de/a.ics" },
    { version: "v2", sourceUrl: "https://www.lustiges-taschenbuch.de/b.ics" }
  ].sort(compareCalendarCandidates);
  assert.equal(candidates[0].version, "v2");
});

test("Kalenderkatalog ersetzt nur entdeckte Jahre und bewahrt andere Jahrgänge", () => {
  const catalog = {
    schemaVersion: 1,
    discovery: { pageUrl: "https://www.lustiges-taschenbuch.de/downloads" },
    calendars: [
      { year: 2025, version: "v1", file: "data/ltb-2025.ics" },
      { year: 2026, version: "v1", file: "data/ltb-2026.ics" }
    ]
  };
  const next = mergeCalendarCatalog(catalog, [{ year: 2026, version: "v2", file: "data/ltb-2026.ics" }], "2026-08-08");
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.updatedAt, "2026-08-08");
  assert.deepEqual(next.calendars.map((entry) => [entry.year, entry.version]), [[2025, "v1"], [2026, "v2"]]);
  assert.ok(next.discovery.allowedHosts.includes("www.lustiges-taschenbuch.de"));
});

test("nur vollständige iCal-Dateien mit Termin und DTSTART werden akzeptiert", () => {
  assert.equal(validateIcs(ics(2026)), true);
  assert.equal(validateIcs("BEGIN:VCALENDAR\nEND:VCALENDAR"), false);
  assert.equal(validateIcs("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR"), false);
});
