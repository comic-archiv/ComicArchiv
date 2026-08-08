# Änderungen

## 4.3.0 – Erscheinungsradar und automatische Jahrespläne

### Behoben

- die globale App-Kopfzeile verdeckt keine Zurück-Buttons von Unterseiten mehr
- Unterseiten-Kopfzeilen bleiben unabhängig von Regal-, Kalender- und Karteninhalten erreichbar

### Neu

- persönliche Release-Inbox aus offiziellen Verlagsterminen
- automatische Zuordnung von Kalenderterminen zu stabilen Reihen- und Ausgaben-IDs
- Status **Im Besitz**, **Fehlt**, **Nicht vorgemerkt**, **Vorgemerkt**, **Bestellt** und **Ignoriert**
- direkte Verknüpfung mit Sammlung, Fehlbandverwaltung und Hinzufügen-Formular
- Filter für offen, neu, vorgemerkt, bestellt, ignoriert und alle Termine
- iCal-Export vorgemerkter und bestellter Veröffentlichungen
- optionales App-Badge für neue und heute fällige Ausgaben
- kompakte Radar-Karte auf der Startseite und zusätzlicher Einstieg im Kalender
- wöchentliche Prüfung des offiziellen LTB-Downloadbereichs über GitHub Actions
- automatische Auswahl der neuesten v1/v2-Version je Kalenderjahr
- fehlertoleranter Fallback auf den bereits vorhandenen Kalenderbestand
- neues Modul `release-radar.js`
- neues Synchronisationsskript `scripts/sync-release-calendars.mjs`

### Kompatibilität

- Datenbank bleibt `comicarchiv-db`
- IndexedDB-Schema bleibt Version 5
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- keine Datenmigration erforderlich
- bestehende Kalendertermine, Flohmärkte, Sammlung und Backups bleiben erhalten
- 94 automatisierte Tests

## 4.2.0 – Scanner Pro und Zustandsassistent

- Header-Ebenen korrigiert: scrollende Elemente laufen hinter der Kopfzeile durch.
- kontinuierlicher Scanner-Modus für Stapelerfassung
- optionaler Prüfmodus vor dem Vormerken
- Sitzungsstatistik und strukturierte Warteschlange
- mehrere physische Exemplare pro gescannter Ausgabe
- getrennte Zustände, Lesestatus, Folierung und Notizen je Exemplar
- geführter Zustandsassistent auf Basis des deutschen Zustandsrasters
- Scanner- und Assistentmodule im Offline-Paket
- 74 automatisierte Tests


## 4.1.2 – Infobox-Cover und vollflächige Banddetails

### Behoben

- Duckipedia-Cover werden nicht mehr aus beliebigen Bildern einer Bandseite erraten.
- Das Infobox-Feld `BILD` wird als Originalcover verwendet; `NEU-BILD` überschreibt es nicht.
- Rezensionbilder, Logos, Icons und Storybilder werden nicht mehr als Cover gespeichert.
- sichtbare Cover laden auf iOS ohne vorheriges Öffnen einer Banddetailansicht.
- Cover verschwinden beim Wechsel zwischen Reihe, Bibliothek und Startseite nicht mehr sofort.
- die Banddetailansicht ist auf dem iPhone keine kleine Bottom-Sheet-Fläche mehr.

### Verbessert

- Cover-Lookup-Version 3 invalidiert alte ungenaue Cacheergebnisse.
- MediaWiki-`imageinfo` löst die in der Vorlage genannte Datei in eine skalierte Bild-URL auf.
- gerenderte rechte Duckipedia-Infobox dient als begrenzter Fallback bei ungewöhnlichen Vorlagen.
- getrennte IntersectionObserver für Reihenbibliothek und Regal verwenden die jeweilige interne Scrollfläche.
- sichtbare und nahe Cover werden zusätzlich mehrfach aktiv angestoßen.
- Scroll-Fallback gleicht verpasste Observer-Ereignisse aus.
- native Bild-Lazy-Loading-Hinweise wurden aus den intern scrollenden Regalansichten entfernt.
- lokale Blob-URLs bleiben beim normalen Ansichtswechsel erhalten.
- Detailansicht nutzt mobil `100dvh` und auf größeren Displays bis zu `90dvh`.

### Weiterhin enthalten

- überlappungsfreier Reihenkopf,
- sauber formatierte nächste Neuerscheinung,
- kontinuierliches Regal ohne Bandbereich-Auswahl,
- begrenzte parallele Coverabfragen,
- vollständige Suche und Filter über die ganze Reihe.

### Kompatibilität

- Datenbank bleibt `comicarchiv-db`
- IndexedDB-Schema bleibt Version 5
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- keine Datenmigration erforderlich

## 4.1.0 – Digitale Regale

### Neu

- digitale Regalansicht mit vorhandenen Bänden und sichtbaren Lücken in numerischer Reihenfolge
- hochwertige Detailseite für jede Reihe
- Reihenbibliothek für Sonderbände und eigene Reihen
- acht automatisch zusammengestellte intelligente Listen
- kompakte Banddetailansicht mit allen physischen Exemplaren
- direkte Verbindung fehlender Regalplätze zur Fehlbandverwaltung
- Reihensuche, Filter und Sortierung
- Bandbereiche für lange Reihen
- Sammelbearbeitung für gelesen, foliert und Zustand
- direktes Rückgängigmachen der letzten Sammeländerung
- Anzeige der nächsten passenden Neuerscheinung aus dem Kalender
- neue Module `shelf.js` und `shelf-ui.js`

### Verbessert

- Hauptreihe öffnet sich vom Startbildschirm direkt als digitales Regal
- Sonderreihen werden visuell statt als lange Gesamtliste erschlossen
- Dashboard-Kennzahl „Reihen“ führt in die neue Bibliothek
- lokale Cover werden über Schlüssel erkannt, ohne alle Bilddateien vorab zu laden
- eigene und Duckipedia-Cover werden zentriert und proportional dargestellt
- lange Hauptreihen werden auf dem iPhone in überschaubare 60er-Bereiche gegliedert
- Lücken, Exemplarzahlen, ungelesene und mehrfache Bände werden direkt an der Reihe sichtbar
- redundante Version-4.1-Stile wurden bereinigt

### Kompatibilität

- Datenbank bleibt `comicarchiv-db`
- IndexedDB-Schema bleibt Version 5
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- keine neue Datenmigration erforderlich
- bestehende Version-4-Backups bleiben unverändert kompatibel

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
