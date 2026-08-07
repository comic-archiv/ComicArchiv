# Qualitätsbericht Entenarchiv 4.1.2

Prüfdatum: 8. August 2026

## Ergebnis

Das Quellprojekt besteht die automatisierte Struktur-, Syntax-, Daten- und Oberflächenlogikprüfung. Version 4.1.2 ist ein kompatibler Hotfix ohne Datenmigration.

Der abschließende reale Check externer Duckipedia-Bilder, des iOS-Service-Worker-Wechsels und der Darstellung erfolgt nach der GitHub-Pages-Veröffentlichung auf dem konkreten iPhone. Netzwerk-, Cache- und Mobile-Safari-Verhalten lassen sich in der lokalen Testlaufzeit nicht vollständig simulieren.

## Automatisierte Projektprüfung

Erfolgreich geprüft wurden:

- 28 erforderliche Projekt- und Laufzeitdateien,
- App-Version `4.1.2`,
- Datenformat `9`,
- IndexedDB-Schema `5`,
- Archivmodell `1`,
- 425 eindeutige HTML-IDs,
- 367 statische JavaScript-Ziele,
- 28 Offline-Dateien,
- Syntax aller 29 Quell-JavaScript-Dateien,
- sicherer Modus, Diagnose und Testdatenbank,
- Archivkern, Backupformat, digitales Regal und Sammelbearbeitung,
- Produktions-Build mit 24 Laufzeit-Einträgen.

## 60 automatisierte Tests

Alle 60 Tests wurden erfolgreich abgeschlossen. Die neuen Regressionstests decken insbesondere ab:

- die echte einzeilige Infobox-Struktur von `LTB 2`,
- Vorrang von `BILD = Datei:Lutabu002.jpg` gegenüber `NEU-BILD`,
- verschachtelte Vorlagen und Wiki-Links in Infoboxparametern,
- Ausschluss eines Rezensionsthumbnails und eines I.N.D.U.C.K.S.-Logos,
- Auflösung der exakten Infoboxdatei über MediaWiki `imageinfo`,
- Fallback auf das große Bild der gerenderten rechten Infobox,
- Erhöhung der Cover-Lookup-Version auf `3`,
- automatische Reparatur alter Coverzuordnungen,
- seitengebundene Coverbeobachtung für Bibliothek und Reihenseite,
- Entfernung des zusätzlichen nativen Lazy-Loading-Hinweises,
- Vollbild-Banddetails mit `100dvh` auf kleinen Displays,
- kontinuierliches Laden langer Reihen.

Die bestehenden Tests für Archivmigration, beliebig viele Exemplare, Backups, CSV, Kalender, Scanner, Fehlbände, Reihenidentität, Service Worker und intelligente Listen bleiben erfolgreich.

## Coverlogik

Die Coverreihenfolge lautet:

1. eigenes lokales Cover,
2. Duckipedia-Infoboxfeld `BILD`,
3. großes Cover der gerenderten rechten Infobox,
4. grafischer Platzhalter.

Die Anwendung sucht nicht nach einem vermeintlich passenden Dateinamen. Sie liest den von der Bandseite selbst referenzierten Dateititel und fragt dafür über `imageinfo` eine Vorschau an. `NEU-BILD`, Rezensionen, Storybilder und Logos werden nicht als primäres Cover verwendet.

Alte Coverzuordnungen werden anhand der Lookup-Version erneut geprüft. Ein temporär nicht auflösbares Infoboxbild überschreibt keine bereits vorhandene URL als endgültig validiertes Ergebnis; dadurch kann die App beim nächsten Online-Aufruf erneut versuchen, das korrekte Cover zu laden.

## Galerieverhalten

- separate `IntersectionObserver` für die intern scrollende Bibliotheks- und Reihenseite,
- großzügiger Vorladebereich von 780 Pixeln,
- sofortige Vorladung der ersten sichtbaren Einträge,
- höchstens zwei parallele externe Auflösungen,
- persistente Speicherung erfolgreicher Remote-URLs in IndexedDB,
- lokale Blob-URLs bleiben beim Wechsel zwischen Unterseiten gültig und werden erst bei einer tatsächlichen Datenaktualisierung erneuert,
- geladene Browserbilder werden auch bei sofortigem Cachetreffer sichtbar geschaltet.

## Banddetailansicht

Auf Displays bis 620 Pixel Breite wird die Detailansicht als vollständige App-Seite dargestellt:

- `100dvh` Höhe,
- einspaltiges Layout,
- zentriertes Cover,
- scrollbarer Inhalt,
- sicherer Abstand für iPhone-Notch und Home-Indikator,
- gut erreichbarer Kopf- und Aktionsbereich.

Auf größeren Displays bleibt der kompakte Dialog erhalten.

## Gerätespezifische Restprüfung

Nach dem Upload sind auf dem iPhone zu prüfen:

- automatisches Laden der ersten Cover ohne Tap,
- Nachladen beim Scrollen,
- korrekte Darstellung von LTB 2,
- Erhalt der Cover nach Verlassen und erneutem Öffnen einer Reihe,
- Vollbilddarstellung der Banddetails,
- Service-Worker-Wechsel auf Version 4.1.2,
- Offline-Start der installierten PWA.
