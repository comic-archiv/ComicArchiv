# Änderungen

## 4.6.11 – DOM Registry Extraction

- Die zentrale DOM-Referenzliste ist aus `app.js` in `app-elements.js` ausgelagert.
- Der Projektvalidator prüft statische HTML-ID-Referenzen jetzt über App, DOM-Registry und Shelf-UI gemeinsam.
- Lazy-DOM-Hydration und bestehende Elementnamen bleiben unverändert.

## 4.6.10 – Collection Query Module

- Scope-, Filter- und Sortierlogik der Sammlung ist aus `app.js` in `collection-query.js` ausgelagert.
- Die Query-Schicht ist DOM-frei und separat testbar.
- Rendering und bestehende Filteroberfläche bleiben unverändert.

## 4.6.9 – Diagnostics Feature Module

- Diagnose-Dialog, Prüfbericht-Rendering und Diagnoseexport sind aus `app.js` in `diagnostics-ui.js` ausgelagert.
- `app.js` behält nur die übergreifende Fehlerprotokollierung.
- Diagnose bleibt lazy gemountet und unverändert lokal.

## 4.6.8 – App Utility Extraction

- Allgemeine Sortier-, Formatierungs-, URL- und Normalisierungshelfer sind aus `app.js` in `app-utils.js` ausgelagert.
- Das neue Modul ist zustandsfrei und separat testbar.
- Runtime-Verhalten und Datenmodell bleiben unverändert.

## 4.6.7 – Custom Series Legacy Field Retirement

- `customSeriesConfigs` ist die einzige aktive Settings-Quelle für eigene Reihen.
- Die redundante `customSeries`-Namensliste wird nicht mehr gespeichert oder in Feld-Settings geführt.
- Alte Backups mit `customSeries` bleiben als Import-Fallback unterstützt und werden in Konfigurationen überführt.

## 4.6.6 – Archive Storage API Cleanup

- Aktive Storage-APIs tragen keine Legacy-`Comic`-Namen mehr: Einzel-, Batch-, Lösch- und Importpfade sprechen explizit von Archive Entries.
- Die Änderung ist rein semantisch; Datenformat 9, Archivmodell 1 und IndexedDB-Schema 6 bleiben unverändert.
- `getAllComics()` bleibt ausschließlich als klar markierter historischer Migrationsadapter erhalten.

## 4.6.5 – Legacy Storage Retirement

- Archivgraph und Feld-Settings sind die einzigen aktiven Datenquellen der App.
- Vor der Stilllegung wird ein vollständiger `pre-legacy-storage-retirement-v1`-Snapshot angelegt.
- Die früher live gepflegten `comics`- und Mega-`settings`-Datensätze werden anschließend geleert.
- Einzel-, Batch-, Lösch-, Reihen- und Backup-Import-Pfade schreiben nicht mehr in den `comics`-Mirror.
- Aktive Settings lesen nach dem Cutover ausschließlich aus den 35 Feld-Datensätzen; ein stiller Rückfall auf eingefrorene Legacy-Settings entfällt.
- Data-Stack-Rollbacks restaurieren Archivgraph und Feld-Settings, ohne die stillgelegten Legacy-Stores wieder zu aktivieren.
- Diagnose bewertet den Archivgraph unabhängig von einem Legacy-Mirror und liest die aktiven Settings-Stores.
- Die leeren `comics`-/`settings`-Stores bleiben vorerst als Schema-Hüllen bestehen, damit direkte Upgrades älterer Installationen sicher migrieren können.
- Datenformat 9, Archivmodell 1 und IndexedDB-Schema 6 bleiben unverändert.

## 4.6.4 – Archive Graph Read Cutover

- Die laufende Sammlung wird direkt aus `seriesCatalog`, `issues` und `copies` geladen; der persistierte `comics`-Store ist keine Runtime-Lesequelle mehr.
- Neues Modul `archive-runtime.js` validiert den Archivgraph und erzeugt eine reine In-Memory-Kompatibilitätsansicht für bestehende UI-Komponenten.
- `refreshCollection()` bricht bei einem ungültigen Archivgraph bewusst ab, statt still auf den Legacy-Mirror zurückzufallen.
- Einzel- und Batch-Saves liefern direkt Archive-Runtime-Einträge zurück; der weiterhin gepflegte Legacy-Mirror nutzt im Hot Path dieselbe kompatible Projektion.
- Data Stack v2 kennzeichnet den aktiven Zustand mit „Archivgraph aktiv“.
- `getAllComics()` bleibt nur als Kompatibilitätsadapter für alte Backup-/Migrationspfade erhalten.
- Datenformat 9, Archivmodell 1 und IndexedDB-Schema 6 bleiben unverändert.

## 4.6.3 – Settings Cutover

