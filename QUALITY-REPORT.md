# Qualitätsbericht Entenarchiv 4.6.19
## Stand

Version 4.6.18 schließt den Runtime- und Feature-Architecture-Cleanup ab. Archivgraph und Feld-Settings bleiben die einzigen aktiven persistenten Datenquellen; die UI arbeitet jetzt zusätzlich direkt mit `Issue + Copy + Series` als `ArchiveEntry`, statt den Archivgraph für den normalen Runtime-Pfad wieder in ein Legacy-Comic-Modell zurückzuformen.

## Automatisierte Prüfung

- 174 automatisierte Tests erfolgreich
- Projektvalidierung erfolgreich
- Kalenderjahr 2026 mit 100 gültigen Terminen validiert
- Produktions-Build mit 44 Runtime-Einträgen erfolgreich erstellt
- App-Version `4.6.18`, Datenformat `9`, Archivmodell `1`, Data Stack `2` und IndexedDB-Schema `6` konsistent
- alle neuen Featuremodule lassen sich syntaktisch und als ES-Module laden

Ein automatisierter visueller Browser-Smoke-Test war in der Build-Umgebung nicht zuverlässig ausführbar. Deshalb bleibt nach dem Deployment ein kurzer manueller Smoke-Test der Hauptansichten sinnvoll.

## Direkte Archive-Runtime

- `archive-entry.js` definiert die direkte Runtime-Sicht auf `Issue`, `Series` und `Copy`.
- `archive-runtime.js` erzeugt Archive Entries unmittelbar aus dem validierten Archivgraph.
- Die aktive Sammlung liest nicht aus dem stillgelegten `comics`-Store.
- Legacy-Comic-Projektionen bleiben nur an expliziten historischen Import-, Export- und Migrationsgrenzen erhalten.
- Ein Regressionstest vergleicht die neue Runtime-Sicht für gültige Daten mit der bisherigen Legacy-Materialisierung.

## Featuremodule

Aus `app.js` wurden weitere Verantwortungsbereiche ausgelagert:

- `collection-feature.js` – Sammlungsansicht, Filter, Karten und Aktionen
- `collection-query.js` – DOM-freie Scope-, Filter- und Sortierlogik
- `missing-feature.js` – Fehlband-Hub, Fehlbanddetails und Prioritäten
- `calendar-feature.js` – Kalender, Terminverwaltung und Release Radar
- `scanner-feature.js` – Scanner-UI und Scanner-Ablauf
- `diagnostics-ui.js` – Diagnose-Oberfläche
- `app-elements.js`, `app-state.js`, `app-utils.js` – DOM-Registry, Runtime-State und zustandsfreie Helfer

`app.js` liegt nach diesem Block bei rund **205 KB / 4.968 Zeilen**; vor 4.6.13 waren es rund **359 KB / 8.438 Zeilen**.

## Scanner Lazy Loading

`scanner-feature.js`, `scanner.js` und `scanner-pro.js` werden nicht mehr beim normalen App-Start geladen und liegen nicht im Core-Precache. Beim ersten Öffnen des Scanners lädt die App das Feature dynamisch; danach kann der Service Worker die geladenen Dateien cache-first bereitstellen.

## CSS-Architektur

`style.css` enthält nur noch die geordneten Imports:

1. `styles/tokens.css`
2. `styles/base.css`
3. `styles/components.css`
4. `styles/calendar.css`
5. `styles/collection.css`
6. `styles/scanner.css`
7. `styles/statistics.css`
8. `styles/refinements.css`

Die acht Dateien wurden als zusammenhängende Abschnitte aus der vorherigen bereinigten `style.css` geschnitten. Ihre Verkettung reproduziert den vorherigen CSS-Quelltext in identischer Reihenfolge; dadurch ändert die reine Architekturaufteilung die Kaskade nicht.

## Data Stack v2

Unverändert aktiv bleiben:

- `seriesCatalog`, `issues` und `copies` als persistente Sammlungsquelle
- 35 Settings-Felder in sechs Fach-Stores
- feldgenaue Settings-Writes
- leere `comics`- und `settings`-Stores nur als Schema-Hüllen für sichere Direkt-Upgrades älterer Installationen
- lokale Data-Stack-Snapshots und Integritätsprüfungen

## Bewusst verbleibende technische Schulden

Der große Monolith ist deutlich kleiner, aber noch nicht vollständig zerlegt. Größere verbleibende Kandidaten sind insbesondere:

- `calendar-feature.js` mit rund 73 KB
- `scanner-feature.js` mit rund 56 KB
- Statistik-, Flohmarkt- und Reihenfortschritts-Orchestrierung verbleiben teilweise in `app.js`
- historische Import-/Migrationsadapter bleiben absichtlich erhalten, solange direkte Upgrades alter Backups/Installationen unterstützt werden

Diese Punkte eignen sich für Performance-/Release-Hardening ab 4.6.19, ohne den jetzt abgeschlossenen Daten- und Runtime-Cutover erneut anzufassen.

## Datensicherheit

Datenformat, Archivmodell und IndexedDB-Schema ändern sich in 4.6.18 nicht. Ein externes JSON-Backup vor dem Upgrade bleibt trotzdem empfohlen. Eigene Cover bleiben lokal in IndexedDB und sind nicht Bestandteil des GitHub-Repositories.

## 4.6.19 Runtime-Hotfix

- Gemeinsamer Zustands-Badge-Helfer für App-Shell und Sammlung wiederhergestellt.
- Verbliebene Kalender-Modal-Scope-Referenzen auf die öffentliche Feature-API umgestellt.
- Runtime-Scope-Regressionstests ergänzt.
