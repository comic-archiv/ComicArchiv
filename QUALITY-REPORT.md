# Qualitätsbericht Entenarchiv 4.0.0

Prüfdatum: 7. August 2026

## Ergebnis

Das ausgelieferte Projekt hat alle automatisierten Struktur-, Syntax- und Logikprüfungen bestanden. Zusätzlich wurden der normale App-Start und die vollständige Migration einer alten IndexedDB in einem realen Chromium-Browser ausgeführt.

## Automatisierte Projektprüfung

Erfolgreich geprüft wurden:

- 26 erforderliche Projekt- und Laufzeitdateien,
- konsistente App-Version `4.0.0`, Datenformat-Version `9` und Archivmodell-Version `1`,
- 358 eindeutige HTML-IDs,
- 300 statische JavaScript-Ziele auf vorhandene HTML-Elemente,
- 26 vom Service Worker referenzierte Offline-Dateien,
- Syntax von 40 JavaScript-Dateien,
- bedarfsgeladenes Scanner- und PDF-Modul,
- Diagnose, sicherer Modus und getrennte Testdatenbank,
- Einbindung von Archivkern, Migrationsbericht und Version-4-Backupformat,
- erfolgreiches Produktionspaket mit 22 Laufzeit-Einträgen,
- HTTP-Abruf aller 31 erzeugten Dateien des Produktionspakets ohne Fehler.

## 40 automatisierte Logiktests

Alle 40 Tests wurden erfolgreich abgeschlossen. Abgedeckt sind insbesondere:

- Migration alter Comic-Datensätze in Reihen, Ausgaben und Exemplare,
- stabile IDs für Standardreihen und eigene Reihen,
- Ausgabeidentität über Reihen-ID und normalisierte Bandnummer,
- Zusammenführung mehrfach angelegter Ausgaben,
- Erhalt beliebig vieler physischer Exemplare,
- eindeutige Exemplar-IDs auch bei identischem Zustand,
- Schutz vor verwaisten Exemplaren und Ausgaben ohne Exemplar,
- Erhalt dritter und weiterer Exemplare beim Bearbeiten,
- CSV-Export mit einer Zeile pro physischem Exemplar,
- Version-4-Backups mit validiertem Archivkern,
- Import älterer Backups ohne Archivkern,
- Ablehnung eines unbekannten neueren Archivmodells,
- Cover-ID-Zuordnung beim Zusammenführen,
- Fehlbandberechnung mit mehrfachen Exemplaren,
- Kalenderimport mit 100 Verlagsterminen,
- Schutz vor ungültigem Kalenderjahr `0`,
- Apple-Kalender-Erinnerungen,
- Zustandstransformation des früheren Rasters,
- Duckipedia-Pfade mit Umlauten,
- Barcode-Zusatzcodes `03` und `00239`,
- Service-Worker-Struktur und kritisches Offline-Paket.

## Reale Browserprüfung der Migration

In einem frischen Chromium-Profil wurde eine Datenbank im bisherigen Schema 4 angelegt und mit folgenden Altdaten befüllt:

- zwei Datensätze für dieselbe Ausgabe `LTB 239`,
- insgesamt drei physische Exemplare,
- ein eigenes Coverbild,
- bestehende Einstellungen.

Beim Laden von Version 4 wurde erfolgreich geprüft:

- Upgrade der IndexedDB auf Schema 5,
- Zusammenführung zu genau einer Ausgabe,
- Erhalt aller drei physischen Exemplare,
- Zuordnung zur stabilen Reihen-ID `ltb-main`,
- Anlage eines lokalen Rückfall-Schnappschusses,
- Umhängung des Coverbildes auf die neue Ausgaben-ID,
- erneutes Erfassen von LTB 239 als viertes Exemplar ohne zweite Ausgabe.

Ergebnis des Browserlaufs:

```json
{
  "ok": true,
  "issueId": "legacy-239-a",
  "seriesId": "ltb-main",
  "issues": 1,
  "copies": 4,
  "remappedCovers": 1,
  "snapshot": true
}
```

## Reale Browserprüfung des normalen Starts

Die vollständige App wurde aus dem erzeugten `dist/`-Produktionspaket in einem neuen Browserprofil mit leerer Testdatenbank geladen. Erfolgreich geprüft wurden:

- sichtbare Versionsnummer `v4.0.0`,
- abgeschlossener App-Start,
- kein geöffneter sicherer Modus,
- keine JavaScript-Ausnahme,
- kein Fehler im Browserprotokoll,
- erfolgreicher Aufbau eines leeren Archivkerns mit `0 Ausgaben · 0 Exemplare · 28 Reihen`.

## Sicherheitsverhalten

- Vor der ersten Migration wird ein lokaler Daten-Schnappschuss angelegt.
- Der neue Archivgraph wird vor der Aktivierung vollständig validiert.
- Unsicher zuordenbare Altdaten werden nicht still verworfen.
- Ein fehlerhafter Archivkern fällt auf den kompatiblen Legacy-Speicher zurück.
- JSON-Backups enthalten weiterhin eine lesbare Kompatibilitätsdarstellung und zusätzlich den validierten Archivkern.
- Der sichere Modus kann Notfall-Backups auch bei gestörtem normalen App-Start erzeugen.

## Noch auf dem Zielgerät zu prüfen

Folgende Funktionen hängen vom konkreten iPhone, der installierten iOS-Version und dem tatsächlichen Home-Screen-PWA-Kontext ab und müssen nach der Veröffentlichung praktisch getestet werden:

- IndexedDB-Migration der realen Sammlung,
- Wechsel des Service Workers von Version 3.9 auf 4.0,
- Kamera und Serien-Scanner,
- iOS-Teilen-Menü für JSON, CSV, PDF und Kalenderdateien,
- Aufnahme und Anzeige eigener Coverbilder,
- Offline-Start der installierten Home-Screen-App,
- Verhalten bei Speicherdruck auf dem Gerät.

Dafür liegt eine konkrete Prüfliste in der separaten Update-Anleitung bei.