- Die sechs Schema-6-Settings-Stores werden zur aktiven Lesequelle der App.
- Alle 35 normalisierten Einstellungen werden beim Cutover zusätzlich als einzelne Feld-Datensätze gespeichert.
- Änderungen schreiben nur noch die tatsächlich geänderten Feld-Datensätze; ein Monatswechsel im Kalender schreibt dadurch nicht mehr den kompletten Settings-Block oder die 100 Kalendertermine erneut.
- Der bisherige `settings`-Mega-Datensatz wird beim Cutover eingefroren und bleibt als statischer Sicherheitsfallback bestehen.
- Vor der Aktivierung wird ein `pre-settings-cutover-v1`-Snapshot erstellt und die Feldmigration vollständig gegen den bisherigen sicheren Zustand geprüft.
- Nach dem Cutover überspringt die Settings-Split-Prüfung bewusst den nun eingefrorenen Legacy-Datensatz und prüft stattdessen die Vollständigkeit der aktiven Feld-Datensätze.
- Storage-Pfade für Comic-Saves, Batch-Importe und Archivmigration lesen cutover-aware aus den getrennten Settings.
- Data Stack v2 zeigt den erfolgreichen Zustand als „Einstellungen getrennt aktiv“.
- Der `comics`-Mirror bleibt weiterhin aktiv und wird erst in einer späteren Data-Stack-Tranche aus dem Live-Pfad entfernt.

## 4.6.2 – Legacy Mirror Repair

- Data Stack v2 kann einen veralteten `comics`-Mirror automatisch aus dem validen Archivgraph neu erzeugen, wenn auf beiden Seiten exakt dieselben Ausgabe-IDs vorhanden sind.
- Vor der Reparatur wird ein eigener `pre-legacy-mirror-repair-v1`-Snapshot mit dem bisherigen Mirror und einer Feld-Diagnose gespeichert.
- Fehlende oder zusätzliche Ausgabe-IDs bleiben weiterhin ein harter Fehler und werden nicht automatisch überschrieben.
- Änderungen an Reihen-Definitionen synchronisieren künftig die betroffenen Legacy-Mirror-Einträge, damit Seriennamen nicht erneut auseinanderlaufen.
- Der Settings Split bleibt weiterhin in der Spiegelphase; ein Read/Write-Cutover findet in diesem Hotfix noch nicht statt.

## 4.6.1 – Settings Split Mirror

- Data Stack v2 spiegelt den bisherigen Settings-Datensatz verlustfrei in sechs fachlich getrennte Schema-6-Stores.
- Vor der ersten Spiegelung wird ein eigener `pre-settings-split-v1`-Snapshot angelegt.
- Paritätsprüfungen erkennen fehlende oder abweichende Settings-Gruppen und verhindern einen stillen Cutover.
- `saveAppSettings()` hält Legacy-Settings und die neuen Stores in einer gemeinsamen IndexedDB-Transaktion synchron.
- Der Legacy-Settings-Datensatz bleibt bewusst noch aktiv; der eigentliche Read/Write-Cutover folgt erst nach erfolgreicher Bewährung dieser Spiegelphase.

## 4.6.0 – Data Stack v2 Foundation

- IndexedDB-Schema 6 legt getrennte Ziel-Stores für Einstellungen, Kalender, Fehlbände, Flohmarkt, Release Radar und Sammelziele an, ohne bestehende Daten bereits umzuziehen.
- Vor der späteren Datenaufteilung wird automatisch ein lokaler Snapshot aus Archivgraph, Legacy-Mirror und Einstellungen angelegt.
- Der Archivgraph und sein `comics`-Mirror werden vor Freigabe der Foundation vollständig auf Parität geprüft.
- Eine interne Restore-Funktion kann den letzten Data-Stack-Snapshot atomar wiederherstellen.
- `comics` und der bestehende Settings-Datensatz bleiben in 4.6.0 bewusst weiterhin aktiv; die eigentliche Ablösung folgt schrittweise.

## 4.5.3 – Core Cleanup
### Performance
- statische App-Assets laufen nach Installation cache-first; Navigation, Versionsdatei und Kalenderdaten bleiben network-first
- 1024er Icon und doppelter Root-Einstieg aus dem Core-Precache entfernt
- schwere Collection-Unterseiten und die Statistik rendern nur noch, wenn sie sichtbar sind
- Scanner und Share Cards bleiben unverändert als App- und Offline-Bestandteile erhalten
- Bulk-Speicherpfad bündelt Änderungen in einer IndexedDB-Transaktion

### Datenhygiene
- Duckipedia-Metadaten-Cache wird anhand der bestehenden 90-Tage-TTL automatisch bereinigt
- feste 2026er Kalender-URL aus den Defaults entfernt; der Kalenderindex ist die Quelle für Jahrespläne
- private Backups/Exporte und generiertes dist werden über .gitignore geschützt
- Duckipedia-Nutzung in den Drittanbieterhinweisen dokumentiert

