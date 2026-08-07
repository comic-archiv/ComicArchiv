# Entenarchiv 4.2.0

Entenarchiv ist eine private, offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderreihen. Version 4.2 baut auf dem stabilen Archivkern und den digitalen Regalen auf und verbessert zwei zentrale Arbeitsabläufe: **viele Bände schnell erfassen** und **Zustände nachvollziehbar bewerten**.

## Neu in Version 4.2

### Scanner Pro

Der Serien-Scanner besitzt jetzt zwei Arbeitsweisen:

- **Scan & weiter:** Jeder erkannte Zusatzcode wird sofort vorgemerkt. Die Kamera bleibt aktiv und Duckipedia-Daten werden parallel ergänzt.
- **Vorher prüfen:** Nach jedem Scan lassen sich Titel, Jahr und Standardwerte kontrollieren, bevor der Band in die Warteschlange wandert.

Die Sitzung zeigt laufend:

- Zahl der Scans,
- neue Ausgaben,
- bereits vorhandene Ausgaben,
- noch zu prüfende Treffer.

Wird dieselbe Ausgabe mehrfach gescannt, entsteht kein zweiter Bandeintrag. Entenarchiv ergänzt stattdessen weitere **physische Exemplare** innerhalb derselben Ausgabe. In der Warteschlange können für jedes Exemplar separat Zustand, Lesestatus, Folierung und Notiz gepflegt werden.

### Geführter Zustandsassistent

Der Zustandsassistent überträgt das in der deutschen Comicszene gebräuchliche Raster von Zustand 0 bis 5 in einen geführten Ablauf:

1. Vollständigkeit von Comicteil und Umschlag,
2. Gesamteindruck,
3. konkrete Mängel,
4. Empfehlung mit Begründung.

Besondere Mängel können auf Wunsch automatisch als Notiz übernommen werden. Der Assistent ist erreichbar beim normalen Hinzufügen und Bearbeiten, im Scanner Pro, bei fehlenden Bänden, im Flohmarkt-Modus und in der Exemplareverwaltung.

### Stabilere Kopfbereiche

Unterseiten besitzen jetzt eine undurchlässige, klar über dem Inhalt liegende Kopfzeile. Karten, Cover und Auswahlleisten laufen beim Scrollen hinter dem Header durch und nicht mehr darüber.

## Datenschutz und Speicherung

- Sammlung, Exemplare, eigene Cover und Einstellungen bleiben lokal in IndexedDB.
- Der Scanner wertet Kamera- und Fotodaten lokal aus.
- Nur die optionale Metadatenanreicherung fragt öffentliche Duckipedia-Daten ab.
- Es gibt kein Benutzerkonto und keine Server-Datenbank.
- Regelmäßige JSON- und Medien-Backups bleiben notwendig.

## Technische Eckdaten

- App-Version: `4.2.0`
- Datenformat: `9`
- Archivmodell: `1`
- IndexedDB-Schema: `5`
- Vanilla HTML, CSS und JavaScript
- GitHub Pages mit vorgeschalteter GitHub-Actions-Prüfung
- Scanner- und PDF-Bibliothek werden weiterhin nur bei Bedarf geladen

## Projektstruktur

```text
Entenarchiv/
├── index.html
├── style.css
├── app.js
├── archive-model.js
├── scanner.js
├── scanner-pro.js
├── condition-assistant.js
├── shelf.js
├── shelf-ui.js
├── storage.js
├── export.js
├── service-worker.js
├── tests/
├── scripts/
└── .github/workflows/
```

## Lokale Qualitätsprüfung

```bash
npm run check
npm run build
```

Für die normale Veröffentlichung sind auf dem Mac keine Installationen erforderlich. GitHub Actions führt dieselben Prüfungen nach jedem Commit aus und veröffentlicht nur eine erfolgreiche Version.
