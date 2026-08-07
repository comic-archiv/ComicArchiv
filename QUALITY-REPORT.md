# Qualitätsbericht Entenarchiv 3.9.0

Prüfdatum: 7. August 2026

## Erfolgreich geprüft

- 25 erforderliche Laufzeit- und Offline-Dateien vorhanden
- 25 vom Service Worker referenzierte Dateien lokal über HTTP erreichbar
- 348 eindeutige HTML-IDs
- 291 statische JavaScript-Ziele auf vorhandene HTML-Elemente geprüft
- 21 eigene JavaScript- und Prüfdateien syntaktisch validiert
- 19 automatisierte Tests erfolgreich
- Kalenderdatei 2026 mit 100 Terminen eingelesen
- Jahr-0- und unsichere Kalenderpfade abgelehnt
- Backup-Erzeugung und erneute Validierung erfolgreich
- CSV-Sonderzeichen, Anführungszeichen und Zeilenumbrüche geprüft
- Fehlbandberechnung, Dubletten und gelöschte Reihenziele geprüft
- Barcode-Zusatzcodes `03` und `00239` geprüft
- Zustandsmigration des alten Rasters geprüft
- Duckipedia-Pfad mit `präsentiert` geprüft
- Scanner- und PDF-Bibliothek nicht mehr direkt in `index.html` geladen
- sicherer Modus, Diagnose und getrennte Testdatenbank eingebunden
- Service Worker unterscheidet Kern-, optionale und bedarfsgeladene Dateien
- Manifest und vier verwendete Icongrößen geprüft
- sauberer Produktions-Build erfolgreich erzeugt

## Nicht automatisierbar in dieser Umgebung

Der abschließende Praxistest von Kamera, iOS-Teilen-Menü, Home-Screen-PWA, Service-Worker-Update und IndexedDB-Verhalten muss nach der Veröffentlichung auf dem konkreten iPhone erfolgen. Dafür enthält die separate Update-Anleitung einen Testplan.
