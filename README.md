# Entenarchiv 3.7.0

Private, mobile Progressive Web App zur Verwaltung einer Sammlung von Lustigen Taschenbüchern und Sonderbänden.

## Neu in 3.7.0

### Aufgeräumte Startseite

- Der große Bereich „Comic hinzufügen“ befindet sich nicht mehr im Hauptfeed.
- Der Kalender befindet sich nicht mehr im Hauptfeed.
- Die bisherige Statuszeile mit Online-Status, lokalem Speicher und Updateprüfung wurde entfernt.
- Die Versionsnummer steht kompakt am Ende des Backup-Bereichs.
- Das Backup-Center zeigt nur die wichtigsten Angaben; technische Speicherdetails sind einklappbar.

### Neue Hauptnavigation

Am unteren Bildschirmrand stehen dauerhaft drei zentrale Bereiche bereit:

- Kalender
- Hinzufügen
- Statistiken

„Hinzufügen“ ist als mittlere Hauptaktion hervorgehoben. Alle drei Bereiche öffnen eine eigene bildschirmfüllende Ansicht.

### Klickbares Dashboard

Die Kennzahlen auf dem Dashboard führen direkt zur passenden Ansicht:

- Gesamt → komplette Sammlung
- Reihen → Statistiken
- Gelesen / Ungelesen → entsprechend gefilterte Sammlung
- Foliert → gefilterte Sammlung
- Doppelt → gefilterte Sammlung
- Fehlende Bände → vollständige Fehlbandliste

### Neue Statistiken

Die Statistikseite enthält unter anderem:

- Lesefortschritt
- vollständige Reihen
- ältestes Erscheinungsjahr
- häufigster Zustand
- vollständigste Reihe
- Erscheinungsjahre mit den meisten Exemplaren
- Anteil der Exemplare ab Zustand Very Fine je Reihe
- größte Reihen nach Anzahl physischer Exemplare
- Zustandsverteilung
- detaillierten Reihenfortschritt

### Verknüpfung von Kalender und Sammlung

Erkannte Neuerscheinungen werden mit der lokalen Sammlung abgeglichen. Im Kalender erscheint je Ausgabe einer der Zustände:

- Im Besitz
- Fehlt
- Noch nicht vorgemerkt

Je nach Status lässt sich die vorhandene Ausgabe öffnen, der Fehlband direkt aufrufen oder die Ausgabe auf die persönliche Wunschliste setzen. Unterstützt werden die Hauptreihe, passende Standardreihen, eigene Reihen mit übereinstimmendem Namen und bekannte Namensvarianten wie „LTB Frohe Ostern“.

## Datenspeicherung

Sammlung, eigene Termine, Coverbilder und Einstellungen bleiben unverändert lokal in IndexedDB auf dem Gerät gespeichert. Version 3.7.0 ändert weder den Datenbanknamen noch das Backupformat.

## Jahreskalender

Verfügbare Jahrespläne werden weiterhin über `data/kalender-index.json` verwaltet. Neue Jahrgänge lassen sich unter derselben GitHub-Pages-Adresse ergänzen. Eine Vorlage befindet sich in `data/README.txt`.
