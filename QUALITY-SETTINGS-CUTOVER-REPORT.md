# Entenarchiv Settings Cutover Report

Stand: 4.6.3 · Data Stack v2 · Settings Cutover.

## Ziel

Der bisherige `settings`-Mega-Datensatz wird aus dem aktiven Read/Write-Pfad genommen. Die sechs bereits in 4.6.1 vorbereiteten Schema-6-Stores werden zur aktiven Quelle für App-Einstellungen.

## Aktives Layout

Die 35 normalisierten Settings-Felder werden nicht mehr als ein großer Gruppenrecord gespeichert, sondern als einzelne Feld-Datensätze in ihren fachlichen Stores:

| Store | Beispiel-Felder |
|---|---|
| `preferences` | `theme`, `showCovers`, `duckipediaAutoEnrich`, `scannerMode` |
| `calendarState` | `calendarEvents`, `calendarSelectedYear`, `calendarSelectedMonth`, `calendarReminderTime` |
| `missingState` | `knownHighestBandBySeries`, `missingBandDetails` |
| `fleaMarketState` | `fleaMarketSession` |
| `releaseRadarState` | Entscheidungen, Signaturen, Filter, Aliase und Event-Links |
| `collectorState` | Backupstatus, eigene Reihen, Meilensteine und Migrationsbestätigung |

Jeder aktive Datensatz trägt seinen Feldnamen als IndexedDB-Key. Dadurch kann eine Änderung genau den betroffenen Datensatz schreiben.

## Write-Amplification

Beispiel Kalendernavigation:

Vor 4.6.3:

`calendarSelectedMonth` ändern → kompletter `settings`-Datensatz + sechs Spiegelgruppen schreiben.

Ab 4.6.3:

`calendarSelectedMonth` ändern → genau ein Feld-Datensatz in `calendarState` schreiben.

Die bereits gespeicherten Kalendertermine werden dabei nicht erneut geschrieben.

## Sicherheit

- Der Cutover startet nur, wenn Data-Stack-Foundation und Settings-Spiegelung bereit sind.
- Legacy-`settings` und die sechs 4.6.1-Gruppen müssen vor dem Cutover vollständig übereinstimmen.
- Der Archivgraph und der weiterhin vorhandene `comics`-Mirror müssen valide sein.
- Vor der Umstellung wird ein vollständiger `pre-settings-cutover-v1`-Snapshot angelegt.
- Anschließend werden alle 35 aktiven Feld-Datensätze geschrieben und erneut gegen den sicheren Ausgangsstand geprüft.
- Erst nach erfolgreicher Prüfung wird `settings-cutover` als `complete` markiert.
- Der alte `settings`-Datensatz wird danach nicht mehr live aktualisiert und bleibt als statischer Sicherheitsfallback erhalten.
- Falls aktive Feld-Datensätze fehlen, fällt Lesen auf den eingefrorenen Legacy-Datensatz zurück; Schreiben in einen beschädigten Cutover-Zustand wird verhindert.
- Ein Data-Stack-Rollback leert aktive Feld-Datensätze, entfernt den Cutover-Status und stellt zuerst den gesicherten Legacy-/Gruppenmirror wieder her; der Cutover wird danach kontrolliert neu aufgebaut.

## Interne Konsistenz

Storage-Pfade, die Einstellungen zur Verarbeitung von Comics und Reihen benötigen, lesen cutover-aware. Dazu gehören insbesondere Einzel-Saves, Batch-Saves, vollständige Imports und Data-Stack-/Archiv-Migrationen.

Nach dem Cutover vergleicht die Split-Integritätsprüfung bewusst nicht mehr gegen den eingefrorenen Legacy-Datensatz, sondern prüft die Vollständigkeit der aktiven Feld-Datensätze.

## Unverändert

- IndexedDB-Schema: 6
- Datenformat: 9
- Archivmodell: 1
- Data-Stack-Version: 2
- `seriesCatalog`, `issues` und `copies` bleiben aktive Sammlungsquelle.
- `comics` bleibt vorerst als Live-Legacy-Mirror bestehen.
- Cover und Metadaten-Cache bleiben unverändert.

## Prüfung

- 158/158 automatisierte Tests erfolgreich.
- Kalenderprüfung erfolgreich.
- Produktions-Build erfolgreich.
- Unit-Tests prüfen vollständige Feldabdeckung, Feld-Diffing und den statischen Legacy-Fallback.
- Versions-, Service-Worker-, Build- und Datenformat-Prüfungen bleiben konsistent.

## Nächster Schritt

Nach erfolgreicher Bewährung von 4.6.3 kann die UI schrittweise direkt auf `seriesCatalog`, `issues` und `copies` arbeiten, ohne `materializeLegacyComics()` als zentrale Runtime-Projektion zu benötigen. Erst danach wird der Live-`comics`-Mirror entfernt.
