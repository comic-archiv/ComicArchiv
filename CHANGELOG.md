# Änderungsprotokoll

## 3.9.0 – Sicherheits- und Qualitätsfundament

### Neu

- unabhängiger sicherer Modus vor dem eigentlichen App-Start
- JSON- und Medien-Notfall-Backup direkt aus IndexedDB
- Reparatur ungültiger Kalenderdaten und technischer Einstellungen
- kontrolliertes Erneuern von Service Worker und App-Cache
- lokales technisches Fehlerprotokoll
- exportierbarer Diagnosebericht ohne reguläre Comic-Inhalte
- Diagnoseoberfläche für Datenbank, Speicher, Service Worker und optionale Module
- separater Testmodus mit eigener IndexedDB
- bedarfsgeladenes Scanner-Modul
- bedarfsgeladenes PDF-Modul
- Service Worker mit kritischen, optionalen und bedarfsgeladenen Dateien
- `version.json` als maschinenlesbare Release-Information
- 19 automatisierte Logik- und Strukturtests
- statische Projektvalidierung
- automatischer GitHub-Pages-Workflow mit vorgeschalteter Qualitätsprüfung
- sauberer Produktions-Build über `scripts/build-static.mjs`

### Verbessert

- optionale Speicher- und Medienprüfungen können den Start nicht mehr abbrechen
- fehlgeschlagene optionale Module lassen sich erneut laden
- Startüberwachung auf iPhone-freundliche 30 Sekunden erhöht
- technische Fehler werden kontextbezogen protokolliert
- Diagnose- und Notfallfunktionen erzeugen nicht unbeabsichtigt eine leere Datenbank
- große Drittanbieter-Bibliotheken werden beim normalen App-Start nicht mehr ausgeführt

### Kompatibilität

- keine Änderung des IndexedDB-Schemas
- keine Änderung des Datenformats
- keine Migration bestehender Sammlungsdaten notwendig
