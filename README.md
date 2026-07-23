# Entenarchiv 3.5.0

Private mobile PWA zur Verwaltung einer Sammlung von Lustigen Taschenbüchern und Sonderbänden.

## Neu in 3.5.0

- Kalenderansicht für Neuerscheinungen und eigene Termine
- Import von iCalendar-Dateien (`.ics`)
- Versuch des direkten Imports über die offizielle Jahresplan-URL
- Datei-Fallback, falls der Verlag den direkten Browserzugriff blockiert
- eigene Termine wie Flohmärkte oder Comicbörsen
- Monatskalender und Jahresnavigation
- Export in Apple Kalender mit Erinnerungen am Erscheinungstag
- Kalenderdaten werden im JSON- und Medien-Backup gesichert

## Datenschutz

Sammlung, Kalendertermine und eigene Veranstaltungen werden lokal in IndexedDB gespeichert. Beim direkten Laden eines Jahresplans wird nur die eingetragene iCal-Adresse abgerufen.

## Hinweis zu Erinnerungen

Entenarchiv verwendet für zuverlässige Erinnerungen ohne eigenen Server den Export in Apple Kalender. Echter Web Push für eine geschlossene PWA benötigt einen Push-Server, der die Benachrichtigungen zum richtigen Zeitpunkt versendet.
