# Entenarchiv 4.5.3

Entenarchiv ist eine private, offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderreihen. Version 4.5.3 ist ein technischer **Core-Cleanup ohne Datenmigration**. Datenformat und IndexedDB-Schema bleiben unverändert.


## Neu in 4.5.3

- statische App-Dateien werden nach der Installation cache-first geladen; Navigation, Versions- und Kalenderdaten bleiben frisch
- das 1024er App-Icon und der doppelte Root-Einstieg wurden aus dem Core-Precache entfernt
- Collection-Refreshes rendern schwere Unterseiten und die Statistik nur noch, wenn sie tatsächlich sichtbar sind
- Bulk-Änderungen laufen über einen gemeinsamen Storage-Batch statt über viele einzelne Save-Zyklen
- veraltete Duckipedia-Cache-Einträge werden beim Start automatisch nach der konfigurierten TTL entfernt
- private Backups/Exporte und generiertes dist sind vor versehentlichen Commits geschützt
- fest verdrahtete 2026er Kalender-URL als Default entfernt; Jahrespläne kommen über den Kalenderindex
- keine Datenmigration; Datenformat 9, Archivmodell 1 und IndexedDB-Schema 5 bleiben unverändert

## Neu in 4.5.2

- Dashboard mit bewusst voller Fehlband-Zeile statt einer verlorenen Einzelkachel
- Sammelziel und Neuerscheinung mit identischen gelben SVG-Icons, Größen und Strichstärken
- kompaktere Sammelziel-Karte ohne sichtbare redundante Dachzeile
- Neuerscheinungs-Karte priorisiert Titel und Datum statt Zähler
- redundante Dachzeilen über „Meine Sammlung“ und „Fehlende Bände“ entfernt
- JSON-Backup ist wieder gleich breit wie die übrigen Exportaktionen
- größeres, sauber ausgerichtetes Entenarchiv-Icon im Startseiten-Header
- Share-Card-Dialog berücksichtigt iOS-Safe-Areas; Share Cards erhalten ein handgezeichnetes Archiv-/Bücherregal-Motiv
- Sammlungs-DNA bricht lange Texte früher um und hält Abstand zum Navigationspfeil
- Meilensteine besitzen fünf visuelle Seltenheitsstufen von dezent bis legendär
- Kalender grundlegend entschlackt: Jahr/Monat/Termine zuerst, Suche und Verwaltung in diskreten aufklappbaren Werkzeugen
- keine Datenmigration; Datenformat, Archivmodell und IndexedDB bleiben unverändert

## Neu in 4.5.0

### Wunschlisten-Prioritäten

Fehlende Bände können optional markiert werden als:

- **Gesucht** – höchste Priorität
- **Mitnehmen** – interessant, wenn Zustand und Gelegenheit passen
- **Irgendwann** – ohne Zeitdruck
- **Ignorieren** – nicht Teil der aktiven Suche

Die Priorität ist in Fehlbanddetails, Erscheinungsradar und Flohmarkt-Modus verfügbar. Der Flohmarkt-Modus sortiert zuerst nach Reihe und innerhalb der Reihe nach Suchpriorität. CSV- und kompakter PDF-Export übernehmen die Priorität ebenfalls.

### Nächstes Sammelziel

Auf dem Dashboard gibt es genau eine kompakte Missionskarte. Entenarchiv wählt automatisch ein sinnvolles nächstes Ziel, zum Beispiel:

- eine Reihe mit nur noch ein bis drei fehlenden Zielbänden,
- einen als **Gesucht** markierten Fehlband,
- den nächsten 50/75/90/100-Prozent-Schritt der Hauptreihe,
- eine offene aktive Lücke.

Ein Tap führt direkt zur passenden Fehlbandansicht. Die Startseite erhält dadurch keine zusätzliche lange Aufgabenliste.

### Meilensteine

Entenarchiv berechnet Meilensteine lokal aus der Sammlung, unter anderem:

- 100 / 250 / 500 / 750 / 1.000 physische Exemplare,
- 50 / 75 / 90 / 100 Prozent der Hauptreihe bei festgelegtem Ziel,
- vollständig erreichte Reihen mit festgelegtem Ziel.

Beim ersten Start von 4.5 werden bereits erreichte Meilensteine still als bekannt markiert. Nur künftig neu erreichte Meilensteine erscheinen kurz als dezente Meldung. Die vollständige Historie liegt eingeklappt auf der Statistikseite.

### Share Cards

Auf der Statistikseite lassen sich feste Editorial-Templates lokal als PNG erzeugen:

- **Meine Sammlung**
- **Hauptreihe**
- **Meilenstein**
- **Sammlungs-DNA**

Die Gestaltung verwendet den Entenarchiv-Farbraum, klare Typografie, Druckraster und feste Layoutregeln. Es werden ausschließlich lokale Sammlungsdaten verwendet. Die Karte kann über das iOS-Teilen-Menü geteilt oder als PNG gespeichert werden.

## Datenschutz und Speicherung

- Alle Sammlungsdaten bleiben lokal in IndexedDB.
- Prioritäten und Meilensteinstatus sind Bestandteil der App-Einstellungen und damit des JSON-Backups.
- Share Cards werden vollständig lokal auf dem Gerät gerendert.
- Für Share Cards werden weder Sammlungsdaten noch Bilder an einen externen Dienst übertragen.
- Eigene Coverfotos werden lokal komprimiert in IndexedDB gespeichert und nicht in das GitHub-Repository hochgeladen.
- Cover-Priorität: eigenes Foto → optionale Duckipedia-Remotevorschau → Platzhalter.
- Duckipedia-Vorschaubilder werden nur bei Bedarf extern geladen und nicht in den Entenarchiv-Service-Worker-Cache übernommen.
- Medien-Backups enthalten eigene Coverfotos und gehören deshalb nicht in das öffentliche Repository.
- Regelmäßige JSON- und Medien-Backups bleiben notwendig.

## Technische Eckdaten

- App-Version: `4.5.3`
- Datenformat: `9`
- Archivmodell: `1`
- IndexedDB-Schema: `5`
- keine Datenmigration für 4.5.3 erforderlich
- neue Module `collector-goals.js` und `share-cards.js`
- Service-Worker-Cache: `v4-5-3`
- Scanner- und PDF-Bibliothek weiterhin nur bei Bedarf geladen
- GitHub Pages mit vorgeschalteter GitHub-Actions-Prüfung

## Projektstruktur

```text
Entenarchiv/
├── index.html
├── style.css
├── app.js
├── archive-model.js
├── collector-goals.js
├── share-cards.js
├── statistics-dna.js
├── release-radar.js
├── calendar.js
├── scanner.js
├── scanner-pro.js
├── condition-assistant.js
├── shelf.js
├── shelf-ui.js
├── storage.js
├── export.js
├── service-worker.js
├── data/
├── tests/
├── scripts/
└── .github/workflows/
```

## Qualitätsprüfung

```bash
npm run check
npm run calendar:verify
npm run build
```

GitHub Actions führt die Prüfungen nach jedem Commit aus und veröffentlicht nur eine erfolgreiche Version.
