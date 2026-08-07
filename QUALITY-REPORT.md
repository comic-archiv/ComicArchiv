# Qualitätsbericht Entenarchiv 4.1.1

Prüfdatum: 7. August 2026

## Ergebnis

Der Regal- und Cover-Hotfix wurde gegen die vier gemeldeten Probleme geprüft:

1. überlappender Reihenkopf und unsaubere Neuerscheinungskarte,
2. unintuitive Bandbereichsauswahl,
3. fehlende Duckipedia-Cover,
4. bildschirmfüllender Coverplatzhalter in der Banddetailansicht.

Das Datenmodell wurde nicht verändert. Der abschließende reale Praxistest des Service-Worker-Wechsels, der Duckipedia-Erreichbarkeit und des Touch-Verhaltens erfolgt nach der Veröffentlichung auf dem konkreten iPhone.

## Automatisierte Projektprüfung

Erfolgreich geprüft wurden:

- 28 erforderliche Projekt- und Laufzeitdateien,
- konsistente App-Version `4.1.1`,
- unverändertes Datenformat `9`,
- unverändertes IndexedDB-Schema `5`,
- unverändertes Archivmodell `1`,
- 424 eindeutige HTML-IDs,
- 366 statische JavaScript-Ziele auf vorhandene HTML-Elemente,
- 28 vom Service Worker referenzierte Offline-Dateien,
- Syntax von 29 JavaScript-Dateien,
- bedarfsgeladenes Scanner- und PDF-Modul,
- sicherer Modus, Diagnose und getrennte Testdatenbank,
- Archivkern und Version-4-Backupformat,
- kontinuierliches Regal ohne sichtbare Bandbereichsauswahl,
- Banddetaildaten und kompakte Coverposition,
- Duckipedia-Coverabfrage und Fallback.

## 53 automatisierte Tests

Alle 53 Tests wurden erfolgreich abgeschlossen. Neu beziehungsweise erweitert sind insbesondere:

- kontinuierliche Darstellung einer langen Reihe mit 80 Testbänden ohne Bereichswechsel,
- Suche und Filter über die vollständige Reihe,
- fehlende `series-range`-Steuerung in HTML und JavaScript,
- PageImages-Abfrage mit `pilicense=any`,
- Fallback über Bandseiten-Dateiliste und `imageinfo`,
- Hintergrundreparatur fehlender Cover,
- vorhandene Detailfelder für Jahr, Exemplare und Lesestatus,
- relative Positionierung des Covercontainers, damit der Platzhalter den Dialog nicht überdeckt,
- weiterhin vollständige Archiv-, Backup-, Kalender-, Scanner-, Fehlband- und Migrationsprüfungen.

## Visuelle Prüfung bei iPhone-Breite

Die geänderten Komponenten wurden zusätzlich mit den finalen CSS-Regeln in einem Browser-Viewport von `390 × 844` Pixeln gerendert.

Geprüft wurden:

- Reihenkopf mit drei Covervorschauen, langem Reihentitel und Prozentzahl,
- vier Kennzahlen in zwei Zeilen,
- lange Neuerscheinungsbezeichnung mit rechts ausgerichtetem Datum,
- Such- und Filterbereich ohne Bandbereichsauswahl,
- kompakte Banddetailansicht mit zwei physischen Exemplaren,
- Platzhaltercover ohne Überdeckung der Detailinformationen,
- erreichbare Aktionsbuttons im scrollbaren Dialog.

Die Prüfung verwendet dieselben HTML-Strukturen und CSS-Regeln wie das Produktionspaket. Sie ersetzt keinen abschließenden Test in Mobile Safari, deckt aber die konkret gemeldeten Layoutfehler reproduzierbar ab.

## Duckipedia-Cover

Die bisherige PageImages-Anfrage enthielt keine Lizenzoption. Version 4.1.1 fordert das passendste Bild unabhängig von der Lizenzklassifizierung an und besitzt zusätzlich einen Fallback:

1. PageImages-Vorschaubild anfragen,
2. bei fehlendem Treffer die auf der Bandseite verwendeten Dateien prüfen,
3. wahrscheinlichstes Cover auswählen,
4. Thumbnail-URL über `imageinfo` laden.

Bereits vorhandene Bände ohne Cover werden nur sichtbarkeitsnah und mit höchstens zwei parallelen Hintergrundabfragen aktualisiert. Eigene lokale Cover haben immer Vorrang.

## Leistung langer Regale

Die Bandbereichsauswahl wurde entfernt. Das Regal kann nun von Band 1 bis zum Sammlungsziel beziehungsweise höchsten relevanten Band kontinuierlich gescrollt werden.

Zur Begrenzung unnötiger Arbeit:

- werden Cover über `IntersectionObserver` erst in der Nähe des Viewports geladen,
- nutzt jede Regalkarte `content-visibility: auto`,
- werden Objekt-URLs lokaler Bilder beim Verlassen der Ansicht freigegeben,
- laufen automatische Coverreparaturen begrenzt parallel.

## Banddetailansicht

Der Fehler der großen blauen Fläche wurde auf einen absolut positionierten Platzhalter in einem nicht positionierten Covercontainer zurückgeführt. Der Covercontainer besitzt nun einen eigenen Positionierungskontext. Zusätzlich wurden:

- Covergröße auf dem iPhone reduziert,
- Basisdaten in drei kompakten Feldern ergänzt,
- Exemplardaten platzsparend dargestellt,
- Titelbereich fixiert,
- Scrollposition bei jedem Öffnen zurückgesetzt,
- Aktionen unterhalb der Informationen erreichbar gehalten.

## Build und Offline-Paket

Der Produktions-Build erzeugt 24 Laufzeit-Einträge und daraus 33 tatsächlich auslieferbare Dateien. Sämtliche 33 Dateien wurden über einen lokalen HTTP-Server angefordert und mit Status `200` beantwortet.

Der Service Worker verwendet für Version 4.1.1 den neuen Cache-Namen `entenarchiv-shell-v4-1-1`, damit das iPhone die korrigierten Dateien als eigenes Update installiert und ältere Entenarchiv-Caches anschließend bereinigt.

Das finale Produktionspaket wird vor der Veröffentlichung durch GitHub Actions aus denselben geprüften Quellen erzeugt.

## Verbleibende Grenzen

- Duckipedia-Cover benötigen beim erstmaligen Laden eine Internetverbindung.
- Nicht jede Duckipedia-Seite muss ein automatisch erkennbares Cover enthalten.
- Externe Bilder sind nicht so zuverlässig offline verfügbar wie eigene lokale Coverfotos.
- Der reale Service-Worker-Wechsel lässt sich abschließend nur auf dem installierten iPhone prüfen.

## Prüfung des finalen ZIP-Pakets

Das endgültige ZIP wird nach seiner Erstellung erneut in ein leeres Verzeichnis entpackt. Dort werden:

- sämtliche im Paket hinterlegten SHA-256-Prüfsummen kontrolliert,
- `npm run ci` erneut vollständig ausgeführt,
- alle 53 Tests erneut durchlaufen,
- das Produktionspaket erneut erzeugt,
- die ZIP-Struktur auf den erwarteten Ordner `Entenarchiv/` geprüft.

Damit stammen Update-ZIP, Anleitung und Qualitätsbericht aus demselben final geprüften Quellstand.
