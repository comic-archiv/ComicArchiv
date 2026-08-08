# Entenarchiv 4.3.1

Entenarchiv ist eine private, offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderreihen. Version 4.3 ergänzt den Archivkern, die digitalen Regale und Scanner Pro um ein **Erscheinungsradar**, das offizielle Verlagstermine mit der eigenen Sammlung verbindet.

## Neu in 4.3.1

- Nicht zugeordnete Verlagstermine können einer bestehenden Reihe zugeordnet oder direkt als neue Reihe angelegt werden.
- Kalender-Aliase werden gespeichert und erkennen spätere Bände derselben Reihe automatisch.
- Manuelle Einzelzuordnungen sichern auch ungewöhnlich benannte Termine ab.

## Neu in Version 4.3

### Erscheinungsradar

Das Radar wertet die in Entenarchiv geladenen offiziellen LTB-Jahrespläne aus und bildet daraus eine persönliche Release-Inbox. Jede zuordenbare Neuerscheinung wird mit dem Archiv abgeglichen und erhält einen Status:

- **Im Besitz** – die Ausgabe ist bereits gespeichert.
- **Fehlt** – die Ausgabe liegt innerhalb eines persönlichen Reihenziels.
- **Nicht vorgemerkt** – der Termin ist bekannt, aber noch nicht Teil der Wunschliste.
- **Vorgemerkt** – die Ausgabe soll gesucht oder gekauft werden.
- **Bestellt** – die Ausgabe ist bereits bestellt.
- **Ignoriert** – der Termin soll nicht mehr als offen erscheinen.

Das Radar ist über die Startseite und die Kalenderansicht erreichbar. Neue oder heute fällige Veröffentlichungen können zusätzlich als Zahl am Kalender-Icon und – nach ausdrücklicher Freigabe – am Home-Screen-Symbol angezeigt werden.

### Direkte Aktionen

Aus einer Neuerscheinung heraus kann Entenarchiv:

- ein Reihenziel bis zur betreffenden Bandnummer erweitern,
- den Band auf die Wunschliste setzen,
- eine Bestellung markieren,
- eine bereits erschienene Ausgabe zum Hinzufügen vorbereiten,
- eine vorhandene Ausgabe in der Sammlung öffnen,
- die zugehörige Duckipedia-Seite aufrufen,
- vorgemerkte und bestellte Termine als iCal-Datei für Apple Kalender exportieren.

### Automatische Jahresplan-Erkennung

Der GitHub-Actions-Workflow kann den offiziellen LTB-Downloadbereich einmal pro Woche prüfen. Neue oder korrigierte iCal-Dateien werden validiert, nach Kalenderjahr geordnet und unmittelbar in das veröffentlichte GitHub-Pages-Paket aufgenommen.

Schlägt die Online-Prüfung vorübergehend fehl, bleibt der vorhandene Kalenderstand erhalten und die Veröffentlichung wird nicht blockiert.

### Reparierte Unterseiten-Navigation

Während eine Unterseite geöffnet ist, wird die globale Kopfzeile ausgeblendet. Die jeweilige Unterseiten-Kopfzeile mit Zurück-Button liegt auf einer eigenen Ebene. Dadurch sind die Zurück-Buttons wieder erreichbar und scrollende Karten können sie nicht verdecken.

## Datenschutz und Speicherung

- Sammlung, Exemplare, Entscheidungen im Erscheinungsradar und eigene Termine bleiben lokal in IndexedDB.
- Der GitHub-Workflow verarbeitet ausschließlich öffentlich bereitgestellte iCal-Jahrespläne.
- Das optionale App-Badge wird lokal beim Öffnen der installierten Web-App berechnet.
- Es gibt kein Benutzerkonto und keine Server-Datenbank für die Sammlung.
- Regelmäßige JSON- und Medien-Backups bleiben notwendig.

## Technische Eckdaten

- App-Version: `4.3.1`
- Datenformat: `9`
- Archivmodell: `1`
- IndexedDB-Schema: `5`
- Vanilla HTML, CSS und JavaScript
- GitHub Pages mit vorgeschalteter GitHub-Actions-Prüfung
- wöchentliche, fehlertolerante Jahresplan-Erkennung
- Scanner- und PDF-Bibliothek werden weiterhin nur bei Bedarf geladen

## Projektstruktur

```text
Entenarchiv/
├── index.html
├── style.css
├── app.js
├── archive-model.js
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
│   └── sync-release-calendars.mjs
└── .github/workflows/
    └── deploy-pages.yml
```

## Lokale Qualitätsprüfung

```bash
npm run check
npm run build
```

Für die normale Veröffentlichung sind auf dem Mac keine Installationen erforderlich. GitHub Actions führt dieselben Prüfungen nach jedem Commit aus und veröffentlicht nur eine erfolgreiche Version.
