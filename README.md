# Entenarchiv 4.6.4

Entenarchiv ist eine private, offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderreihen. Version 4.6.4 schaltet die **Runtime-Lesequelle auf den Archivgraphen um**: Die laufende Oberfläche lädt ihre Sammlung direkt aus `seriesCatalog`, `issues` und `copies` und liest nicht mehr aus dem persistierten Legacy-`comics`-Mirror.

## Neu in 4.6.4

- `seriesCatalog`, `issues` und `copies` sind die primäre Runtime-Lesequelle für die Sammlung.
- Das neue Modul `archive-runtime.js` erzeugt aus dem validierten Archivgraphen eine reine In-Memory-Kompatibilitätsansicht für bestehende UI-Komponenten.
- `refreshCollection()` verwendet `getArchiveRuntimeCollection()` und besitzt keinen Legacy-Lesefallback mehr.
- Der persistierte `comics`-Store bleibt in dieser Tranche nur noch als Write-Mirror für Rollback, alte Backups und Paritätskontrollen bestehen.
- Einzel- und Batch-Saves geben direkt die neue Runtime-Projektion zurück und materialisieren für den Hot Path nicht zusätzlich eine zweite UI-Projektion.
- Data Stack v2 zeigt bei erfolgreichem Start zusätzlich „Archivgraph aktiv“.
- Datenbankschema, Datenformat und gespeicherte Sammlungsdaten bleiben unverändert; es ist keine neue IndexedDB-Migration erforderlich.
- Der nächste Schritt entfernt die verbleibenden `comic`-förmigen UI-Verträge und danach den Live-Write-Mirror.

## Neu in 4.6.3

- Die sechs Settings-Stores werden zur aktiven Lesequelle der App.
- Alle 35 normalisierten Settings-Felder liegen nach dem Cutover als eigene Datensätze in ihrem fachlichen Store.
- `saveAppSettings()` vergleicht den aktuellen Zustand feldweise und schreibt nur tatsächlich geänderte Felder. Ein Wechsel des Kalendermonats schreibt beispielsweise nur `calendarSelectedMonth` statt Kalendertermine, Fehlbanddaten, Radarstatus und Backupzähler erneut zu speichern.
- Der bisherige Mega-`settings`-Datensatz wird beim Cutover eingefroren und bleibt als statischer Sicherheitsfallback erhalten, aber nicht mehr als Live-Mirror.
- Vor dem Cutover wird ein vollständiger `pre-settings-cutover-v1`-Snapshot angelegt.
- Vor der Aktivierung müssen Legacy-Settings, die 4.6.1-Spiegelung und der Archivgraph vollständig valide sein; anschließend werden alle aktiven Feld-Datensätze nochmals gegen den sicheren Ausgangsstand geprüft.
- Interne Archivpfade wie Speichern, Batch-Import und Reihenaufbau lesen nach dem Cutover ebenfalls die aktiven getrennten Einstellungen.
- Der Data-Stack-Status weist den erfolgreichen Zustand als „Einstellungen getrennt aktiv“ aus.
- Der Legacy-`comics`-Mirror bleibt in 4.6.3 weiterhin aktiv; dessen endgültige Ablösung folgt separat.

## Neu in 4.6.2

- Data Stack v2 erkennt den sicheren Reparaturfall: Archivgraph gültig, identische Ausgabe-IDs, aber abweichende Mirror-Inhalte.
- Vor der Reparatur wird ein `pre-legacy-mirror-repair-v1`-Snapshot aus Archivgraph, bisherigem Mirror und Einstellungen gespeichert.
- Nur der abgeleitete Legacy-Mirror wird neu materialisiert; `seriesCatalog`, `issues`, `copies`, Einstellungen und Cover bleiben unverändert.
- Fehlende oder zusätzliche Ausgabe-IDs werden weiterhin **nicht** automatisch repariert und stoppen die Foundation.
- Der Reparatur-Snapshot protokolliert, welche Felder in den abweichenden Mirror-Einträgen betroffen waren.
- Änderungen an Reihen-Definitionen aktualisieren künftig gleichzeitig die betroffenen Legacy-Mirror-Einträge und verhindern damit erneute Seriennamen-Desynchronisation.
- Settings Split bleibt in der sicheren Spiegelphase: Legacy-`settings` ist weiterhin aktiv, die sechs Schema-6-Stores werden parallel gepflegt.

## Neu in 4.6.1

- Einstellungen werden in `preferences`, `calendarState`, `missingState`, `fleaMarketState`, `releaseRadarState` und `collectorState` gespiegelt.
- Ein eigener `pre-settings-split-v1`-Snapshot sichert den Zustand vor der ersten Aufteilung.
- Legacy-`settings` bleibt in dieser Zwischenstufe weiterhin aktiv und wird bei Änderungen synchron mit den sechs neuen Stores geschrieben.
- Data-Stack-Status prüft zusätzlich die Settings-Parität; bei Abweichungen bleibt die bisherige Struktur funktionsfähig und der neue Stack wird als nicht bereit markiert.

## Neu in 4.6.0

- IndexedDB-Schema 6 mit vorbereiteten Stores für Preferences, Kalender, Fehlbände, Flohmarkt, Release Radar und Sammelziele.
- Automatischer lokaler Data-Stack-Snapshot aus Archivgraph, `comics`-Mirror und bisherigem Settings-Datensatz.
- Harte Paritätsprüfung zwischen `seriesCatalog`/`issues`/`copies` und dem weiterhin gepflegten `comics`-Mirror.
- Interne Restore-Funktion für den letzten Data-Stack-Snapshot.
- Datenformat bleibt 9 und Archivmodell bleibt 1.
- `comics` und der bisherige Settings-Datensatz bleiben weiterhin aktiv; die Ablösung erfolgt erst nach erfolgreicher Paritätsphase.

## Neu in 4.5.3

- statische App-Dateien werden nach der Installation cache-first geladen; Navigation, Versions- und Kalenderdaten bleiben frisch
- das 1024er App-Icon und der doppelte Root-Einstieg wurden aus dem Core-Precache entfernt
- Collection-Refreshes rendern schwere Unterseiten und die Statistik nur noch, wenn sie tatsächlich sichtbar sind
- Bulk-Änderungen laufen über einen gemeinsamen Storage-Batch statt über viele einzelne Save-Zyklen
- veraltete Duckipedia-Cache-Einträge werden beim Start automatisch nach der konfigurierten TTL entfernt
- private Backups/Exporte und generiertes dist sind vor versehentlichen Commits geschützt
- fest verdrahtete 2026er Kalender-URL als Default entfernt; Jahrespläne kommen über den Kalenderindex

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

- App-Version: `4.6.4`
- Datenformat: `9`
- Archivmodell: `1`
- Data-Stack-Version: `2`
- IndexedDB-Schema: `6`
- Schema 6 mit Foundation-, Mirror- und Settings-Cutover-Snapshots; Split-Settings und Archivgraph-Runtime sind aktiv
- neue Module `archive-runtime.js`, `data-stack.js`, `collector-goals.js` und `share-cards.js`
- Service-Worker-Cache: `v4-6-4`
- Scanner- und PDF-Bibliothek weiterhin nur bei Bedarf geladen
- GitHub Pages mit vorgeschalteter GitHub-Actions-Prüfung

## Projektstruktur

```text
Entenarchiv/
├── index.html
├── style.css
├── app.js
├── archive-model.js
├── archive-runtime.js
├── data-stack.js
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
