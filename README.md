# Entenarchiv 4.1.2

Entenarchiv ist eine private, mobile und offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderbänden.

Version 4.1 führte die **digitalen Regale** ein. Version 4.1.2 stabilisiert die Coveranzeige auf dem iPhone, liest das richtige Duckipedia-Cover aus der jeweiligen Band-Infobox und macht die Banddetails zu einer vollwertigen Bildschirmansicht.

## Neu und verbessert in 4.1.2

### Richtiges Cover aus der Duckipedia-Infobox

Entenarchiv versucht nicht mehr, ein Cover anhand uneinheitlicher Dateinamen oder irgendeines Bildes der Seite zu erraten.

Die Reihenfolge lautet jetzt:

1. eigenes, lokal gespeichertes Coverfoto,
2. das im Duckipedia-Infoboxfeld `BILD` hinterlegte Originalcover,
3. als Fallback das große Cover der gerenderten rechten Band-Infobox,
4. grafischer Entenarchiv-Platzhalter.

Das Feld `NEU-BILD` einer Neuauflage verdrängt das eigentliche Originalcover nicht. Die exakte Mediendatei wird anschließend über MediaWiki `imageinfo` in eine geeignete Vorschau aufgelöst.

Die interne Cover-Lookup-Version wurde erhöht. Ältere, möglicherweise falsch zugeordnete Duckipedia-Cover werden bei der nächsten sichtbaren Online-Anzeige automatisch neu geprüft und im Comicdatensatz sowie im lokalen Metadaten-Cache ersetzt.

### Cover laden ohne vorherigen Klick

- Die ersten sichtbaren Cover einer Reihen- oder Bibliotheksansicht werden direkt vorgeladen.
- Weitere Cover laden automatisch, sobald sie sich dem sichtbaren Bereich nähern.
- Die Beobachtung ist an den tatsächlich scrollenden Unterseiten ausgerichtet und nicht mehr nur an das Browserfenster.
- Entenarchiv verwendet für diese Galerie nicht zusätzlich das fehleranfällige native Lazy Loading versteckter iOS-Seiten.
- Höchstens zwei externe Coverabfragen laufen gleichzeitig.
- Bereits geladene lokale Cover-URLs bleiben beim Wechsel zwischen Bibliothek und Reihe gültig.
- Erfolgreich aufgelöste Duckipedia-URLs werden in IndexedDB gespeichert und stehen nach erneutem Öffnen der App weiter zur Verfügung.

### Vollbild-Banddetails auf dem iPhone

Die Banddetailansicht nutzt auf kleinen Displays den vollständigen Bildschirm. Sie enthält:

- Reihe, Titel, Bandnummer und Erscheinungsjahr,
- zentriertes Cover oder Platzhalter,
- alle physischen Exemplare,
- Zustand, gelesen, foliert und Notizen je Exemplar,
- Duckipedia-Link,
- Bearbeiten, Exemplare verwalten und Metadaten aktualisieren.

Kopfbereich und Aktionen bleiben beim Scrollen gut erreichbar. Auf größeren Displays bleibt die kompakte Dialogdarstellung erhalten.

### Weiterhin enthalten

- digitale Regale mit vorhandenen Bänden und sichtbaren Lücken,
- kontinuierliches Nachladen langer Reihen ohne Bandbereich-Auswahl,
- Regal- und Listenansicht,
- Suche, Filter und intelligente Listen,
- Reihenfortschritt und nächste Neuerscheinung,
- Sammelbearbeitung mit Rückgängig-Funktion,
- beliebig viele physische Exemplare je Ausgabe,
- Scanner, Kalender, Flohmarkt-Modus, Backups und sicherer Modus.

## Archivkern

Entenarchiv unterscheidet sauber zwischen:

```text
Reihe
└── Ausgabe
    ├── Exemplar 1
    ├── Exemplar 2
    └── weitere Exemplare
```

Eine Ausgabe kann beliebig viele physische Exemplare besitzen. Fehlbandberechnung und Reihenfortschritt zählen eine Ausgabe nur einmal; exemplarbezogene Statistiken berücksichtigen alle Bücher.

## Daten und Kompatibilität

Version 4.1.2 verwendet unverändert:

- Datenbank: `comicarchiv-db`
- IndexedDB-Schema: `5`
- Datenformat: `9`
- Archivmodell: `1`

Es ist keine Datenmigration erforderlich. Reihen, Ausgaben, Exemplare, Cover, Ziele, Kalendertermine und Flohmarktmarkierungen bleiben erhalten.

## Datenschutz

Die private Sammlung bleibt lokal in IndexedDB auf dem verwendeten Gerät. GitHub Pages veröffentlicht nur Programmcode und statische Kalenderdateien. Duckipedia wird ausschließlich für optionale bibliografische Metadaten und externe Covervorschauen kontaktiert.

## Qualitätsprüfung

```bash
npm run ci
```

Der Befehl prüft Projektstruktur, Versionen, JavaScript-Syntax, Datenlogik, Backups, Kalender, Scanner, Archivkern, Duckipedia-Infoboxen, Galerie-Ladelogik und Produktions-Build.
