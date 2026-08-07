# Änderungsprotokoll

## 4.0.0 – Archivkern

### Neu

- stabiles Datenmodell mit getrennten Reihen, Ausgaben und physischen Exemplaren
- dauerhafte interne IDs für Standardreihen und eigene Reihen
- eindeutige Ausgabeidentität aus Reihen-ID und normalisierter Bandnummer
- beliebig viele physische Exemplare pro Ausgabe
- eigener Zustand, Lesestatus, Folierungsstatus und Notiz pro Exemplar
- Exemplarmanager über das Einstellungsmenü jeder Comic-Karte
- lokaler Rückfall-Schnappschuss vor der ersten Umstellung
- einmaliger, exportierbarer und später erneut aufrufbarer Migrationsbericht
- expliziter Archivkern in JSON- und Medien-Backups
- Diagnoseprüfungen für Reihen, Ausgaben, Exemplare und Archivstatus
- Notfall-Backups mit Archivkern im sicheren Modus
- `archive-model.js` als eigenständiges, testbares Kernmodul
- realer Browser-Migrationstest für IndexedDB-Schema 4 auf 5

### Verbessert

- Scanner, manuelle Erfassung, Flohmarkt-Modus und Import führen dieselbe Ausgabe nicht mehr als getrennte Bände
- rein numerische Bandnummern mit führenden Nullen werden vereinheitlicht
- alte Dubletten werden als weitere physische Exemplare übernommen
- eigene Reihen können umbenannt werden, ohne ihre interne Identität zu verlieren
- ungenutzte eigene Reihen werden vollständig entfernt; verwendete Reihen werden intern archiviert
- Cover werden bei zusammengeführten Altdatensätzen auf die richtige Ausgabe übertragen
- CSV-Export erzeugt eine Zeile pro physischem Exemplar
- Import zeigt Ausgaben und physische Exemplare getrennt an
- Zusammenführen von Backups liefert eine sichere Cover-ID-Zuordnung
- fehlgeschlagene Migration lässt den bisherigen Datenspeicher unverändert

### Kompatibilität

- Datenbankname bleibt `comicarchiv-db`
- Datenformat steigt von 8 auf 9
- IndexedDB-Schema steigt von 4 auf 5
- Archivmodell startet mit Version 1
- ältere JSON- und Medien-Backups bleiben importierbar
- bisherige Oberfläche arbeitet über eine kompatible Projektion weiter

## 3.9.0 – Sicherheits- und Qualitätsfundament

- unabhängiger sicherer Modus
- Diagnosebericht und Testdatenbank
- bedarfsgeladener Scanner und PDF-Export
- robuster Service Worker
- automatische Tests und GitHub-Actions-Veröffentlichung
