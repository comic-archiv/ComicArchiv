# Entenarchiv 4.1.1

Entenarchiv ist eine private, mobile und offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderbänden.

Version 4.1.1 verfeinert die **digitale Bibliothek** für kleine iPhone-Displays: Der Reihenheader ist klar gegliedert, Regale lassen sich ohne Bandbereichswechsel kontinuierlich durchscrollen, Duckipedia-Cover werden zuverlässig nachgeladen und die Banddetailansicht bleibt kompakt und vollständig sichtbar.

## Verbessert in Version 4.1.1

### Digitale Regale

Ein Klick auf **Lustige Taschenbücher** öffnet die Hauptreihe direkt als Regal. Vorhandene und fehlende Bandnummern erscheinen in der richtigen Reihenfolge:

```text
Band 1 · vorhanden
Band 2 · vorhanden
Band 3 · fehlt
Band 4 · vorhanden
```

Vorhandene Bände zeigen nach Möglichkeit das eigene lokale Cover oder die Duckipedia-Vorschau. Fehlt ein Bild, bleibt eine klar erkennbare, ruhige Platzhalterkarte sichtbar.

Duckipedia-Cover werden mit der für Comic-Cover notwendigen Bildlizenz-Option abgefragt. Bereits gespeicherte Bände ohne Cover können beim sichtbarkeitsnahen Laden im Hintergrund still aktualisiert werden.

Lange Reihen erscheinen als ein durchgehendes Regal. Suche und Filter wirken auf die gesamte Reihe; Cover werden erst in der Nähe des sichtbaren Bereichs geladen, damit das Scrollen trotz vieler Bände flüssig bleibt.

### Hochwertige Reihenseiten

Jede Reihe erhält eine eigene Detailansicht mit:

- Vollständigkeit und Fortschrittsbalken,
- Zahl der Ausgaben und physischen Exemplare,
- ungelesenen und mehrfach vorhandenen Bänden,
- nächster erkannter Neuerscheinung aus dem Kalender,
- visueller Regal- und kompakter Listenansicht,
- Suche innerhalb der Reihe,
- Filter für vorhanden, fehlend, ungelesen, mehrfach vorhanden und schwächere Zustände,
- direktem Zugriff auf das Sammlungsziel.

Fehlende Bände sind im Regal anklickbar und öffnen die bestehende Fehlbandverwaltung. Vorhandene Bände öffnen eine kompakte Detailansicht mit allen physischen Exemplaren, Zuständen und Aktionen.

### Reihenbibliothek

**Sonderbände & weitere Reihen** öffnet jetzt eine eigene Reihenbibliothek. Jede Reihe wird mit Cover-Collage, Vollständigkeit, Ausgaben, Exemplaren und relevanten Hinweisen dargestellt.

Die Bibliothek lässt sich suchen und sortieren nach:

- Vollständigkeit,
- Name,
- Größe,
- ungelesenen Bänden,
- letzter Änderung.

Die Hauptreihe bleibt in der Gesamtansicht immer an erster Stelle.

### Intelligente Listen

Entenarchiv stellt automatisch acht praktische Listen zusammen:

- Neu im Archiv
- Noch ungelesen
- Mehrfach vorhanden
- Folierte Exemplare
- Zustand 3 oder schwächer
- Daten ergänzen
- Ohne Cover
- Aktueller Jahrgang

Ein Klick öffnet die bereits bekannte Sammlungsansicht mit passendem Filter. Die aktive Liste wird dort sichtbar angezeigt und lässt sich mit einem Klick wieder verlassen.

### Sammelbearbeitung

In einer Reihenseite kann über **Auswählen** eine Mehrfachauswahl gestartet werden. Für alle ausgewählten Ausgaben lassen sich anschließend gemeinsam ändern:

- gelesen oder ungelesen,
- foliert oder entfoliert,
- Zustand aller Exemplare.

Die letzte Sammeländerung kann direkt wieder rückgängig gemacht werden.

## Archivkern aus Version 4.0

Entenarchiv unterscheidet weiterhin sauber zwischen:

```text
Reihe
└── Ausgabe
    ├── Exemplar 1
    ├── Exemplar 2
    └── weitere Exemplare
```

Eine Ausgabe kann beliebig viele physische Exemplare besitzen. Fehlbandberechnung und Reihenfortschritt zählen die Ausgabe nur einmal; exemplarbezogene Statistiken berücksichtigen alle Bücher.

## Daten und Kompatibilität

Version 4.1.1 verwendet weiterhin:

- Datenbank: `comicarchiv-db`
- IndexedDB-Schema: `5`
- Datenformat: `9`
- Archivmodell: `1`

Es ist **keine neue Datenbankmigration** erforderlich. Die in Version 4.0 übertragenen Reihen, Ausgaben, Exemplare, Cover, Ziele, Kalendertermine und Flohmarktmarkierungen bleiben erhalten.

Die Coverübersicht liest nur lokale Cover-IDs und lädt nicht vorsorglich alle Bilddateien in den Arbeitsspeicher. Die eigentlichen Bilder werden erst sichtbarkeitsnah pro Band geladen.

## Datenschutz

Die private Sammlung bleibt lokal in IndexedDB auf dem verwendeten Gerät. GitHub Pages veröffentlicht nur den Programmcode und statische Kalenderdateien. Eigene Comics, Zustände, Notizen und Cover werden nicht automatisch zu GitHub übertragen.

Duckipedia wird nur für optionale bibliografische Zusatzdaten und externe Covervorschauen kontaktiert.

## Wichtige Projektdateien

```text
Entenarchiv/
├── index.html
├── style.css
├── app.js
├── archive-model.js
├── shelf.js
├── shelf-ui.js
├── storage.js
├── missing.js
├── export.js
├── scanner.js
├── calendar.js
├── service-worker.js
├── tests/
├── scripts/
└── .github/workflows/deploy-pages.yml
```

`shelf.js` enthält die testbare Fachlogik für Regale, Reihenübersichten, intelligente Listen und Sammeländerungen. `shelf-ui.js` kapselt die neue Bibliotheks- und Regaloberfläche.

## Qualitätsprüfung

Lokal oder in GitHub Actions:

```bash
npm run check
npm run build
```

`npm run check` validiert Projektstruktur und JavaScript und führt derzeit 53 automatisierte Tests aus. `npm run build` erstellt anschließend das bereinigte Produktionspaket in `dist/`.

## Update

Die vollständige Anleitung befindet sich in `UPDATE-ANLEITUNG.md`. Vor jedem größeren Update sollte weiterhin ein aktuelles JSON-Backup und bei eigenen Coverbildern zusätzlich ein Medien-Backup erstellt werden.
