# Entenarchiv Data Stack v2 Foundation Report

Stand: 4.6.0 · Data Stack v2 Foundation (Stack-Version 1, IndexedDB-Schema 6).

## Ziel dieser Tranche

Diese Version schafft die Sicherheits- und Speichergrundlage fuer den spaeteren Data-Stack-v2-Umbau. Der bestehende Live-Betrieb wird bewusst noch nicht auf die neuen Stores umgestellt.

- `seriesCatalog`, `issues` und `copies` bleiben der bestehende Archivgraph.
- Der Legacy-Store `comics` bleibt in 4.6.0 weiterhin aktiv und wird nicht geloescht.
- Der bisherige `settings`-Gesamtdatensatz bleibt in 4.6.0 weiterhin aktiv und wird nicht geloescht.
- Datenformat 9 und Archivmodell 1 bleiben unveraendert.

## Neues Datenbankschema 6

Vorbereitet werden folgende getrennte Stores fuer die naechsten Data-Stack-Tranchen:

- `preferences`
- `calendarState`
- `missingState`
- `fleaMarketState`
- `releaseRadarState`
- `collectorState`
- `dataStackMeta`
- `dataStackSnapshots`

Beim Upgrade von Datenbank 5 auf 6 werden alle bisherigen Stores beibehalten. Das Upgrade schreibt zusaetzlich einen Meta-Eintrag mit Ausgangs- und Zielversion.

## Sicherheitsnetz

Vor der spaeteren Aufteilung wird der aktuelle Datenstand als Foundation-Snapshot gesichert. Der Snapshot enthaelt:

- Reihen
- Ausgaben
- Exemplare
- aktuellen Legacy-`comics`-Mirror
- aktuellen Settings-Datensatz
- Archivkern-Metadaten

Cover-Blobs werden bewusst nicht dupliziert, da die Foundation diese Medien nicht veraendert.

Vor dem Snapshot wird der Archivgraph validiert und erneut in das Legacy-Comicformat projiziert. Nur wenn diese Projektion und der bestehende `comics`-Mirror inhaltlich uebereinstimmen, wird die Foundation als `complete` markiert. Bei einer Abweichung wird keine Datenaufteilung gestartet.

Eine interne Restore-Funktion kann den letzten Foundation-Snapshot atomar auf Archivgraph, Legacy-Mirror und Settings zurueckspielen.

## App-Status

Unter Backup & Sicherheit zeigt die App einen neuen Status `Data Stack v2`. Im erfolgreichen Zustand lautet er:

`Bereit · Schema 6 · Sicherung vorhanden`

## Pruefung

Der finale Stand besteht:

- 147/147 automatisierte Tests
- Kalenderpruefung mit 100 gueltigen LTB-Terminen
- Produktions-Build mit 32 Laufzeit-Eintraegen
- direkter Unit-Test fuer das Schema-Upgrade von IndexedDB 5 auf 6
- Paritaetstests fuer Archivgraph und Legacy-Mirror
- Snapshot- und Restore-Strukturtests

Ein automatisierter echter Browserlauf mit IndexedDB konnte in der Ausfuehrungsumgebung wegen einer Browser-/Enterprise-Policy nicht gestartet werden. Der Schema-Upgrade-Pfad wurde deshalb als isolierbare Funktion implementiert und in der regulaeren CI mit einer IndexedDB-kompatiblen Upgrade-Simulation getestet.

## Noch bewusst nicht Teil von 4.6.0

- Aufteilen des `settings`-Mega-Records auf die neuen Stores
- Umstellen der UI von materialisierten Legacy-Comics auf direkte Archivgraph-Daten
- Entfernen des Live-`comics`-Mirrors
- Entfernen von Legacy-Dublettenfeldern

Diese Punkte folgen erst in den naechsten Data-Stack-v2-Tranchen, nachdem Schema 6 und das Sicherheitsnetz im normalen Betrieb bestaetigt wurden.
