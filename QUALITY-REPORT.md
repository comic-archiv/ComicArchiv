# Qualitätsbericht Entenarchiv 4.6.8

## Stand

Version 4.6.6 bereinigt zusätzlich die aktive Storage-API und entfernt Legacy-`Comic`-Begriffe aus allen normalen Schreibpfaden. Archivgraph und Feld-Settings sind die einzigen aktiven Datenquellen. Die früher live gepflegten `comics`- und Mega-`settings`-Datensätze werden nach einem lokalen Sicherheits-Snapshot geleert und anschließend von normalen Schreibpfaden nicht mehr verwendet.

## Automatisierte Prüfung

- 164 automatisierte Tests erfolgreich
- Projektvalidierung erfolgreich
- 533 eindeutige HTML-IDs geprüft
- 458 statische App-Selektoren geprüft
- 57 JavaScript-Dateien syntaktisch geprüft
- 35 Offline-Dateien geprüft
- Kalenderjahr 2026 mit 100 gültigen Terminen validiert
- Produktions-Build erfolgreich erstellt
- App-Version 4.6.5, Datenformat 9, Archivmodell 1 und IndexedDB-Schema 6 konsistent

## Data Stack v2

Geprüft werden insbesondere:

- `seriesCatalog`, `issues` und `copies` als einzige aktive Sammlungsquelle
- direkte Archive-Runtime ohne persistierten `comics`-Read-Fallback
- 35 aktive Settings-Feld-Datensätze in sechs Fach-Stores
- feldgenaue Settings-Writes statt Mega-Settings-Write-Amplification
- Sicherheits-Snapshot vor der Stilllegung der Legacy-Live-Daten
- vollständige Leerung der Live-Datensätze in `comics` und `settings`
- keine Legacy-Mirror-Writes in Einzel-, Batch-, Lösch-, Reihen- oder Backup-Import-Pfaden
- Rollback auf Archivgraph + Feld-Settings, ohne Legacy-Live-Speicher erneut zu aktivieren
- Diagnose unabhängig vom stillgelegten Legacy-Mirror

Die IndexedDB-Object-Stores `comics` und `settings` bleiben vorerst als **leere Schema-Hüllen** vorhanden. Sie werden nur noch für sichere Direkt-Upgrades älterer Installationen und historische Migrationsadapter benötigt. Ein normaler 4.6.5-Lauf hält beide Stores leer.

## Source-Hygiene

Die historischen Einzelberichte aus den Cleanup- und Data-Stack-Zwischenstufen 4.5.3 bis 4.6.4 wurden entfernt und in diesem Bericht konsolidiert. Ebenfalls entfernt wurden die nicht mehr relevanten Update-/CI-Hotfix-Anleitungen für 4.3.0 und 4.5.1.

Frühere Cleanup-Ergebnisse bleiben im Code erhalten:

- Service-Worker-Strategien getrennt und Core-Precache reduziert
- versteckte Vollansichten werden nicht unnötig neu gerendert
- Batch-Writes im Storage-Layer
- Duckipedia-Metadaten-GC
- CSS-Dubletten und nachweislich redundante Deklarationen entfernt
- seltene DOM-Bereiche werden lazy gemountet

## Bewusst verbleibende technische Schulden

Zwei Punkte bleiben absichtlich für die nächste Source-Cleanup-Tranche bestehen:

1. `app.js` ist weiterhin ungefähr 392 KB groß und sollte featureweise modularisiert werden.
2. Die bestehende UI arbeitet intern noch mit einer comic-förmigen **In-Memory-Kompatibilitätsansicht**, obwohl diese bereits ausschließlich aus dem Archivgraph erzeugt wird. Diese Projektion ist nicht mehr persistent und verursacht keine doppelte Datenhaltung, kann aber später aus den UI-Verträgen entfernt werden.

`style.css` liegt weiterhin bei ungefähr 194 KB. Die sicheren automatischen CSS-Cleanups sind abgeschlossen; weitere Aufteilung sollte featureweise und mit visuellen Regressionstests erfolgen.

## Datensicherheit

Vor der Legacy-Stilllegung wird lokal ein `pre-legacy-storage-retirement-v1`-Snapshot gespeichert. Externe JSON- und Medien-Backups bleiben unabhängig davon empfohlen, da lokale IndexedDB-Snapshots keinen Geräteverlust oder gelöschte Website-Daten absichern.

## 4.6.6 Source Cleanup

Aktive Schreib- und Löschpfade heißen nun `saveArchiveEntry`, `saveArchiveEntriesBatch`, `upsertArchiveEntries`, `deleteArchiveEntry` und `replaceArchiveEntriesFromLegacy`. Der verbleibende `getAllComics()`-Export ist ausschließlich ein historischer Import-/Migrationsadapter.

## 4.6.7 Settings Hygiene

Die aktive redundante `customSeries`-Namensliste ist entfernt. `customSeriesConfigs` ist die einzige persistente Quelle; alte Backup-Felder werden nur noch beim Normalisieren als Importadapter gelesen.

## 4.6.8 Modul-Cleanup

Zustandsfreie App-Helfer sind in `app-utils.js` ausgelagert und separat getestet.
