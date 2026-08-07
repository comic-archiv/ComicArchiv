# Entenarchiv 3.9.0

Entenarchiv ist eine private, mobile und offlinefähige Progressive Web App zur Verwaltung von Lustigen Taschenbüchern und Sonderbänden.

Version 3.9.0 ist bewusst kein großes Funktionspaket. Sie schafft das Sicherheits- und Qualitätsfundament für Entenarchiv 4, ohne die vorhandene Sammlung oder das Datenformat zu verändern.

## Neu in 3.9.0

### Sicherer Modus

`recovery.js` wird vor der eigentlichen App geladen. Scheitert der Start oder ist er nach 30 Sekunden nicht abgeschlossen, bleibt ein unabhängiger Notfallzugang verfügbar.

Der sichere Modus kann:

- ein JSON-Notfall-Backup direkt aus IndexedDB erstellen,
- ein vollständiges Notfall-Backup einschließlich eigener Coverbilder erstellen,
- ungültige Kalenderdaten und beschädigte technische Einstellungen normalisieren,
- Service Worker und Offline-App-Dateien erneuern, ohne die Sammlung zu löschen,
- einen technischen Diagnosebericht exportieren,
- die App kontrolliert neu starten.

Ein einzelner beschädigter Termin oder eine fehlerhafte Einstellung soll dadurch nicht mehr den Zugriff auf die Sicherungsfunktionen verhindern.

### Diagnose & Sicherheit

Unter `Export & Backup → Technische Speicherdetails → Diagnose & Sicherheit` prüft Entenarchiv unter anderem:

- App- und Datenformat-Version,
- vorhandene IndexedDB-Speicherbereiche,
- Anzahl der Comics, Cover und Metadatensätze,
- Gültigkeit der Kalenderwerte,
- Speicherbelegung und gemeldetes Kontingent,
- Service-Worker- und Offline-Status,
- Ladezustand der optionalen Scanner- und PDF-Module,
- die letzten technischen Fehlermeldungen.

Der Diagnosebericht nimmt keine Comic-Titel, Notizen oder Bildinhalte als reguläre Berichtsdaten auf.

### Getrennter Testmodus

Im Diagnosebereich lässt sich ein separater Testmodus öffnen. Er verwendet die eigene Datenbank `comicarchiv-db-test` und berührt die echte Sammlung in `comicarchiv-db` nicht.

Damit lassen sich beispielsweise folgende Vorgänge gefahrlos ausprobieren:

- Backup importieren,
- Reihen umbenennen oder löschen,
- viele Testbände scannen,
- Flohmarktfunde übernehmen,
- Kalenderdaten aktualisieren.

Ein gut sichtbarer gelber Hinweis kennzeichnet den Testmodus. Über `Echte Sammlung öffnen` gelangt man zurück.

### Schnellere Starts durch bedarfsgeladene Module

Die großen Drittanbieter-Bibliotheken werden nicht mehr bei jedem App-Start ausgeführt:

- Quagga2 wird erst beim Öffnen des Serien-Scanners geladen.
- jsPDF wird erst beim Erzeugen einer Flohmarkt-PDF geladen.

Bereits vorhandene Offline-Kopien werden bei einem Update übernommen. Bei einer vollständigen Neuinstallation werden die Module nach der ersten Verwendung lokal zwischengespeichert.

### Fehlertoleranter Service Worker

Der Service Worker unterscheidet jetzt:

- kritische App-Dateien,
- kleine optionale Kalenderdateien,
- große Module, die nur bei Bedarf gebraucht werden.

Fehlt eine kritische Datei während der Installation, wird die bisher aktive Version nicht durch eine unvollständige Offline-Version ersetzt. Fehler bei optionalen Dateien werden protokolliert, blockieren die Kern-App aber nicht.

### Automatische Qualitätsprüfung

Das Projekt enthält 19 automatisierte Tests für:

- Versionen und Datenformat,
- Migration des Zustandssystems,
- Duckipedia-Pfade und Umlaute,
- Fehlbandberechnung,
- Barcode-Zusatzcodes,
- Kalenderimport und Jahr-0-Schutz,
- CSV-Escaping,
- Backup-Erzeugung und -Validierung,
- eindeutige HTML-IDs,
- vorhandene JavaScript-Ziele,
- Offline-Dateien,
- Lazy Loading,
- Diagnose, sicheren Modus und Testmodus.

Zusätzlich prüft `scripts/validate-project.mjs` alle eigenen JavaScript-Dateien syntaktisch und kontrolliert die Projektstruktur.

## Geprüfte Veröffentlichung über GitHub Actions

Unter `.github/workflows/deploy-pages.yml` liegt ein optionaler Veröffentlichungsworkflow. Bei Verwendung von `GitHub Actions` als Pages-Quelle passiert Folgendes:

1. Projektstruktur und JavaScript werden geprüft.
2. Alle 19 Tests müssen erfolgreich sein.
3. Ein sauberes Produktionspaket wird in `dist/` erzeugt.
4. Nur dieses geprüfte Paket wird auf GitHub Pages veröffentlicht.

Schlägt die Qualitätsprüfung fehl, findet keine neue Actions-Veröffentlichung statt.

## Datenspeicherung und Kompatibilität

- Produktive Datenbank: `comicarchiv-db`
- Testdatenbank: `comicarchiv-db-test`
- IndexedDB-Schema: unverändert, Version 4
- Datenformat: unverändert, Version 8
- bestehende Comics, Cover, Reihen, Ziele, Kalendertermine und Flohmarktmarkierungen bleiben erhalten
- Backups aus früheren Versionen bleiben kompatibel

Vor jedem Update bleibt ein aktuelles JSON-Backup empfohlen. Eigene Coverbilder benötigen zusätzlich das Medien-Backup.

## Projektprüfung

Die Qualitätsprüfung läuft in GitHub automatisch. Mit einer vorhandenen Node.js-Umgebung kann sie zusätzlich lokal ausgeführt werden:

```text
npm run check
```

Ein sauberes Pages-Paket wird erzeugt mit:

```text
npm run build
```

Für die normale Nutzung und Bearbeitung der App ist keine lokale Node.js-Installation erforderlich.
