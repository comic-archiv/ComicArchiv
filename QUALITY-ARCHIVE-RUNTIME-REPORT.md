# Entenarchiv Archive Graph Runtime Report

Stand: 4.6.4 · Data Stack v2 · Archive Graph Read Cutover.

## Ziel

Die persistierte Sammlung soll zur Laufzeit nicht mehr über den Legacy-`comics`-Mirror gelesen werden. `seriesCatalog`, `issues` und `copies` werden zur primären Quelle. Der Mirror bleibt vorerst nur als abgesicherte Kompatibilitäts- und Rollback-Schicht bestehen.

## Umsetzung

- `getArchiveRuntimeCollection()` liest ausschließlich den validierten Archivgraphen.
- `archive-runtime.js` erzeugt daraus kompatible UI-Einträge im Arbeitsspeicher, ohne `materializeLegacyComics()` aufzurufen.
- `app.js` importiert `getAllComics()` nicht mehr und besitzt keinen `state.comics`-Runtime-State mehr.
- Der aktive UI-State heißt `collectionEntries`; zusätzlich hält `archiveGraph` die drei Quellmengen.
- `saveComic()` und `saveComicsBatch()` liefern direkt Runtime-Einträge zurück.
- Der Legacy-Store wird weiterhin geschrieben, damit Rollback, bestehende Backup-Kompatibilität und Data-Stack-Paritätsprüfung erhalten bleiben.

## Sicherheitsgrenze

4.6.4 entfernt den `comics`-Store **noch nicht**. Import-/Export-, Snapshot- und Migrationspfade dürfen den Legacy-Adapter weiterhin verwenden. Ein ungültiger Archivgraph führt im normalen Runtime-Lesepfad zu einem sichtbaren Fehler und niemals zu einem stillen Rückfall auf den Mirror.

## Nächster Schritt

Nach Bewährung des Read Cutovers können UI-Komponenten schrittweise direkt mit Issue-/Copy-Viewmodels arbeiten. Erst danach wird der Legacy-Write-Mirror aus normalen Speichertransaktionen entfernt.