### Technik
- App-Version und Service-Worker-Cache auf 4.5.3 angehoben
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- IndexedDB-Schema bleibt Version 5
- keine Datenmigration erforderlich
- zusätzliche Regressionstests für Cache-, Render-, Batch- und Repo-Hygiene

## 4.5.2 – Dashboard-, Share-Card- und Kalender-Polish

### Design

- Fehlende Bände spannt auf dem Dashboard die komplette Kennzahlenzeile auf
- identische gelbe Icon-Systematik für Sammelziel und nächste Neuerscheinung
- redundante Dachzeilen auf der Startseite entfernt
- Neuerscheinungs-Karte zeigt den kommenden Titel statt Statuszählern im Vordergrund
- Entenarchiv-Icon im Header größer und sauber auf die Wortmarke ausgerichtet
- Backup-Aktionen besitzen wieder ein konsistentes Zweispaltenraster
- Sammlungs-DNA reserviert festen Raum für den blauen Navigationspfeil
- Meilensteine unterscheiden Common, Uncommon, Rare, Epic und Legendary visuell
- Share Cards erhalten ein lokales, handgezeichnetes Archiv-/Regalmotiv und eine dichtere Komposition
- Share-Card-Modal berücksichtigt Notch, Dynamic Island und Home-Indikator
- Kalender priorisiert Jahr, Monat und Termine; Suche, Jahrespläne und Erinnerungen sind in aufklappbare Werkzeuge verschoben

### Technik

- App-Version und Service-Worker-Cache auf 4.5.2 angehoben
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- IndexedDB-Schema bleibt Version 5
- keine Datenmigration erforderlich
- 131 automatisierte Tests

## 4.5.1 – Design-System & Layout-Polish

### Design

- zentrale Tokens für Karten-, Control- und Modalradien
- quadratische, einheitliche Zurück-Buttons auf allen Unterseiten
- konsistente Kartenhöhen, Abstände, Schatten und Typografie
- kompakteres Backup-Center und ruhigere Dashboard-Hierarchie
- geglättete Layouts für Sammlung, Kalender, Erscheinungsradar, Scanner, Statistik und Banddetails
- Share Cards vollständig neu komponiert: kompakter Aufbau, Hero-Kennzahl, 2×2-Faktenraster und deutlich weniger Leerraum
- Entenarchiv-Icon im Header ohne zusätzliche schiefe Umrandung

### Technik

- App-Version und Service-Worker-Cache auf 4.5.1 angehoben
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- IndexedDB-Schema bleibt Version 5
- keine Datenmigration erforderlich
- 122 automatisierte Tests

## 4.5.0 – Sammelziele, Wunschliste & Share Cards

### Neu

- Suchprioritäten **Gesucht**, **Mitnehmen**, **Irgendwann** und **Ignorieren** für fehlende Bände
- Prioritäten direkt im Erscheinungsradar und im Flohmarkt-Modus
- Priorität im CSV- und kompakten zweispaltigen Flohmarkt-PDF
- eine einzige intelligente Missionskarte auf dem Dashboard
- automatische Missionen für fast vollständige Reihen, hohe Suchprioritäten und Fortschrittsschwellen
- lokale Meilensteine für Bestandsgrößen, Hauptreihen-Fortschritt und vollständige Zielreihen
- neue Meilensteine erscheinen nur kurz; die Historie bleibt eingeklappt in Statistiken
- vier handgebaute Editorial-Share-Card-Templates als lokales PNG
- Share Cards können über das iOS-Teilen-Menü geteilt oder heruntergeladen werden
- neue Module `collector-goals.js` und `share-cards.js`

### Technik

- App-Version und Service-Worker-Cache auf 4.5.0 angehoben
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- IndexedDB-Schema bleibt Version 5
- keine Datenmigration erforderlich
- Prioritäten und Meilensteinstatus sind backupfähig
- neue Module sind im Produktions-Build und Offline-Kern enthalten
- 118 automatisierte Tests

## 4.4.0 – Sammlungs-DNA

### Neu

- interaktive Sammlungs-DNA mit persönlichem Jahrgangs-, Qualitäts-, Reihen- und Lückenprofil
- Bereich **Fast geschafft** für Reihen mit nur noch ein bis fünf fehlenden Zielbänden
- Qualitätslandkarte für die zwölf größten Reihen
- klickbare Jahrgangs-, Qualitäts- und Reihen-Charts
- klickbare Zustandsverteilung
- Statistikfilter öffnen direkt die zugrunde liegenden Ausgaben
- statistische Fehlband-Insights springen direkt in die passende Reihe
- neues Modul `statistics-dna.js`

### Technik

- App-Version und Service-Worker-Cache auf 4.4.0 angehoben
- Datenformat bleibt Version 9
- Archivmodell bleibt Version 1
- IndexedDB-Schema bleibt Version 5
- keine Datenmigration erforderlich
- Statistikmodul wird im Offline-Kern mitgeführt

## 4.3.1 – Erscheinungsradar und automatische Jahrespläne

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
