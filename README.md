# Entenarchiv 4.0.0

Entenarchiv ist eine private, mobile und offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderbänden.

Version 4.0.0 führt den neuen **Archivkern** ein. Reihen, Ausgaben und physische Exemplare werden intern nicht mehr als ein einziger Datensatz behandelt, sondern sauber voneinander getrennt. Die gewohnte Oberfläche bleibt dabei erhalten.

## Das neue Archivmodell

### Reihen

Jede Reihe besitzt eine dauerhafte interne ID. Der sichtbare Name kann geändert werden, ohne dass Verknüpfungen zu Ausgaben verloren gehen.

Beispiel:

```text
Reihen-ID: ltb-main
Name: Lustiges Taschenbuch
Duckipedia-Muster: LTB_{band}
```

Eigene Reihen erhalten ebenfalls eine stabile ID. Aliase und frühere Schreibweisen können dem gleichen Reiheneintrag zugeordnet werden.

### Ausgaben

Eine Ausgabe beschreibt den eigentlichen Band:

- Reihe
- Bandnummer
- Titel
- Erscheinungsjahr
- Duckipedia-Daten
- Coververknüpfung

Die Kombination aus Reihen-ID und Bandnummer ist eindeutig. Schreibweisen wie `1`, `01` und `001` werden bei rein numerischen Bandnummern als dieselbe Ausgabe erkannt.

### Physische Exemplare

Zustand, gelesen, foliert und exemplarbezogene Notizen liegen jetzt am jeweiligen physischen Exemplar. Eine Ausgabe kann beliebig viele Exemplare besitzen.

```text
LTB 239
├── Exemplar 1 · Zustand 1 · gelesen
├── Exemplar 2 · Zustand 2 · foliert
└── Exemplar 3 · Zustand 3 · Tauschbestand
```

Fehlbandberechnung, Reihenfortschritt und Ausgabenzähler zählen den Band weiterhin nur einmal. Statistiken zu physischen Büchern können dagegen alle Exemplare berücksichtigen.

## Verlustfreie Umstellung

Beim ersten Start nach dem Update:

1. wird der bisherige Datenstand gelesen,
2. wird lokal ein Rückfall-Schnappschuss angelegt,
3. erhalten Reihen stabile IDs,
4. werden doppelte Datensätze derselben Ausgabe zusammengeführt,
5. werden vorhandene Doppelstücke in einzelne Exemplare überführt,
6. werden eigene Cover auf die neue Ausgaben-ID umgehängt,
7. wird der neue Archivgraph validiert,
8. wird die kompatible Projektion für die bisherige Oberfläche erstellt.

Kann auch nur ein Eintrag nicht sicher zugeordnet werden, wird die Umstellung abgebrochen. Die bisherige Sammlung bleibt dann im Legacy-Speicher verfügbar und kann über den sicheren Modus exportiert werden.

Nach erfolgreicher Umstellung zeigt Entenarchiv einmalig einen Migrationsbericht. Er kann später unter **Export & Backup → Technische Speicherdetails** erneut geöffnet werden und enthält:

- bisherigen Einträgen,
- eindeutigen Ausgaben,
- physischen Exemplaren,
- verwendeten Reihen,
- zusammengeführten Altdubletten,
- übernommenen zusätzlichen Exemplaren.

## Exemplare verwalten

Über das Einstellungsmenü einer Comic-Karte steht **Exemplare verwalten** zur Verfügung. Dort lassen sich:

- beliebig viele Exemplare hinzufügen,
- Zustand pro Exemplar pflegen,
- gelesen und foliert pro Exemplar setzen,
- exemplarbezogene Notizen hinterlegen,
- zusätzliche Exemplare wieder entfernen.

Mindestens ein Exemplar bleibt immer erhalten.

## Schutz vor doppelten Ausgaben

Scanner, manuelle Erfassung, Flohmarkt-Modus und Backup-Import verwenden dieselbe Ausgabenidentität. Wird ein bereits vorhandener Band erneut erfasst, entsteht keine zweite Ausgabe. Stattdessen kann ein weiteres physisches Exemplar an die vorhandene Ausgabe angehängt werden.

## Backups in Version 4

JSON- und Medien-Backups enthalten nun zwei Darstellungen:

1. eine kompatible Comic-Liste für ältere Entenarchiv-Versionen und normale JSON-Werkzeuge,
2. den validierten Archivkern mit Reihen, Ausgaben und Exemplaren.

Beim Import ist der Archivkern die maßgebliche Darstellung. Backups aus älteren Versionen ohne Archivkern bleiben kompatibel und werden beim Import automatisch übertragen.

Medien-Backups enthalten weiterhin zusätzlich die eigenen Coverbilder.

## Diagnose und sicherer Modus

Die Sicherheitsfunktionen aus Version 3.9 bleiben vollständig enthalten. Die Diagnose zeigt jetzt getrennt:

- Anzahl Reihen,
- Anzahl Ausgaben,
- Anzahl physischer Exemplare,
- Zustand des Archivkerns,
- Archivmodell-Version,
- mögliche verwaiste oder doppelte Datensätze.

Der sichere Modus kann Version-4-Notfall-Backups direkt aus den neuen IndexedDB-Speichern erzeugen.

## Technische Daten

- App-Version: `4.0.0`
- Datenformat: `9`
- Archivmodell: `1`
- IndexedDB-Schema: `5`
- produktive Datenbank: `comicarchiv-db`
- Testdatenbank: `comicarchiv-db-test`

Neue IndexedDB-Speicher:

```text
seriesCatalog
issues
copies
archiveMeta
migrationSnapshots
```

Der bisherige Speicher `comics` bleibt als kompatible Projektion bestehen. Das reduziert das Risiko bei der Umstellung und erlaubt der bestehenden Oberfläche einen kontrollierten Übergang zur neuen Architektur.

## Projektstruktur

```text
Entenarchiv/
├── archive-model.js       # reines Datenmodell, Migration und Validierung
├── storage.js             # IndexedDB und kompatible Projektion
├── app.js                 # bestehende Oberfläche und Funktionssteuerung
├── export.js              # CSV, PDF, JSON und Archivkern-Backups
├── recovery.js            # sicherer Modus und Notfall-Backups
├── tests/                 # automatisierte Logik- und Strukturtests
└── .github/workflows/     # geprüfte GitHub-Pages-Veröffentlichung
```

## Qualitätsprüfung

```text
npm run check
```

prüft Struktur, Syntax, Datenmodell, Migration, Backup-Kompatibilität, Scannerlogik, Kalender und Offline-Dateien. Version 4.0.0 umfasst 40 automatisierte Logiktests. Zusätzlich wurde die vollständige Migration einer alten IndexedDB sowie der normale App-Start in einem realen Chromium-Browser geprüft.

```text
npm run build
```

erzeugt das bereinigte GitHub-Pages-Paket in `dist/`.

Für die normale Nutzung und Bearbeitung im GitHub-Browsereditor ist keine lokale Node.js-Installation erforderlich.


Ausführliche Informationen:

- `MIGRATION-V4.md` – Ablauf, Übertragungsregeln, Bericht und Wiederherstellung
- `QUALITY-REPORT.md` – automatisierte und reale Browserprüfungen
- `GITHUB-ACTIONS-SETUP.md` – geprüfte Veröffentlichung über GitHub Pages
