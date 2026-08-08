# Qualitätsbericht Entenarchiv 4.3.0

## Umfang

Geprüft wurden der Zurück-Button-Hotfix, das Erscheinungsradar, die Verknüpfung von Verlagsterminen mit Sammlung und Fehlbänden, der optionale App-Badge, der iCal-Erinnerungsexport, die automatische Jahresplan-Erkennung und der Produktions-Build.

## Automatisierte Prüfung

- 94 Logik-, Struktur- und Regressionstests erfolgreich
- 33 erforderliche Projektdateien geprüft
- 482 eindeutige HTML-IDs geprüft
- 417 statische JavaScript-Verknüpfungen geprüft
- Syntaxprüfung von 39 JavaScript- und Testdateien
- 31 Service-Worker-Dateien geprüft
- Produktions-Build erfolgreich erzeugt

## Neue Regressionstests

### Unterseiten-Navigation

- die globale App-Kopfzeile wird während einer Unterseite ausgeblendet
- Unterseiten-Kopfzeilen besitzen eine eigene hohe Ebene
- Zurück-Buttons bleiben sichtbar, anklickbar und über scrollenden Inhalten

### Erscheinungsradar

- `LTB 614` wird stabil der Hauptreihe und Band 614 zugeordnet
- längere Aliasse wie `LTB Fantasy Entenhausen` gewinnen vor dem allgemeinen Kürzel `LTB`
- nicht eindeutig zuordenbare Verlagstermine bleiben sichtbar
- vorhandene, fehlende und nicht vorgemerkte Ausgaben werden unterschieden
- bekannte Termine werden nicht erneut als neu markiert
- Vormerken, Bestellt und Ignorieren werden validiert
- vorhandene und ignorierte Ausgaben erzeugen keine offenen Badges
- eine heute fällige und zugleich neue Ausgabe wird im Badge nur einmal gezählt
- Filter und Zusammenfassungen liefern konsistente Werte

### Automatische Jahrespläne

- relative und absolute offizielle iCal-Links werden erkannt
- fremde Hosts und unsichere HTTP-Links werden abgelehnt
- Kalenderjahr wird aus validen DTSTART-Zeilen ermittelt
- eine explizite `v2` gewinnt vor `v1`
- bereits vorhandene andere Jahrgänge bleiben erhalten
- unvollständige iCal-Dateien werden abgelehnt
- ein Netzwerkfehler blockiert den vorhandenen Kalenderstand nicht

### Oberfläche und Build

- Startseiten-, Kalender- und Radar-Einstiege sind vollständig verdrahtet
- App-Badge verwendet ausschließlich die Plattformfunktionen `setAppBadge` und `clearAppBadge`
- `release-radar.js` liegt im Service-Worker-Paket und im Produktions-Build
- Workflow enthält Zeitplan und Synchronisationsschritt
- Datenformat, Archivmodell und IndexedDB-Schema bleiben unverändert

## Kompatibilität

Unverändert bleiben:

- Datenformat `9`
- Archivmodell `1`
- IndexedDB-Schema `5`
- Datenbankname `comicarchiv-db`

Es ist keine Datenmigration erforderlich.

## Einschränkungen der Testumgebung

Die reale Darstellung eines Home-Screen-Badges, die iOS-Mitteilungsberechtigung, Apple-Kalender-Übergabe und das konkrete Scrollverhalten werden abschließend auf dem Ziel-iPhone geprüft. Der offizielle LTB-Server war aus der isolierten Build-Umgebung zeitweise nicht erreichbar; das Synchronisationsskript hat in diesem Fall wie vorgesehen den vorhandenen Kalenderstand verwendet, ohne Test oder Veröffentlichung abzubrechen.
