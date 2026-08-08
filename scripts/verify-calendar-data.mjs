import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCalendarCatalog, parseIcsCalendar } from "../calendar.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "data/kalender-index.json");

async function main() {
  const rawCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const catalog = normalizeCalendarCatalog(rawCatalog);
  const activeCalendars = catalog.calendars.filter((entry) => entry.active !== false);

  if (!activeCalendars.length) {
    throw new Error("Im Kalenderindex ist kein aktiver Jahresplan hinterlegt.");
  }

  let totalEvents = 0;
  for (const entry of activeCalendars) {
    const filePath = resolve(root, entry.file);
    const text = await readFile(filePath, "utf8");
    const events = parseIcsCalendar(text, {
      sourceId: entry.id,
      sourceVersion: entry.version,
      sourceName: entry.label,
      sourceUrl: entry.sourceUrl
    });

    const wrongYear = events.filter((event) => Number(event.startDate.slice(0, 4)) !== entry.year);
    if (wrongYear.length) {
      throw new Error(`${entry.label} enthält ${wrongYear.length} Termin(e) außerhalb des Kalenderjahres ${entry.year}.`);
    }

    totalEvents += events.length;
    console.log(`✓ ${entry.label}: ${events.length} gültige Termine aus ${entry.file}`);
  }

  console.log(`✓ Kalenderdaten geprüft: ${activeCalendars.length} Jahresplan/Jahrespläne mit insgesamt ${totalEvents} Terminen`);
}

main().catch((error) => {
  console.error(`Kalenderprüfung fehlgeschlagen: ${error.stack || error.message}`);
  process.exitCode = 1;
});
