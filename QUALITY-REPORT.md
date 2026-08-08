# Qualitätsbericht Entenarchiv 4.3.1

## Schwerpunkt

Version 4.3.1 ergänzt eine persistente Zuordnung nicht erkannter Kalendertermine zu bestehenden oder neu angelegten Reihen.

## Automatisierte Prüfungen

- 98 automatisierte Tests erfolgreich
- Projektvalidierung erfolgreich
- 497 eindeutige HTML-IDs geprüft
- 431 statische App-Selektoren geprüft
- 40 JavaScript-Dateien syntaktisch geprüft
- 31 Offline-Dateien geprüft
- Kalenderjahr 2026 mit 100 gültigen Terminen validiert
- Produktions-Build erfolgreich erstellt

## Spezifische Regressionstests

Geprüft wurden unter anderem:

- manuelle Einzelzuordnung eines unbekannten Verlagstermins
- Kalender-Alias für künftige Bände derselben Reihe
- Vorschlag von Reihennamen und Bandnummer aus einem unbekannten Kalendertitel
- bestehende LTB-Aliase und Priorisierung längerer Aliase
- Zustand `Nicht zugeordnet` bleibt ohne Zuordnung erhalten
- Datenformat 9, Archivmodell 1 und IndexedDB-Schema 5 bleiben unverändert
- GitHub-Actions-Workflow bleibt Node-24-kompatibel
- Service Worker und Produktions-Build bleiben vollständig

## Datensicherheit

Neue Daten werden ausschließlich in den bestehenden App-Einstellungen gespeichert:

- Kalender-Aliase nach stabiler Reihen-ID
- manuelle Terminverknüpfungen nach Termin-Signatur

Beim Löschen einer eigenen Reihe werden ihre Kalender-Aliase und manuellen Terminverknüpfungen ebenfalls entfernt. Beim Backup-Import werden diese Daten validiert; beim Zusammenführen werden Aliase und Terminverknüpfungen zusammengeführt statt verworfen.

## Keine Migration

Es wurde keine IndexedDB-Struktur verändert. Eine erneute Migration der Sammlung ist nicht erforderlich.
