# Entenarchiv – Legacy-Kompatibilität nach 4.6.22

Entenarchiv 4.6.22 nutzt im Normalbetrieb ausschließlich den Archivgraph aus `seriesCatalog`, `issues` und `copies` sowie feldgenaue Settings in den sechs Data-Stack-Stores. Historische Strukturen werden nur dort behalten, wo sie noch einen klaren Sicherheits- oder Importzweck erfüllen.

## Bewusst erhalten

### Leere IndexedDB-Schema-Hüllen `comics` und `settings`

Die Stores bleiben in Datenbankschema 6 vorhanden, werden im Normalbetrieb aber nicht mehr beschrieben. Sie erlauben Installationen aus älteren Versionen, direkt auf den aktuellen Archivkern zu migrieren, ohne einen zusätzlichen Zwischenrelease zu benötigen.

### Einmaliger Legacy-Leseadapter

`getAllComics()` darf den alten `comics`-Store nur lesen, wenn der Archivkern noch nie erfolgreich aufgebaut wurde. Sobald der Archivkern bereit ist, wird aus dem Archivgraph materialisiert; ein stiller Rückfall auf alte Daten ist ausgeschlossen.

### Backup-Kompatibilitätsprojektion

Aktuelle JSON-Backups enthalten neben dem autoritativen `archiveCore` weiterhin eine kompatible `comics`-Projektion. Sie dient älteren Entenarchiv-Versionen und allgemeinen JSON-Werkzeugen, ist aber keine aktive Datenquelle der aktuellen App.

### Import alter Backups

Backups vor dem Archivkern bleiben über `parseAndValidateBackup()` und die Migrationsadapter importierbar. Alte Doppelstücke werden dabei in einzelne Copies überführt. Neue Backups werden immer gegen den Archivgraph validiert.

### Lokale Migrations- und Data-Stack-Snapshots

Vor riskanten historischen Migrationen erzeugte Snapshots bleiben als Rückfallmöglichkeit erhalten. Restore-Pfade bauen anschließend wieder den aktuellen Archivgraph und die feldgenauen Settings auf; sie reaktivieren keine zweite Live-Datenquelle.

### Recovery-Modus

`recovery.js` bleibt bewusst unabhängig von der normalen App-Orchestrierung. Er kann auch bei einem fehlerhaften App-Start lokale Notfall-Backups erzeugen.

## Entfernt in 4.6.22

Vollständig unreferenzierte Runtime-Exports und Helfer wurden entfernt. Eine CI-Prüfung verhindert künftig neue exportierte Symbole, die weder Runtime, Tests, Scripts noch Browser-Migrationstest referenzieren.

## Wann die Schema-Hüllen entfernt werden können

Die leeren `comics`- und `settings`-Stores sollten erst bei einem ohnehin notwendigen IndexedDB-Schema-Upgrade entfernt werden. Ein eigenes Schema 7 nur zum Löschen leerer Stores hätte keinen relevanten Laufzeit- oder Speichervorteil und würde unnötig einen weiteren Migrationspfad erzeugen.

Vor einer späteren Entfernung müssen weiterhin gelten:

1. ältere unterstützte Backups lassen sich ohne die Stores importieren,
2. direkte Upgrades aus den noch unterstützten Altversionen sind abgedeckt,
3. Recovery und Rollback greifen ausschließlich auf Archivgraph/Settings-Felder beziehungsweise Snapshots zu,
4. die vollständige Backup-Roundtrip-Prüfung bleibt grün.
