# Qualitätsbericht Entenarchiv 4.1.0

Prüfdatum: 7. August 2026

## Ergebnis

Das ausgelieferte Quellprojekt hat die automatisierte Struktur-, Syntax- und Logikprüfung bestanden. Das Produktionspaket wurde aus denselben geprüften Quellen erzeugt.

Der abschließende reale Praxistest von Darstellung, Touch-Verhalten, Kamera, iOS-Teilen-Menü und Service-Worker-Wechsel muss nach der Veröffentlichung auf dem konkreten iPhone erfolgen.

## Automatisierte Projektprüfung

Erfolgreich geprüft wurden:

- 28 erforderliche Projekt- und Laufzeitdateien,
- konsistente App-Version `4.1.0`,
- unverändertes Datenformat `9`,
- unverändertes IndexedDB-Schema `5`,
- unverändertes Archivmodell `1`,
- 423 eindeutige HTML-IDs,
- 365 statische JavaScript-Ziele auf vorhandene HTML-Elemente,
- 28 vom Service Worker referenzierte Offline-Dateien,
- Syntax aller 28 Quell-JavaScript-Dateien,
- bedarfsgeladenes Scanner- und PDF-Modul,
- sicherer Modus, Diagnose und getrennte Testdatenbank,
- Archivkern und Version-4-Backupformat,
- Einbindung von `shelf.js` und `shelf-ui.js`,
- digitale Regale, Reihenbibliothek, Banddetails und Sammelbearbeitung,
- lokale Covererkennung über Schlüssel statt vollständigem Laden aller Bildblobs,
- parsebares HTML mit 423 ID-tragenden Elementen,
- parsebares CSS mit 1.588 Top-Level-Einträgen und 0 Parserfehlern.

## 51 automatisierte Tests

Alle 51 Tests wurden erfolgreich abgeschlossen. Zusätzlich zu den bisherigen Archiv-, Backup-, Kalender-, Scanner- und Fehlbandtests deckt Version 4.1 insbesondere ab:

- Erzeugung der Reihenbibliothek mit echten Modulaufrufen,
- Öffnen der Hauptreihe als digitales Regal,
- Mischung aus vorhandenen und fehlenden Bandplätzen,
- Aufteilung langer Reihen in 60er-Bereiche,
- Reihenfortschritt aus Ziel, vorhandenen Ausgaben und Lücken,
- Hauptreihe an erster Stelle,
- intelligente Listen für ungelesene, mehrfache, folierte und unvollständige Datensätze,
- korrekte Erkennung lokaler Cover-IDs,
- Reihenfilter für ungelesen, foliert, mehrfach vorhanden und schwächere Zustände,
- natürliche Sortierung der Bandnummern `1`, `2`, `10`,
- kompakte Zusammenfassung zusammenhängender Lücken,
- Sammelbearbeitung ausschließlich ausgewählter Ausgaben,
- Änderung aller physischen Exemplare einer ausgewählten Ausgabe.

## Sicherheitsprüfung der Oberfläche

Die neue Regaloberfläche erstellt nutzerabhängige Inhalte über DOM-Knoten und `textContent`. Nutzereingaben werden nicht über `innerHTML` oder `insertAdjacentHTML` ausgegeben.

Lokale Cover werden nur für sichtbare Karten aus IndexedDB geladen. Die Übersicht verwendet zunächst lediglich die Cover-IDs. Objekt-URLs werden beim Wechsel der Ansicht wieder freigegeben.

## Build und Offline-Paket

Der Produktions-Build umfasst 24 Laufzeit-Einträge und erzeugt 33 tatsächlich auslieferbare Dateien. Sämtliche 33 Dateien wurden über einen lokalen HTTP-Server angefordert und mit Status `200` beantwortet. `shelf.js` und `shelf-ui.js` liegen im kritischen Offline-Paket des Service Workers, sodass Bibliothek und Regale nach einem erfolgreichen ersten Laden ohne Internetverbindung starten können.

Quagga2 und jsPDF bleiben bedarfsgeladene Module und vergrößern den normalen App-Start nicht unnötig.

## Prüfung des finalen Pakets

Das endgültige ZIP wurde nach der Erstellung erneut in ein leeres Verzeichnis entpackt. Dort wurden:

- sämtliche im Paket hinterlegten SHA-256-Prüfsummen erfolgreich kontrolliert,
- `npm run ci` erneut vollständig ausgeführt,
- alle 51 Tests erneut bestanden,
- das Produktionspaket neu erzeugt,
- alle 33 erzeugten Produktionsdateien über einen lokalen HTTP-Server mit Status 200 abgerufen.

Das ZIP enthält keinen vorgebauten `dist`-Ordner. GitHub Actions erzeugt ihn aus den geprüften Quellen, sodass keine veralteten Produktionsdateien hochgeladen werden.

## Nicht automatisierbare Restprüfung

Folgende Punkte sind nach dem Upload auf dem Zielgerät zu prüfen:

- visuelle Darstellung auf dem konkreten iPhone-Modell,
- Verhalten mit realen lokalen und externen Coverbildern,
- Touch-Auswahl bei der Sammelbearbeitung,
- Zurück-Navigation zwischen Startseite, Bibliothek, Reihe und klassischer Liste,
- Offline-Start der bereits installierten Home-Screen-PWA,
- Aktivierung des neuen Service Workers,
- iOS-spezifische Kamera- und Teilen-Funktionen.

Es wurde keine Aussage getroffen, dass diese gerätespezifischen Punkte bereits in Mobile Safari ausgeführt wurden.
