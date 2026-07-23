# Entenarchiv 3.6.1

Private, mobile Progressive Web App zur Verwaltung einer LTB- und Sonderband-Sammlung.

## Hotfix 3.6.1

- behebt den iOS-Startfehler „Jahr darf nicht 0 betragen“
- ungültige ältere Kalenderjahre werden automatisch auf das aktuelle Jahr gesetzt
- ungültige Kalenderdaten und Zeitstempel werden ohne Absturz verworfen
- bereinigte Einstellungen werden beim ersten erfolgreichen Start dauerhaft gespeichert

## Enthalten seit 3.6.0

- jahresunabhängiger Kalender über `data/kalender-index.json`
- automatische Erkennung verfügbarer Jahrespläne
- automatische Aktualisierung des aktuellen und folgenden Jahres
- Versionsprüfung pro Jahresplan ohne doppelte Verlagstermine
- Mehrjahresauswahl im Kalender
- Heute-Button
- Suche nach Titel, Ort und Notiz
- Filter nach Neuerscheinung, Flohmarkt, Comicbörse und sonstigen Terminen
- Jahresplan einzeln laden, aktualisieren oder entfernen
- eigene Termine bleiben bei allen Aktualisierungen erhalten
- Import beliebiger zusätzlicher iCal-Dateien bleibt möglich
- Apple-Kalender-Export mit Erinnerungen bleibt erhalten

## Neues Jahr ergänzen

Die App-Adresse bleibt unverändert. Für ein neues Jahr werden lediglich zwei Dateien im Repository angepasst:

1. offizielle iCal-Datei als `data/ltb-JAHR.ics` hochladen
2. einen Eintrag in `data/kalender-index.json` ergänzen
3. `updatedAt` im Index aktualisieren
4. committen und GitHub Pages abwarten
5. in Entenarchiv `Kalender > Jahrespläne verwalten > Jahre prüfen` wählen

Eine vollständige Vorlage befindet sich in `data/README.txt`.

## Datenspeicherung

Sammlung, eigene Termine und Einstellungen bleiben lokal in IndexedDB auf dem Gerät gespeichert. Der Kalenderindex und die mitgelieferten Verlagstermine sind statische Dateien im GitHub-Pages-Projekt.
