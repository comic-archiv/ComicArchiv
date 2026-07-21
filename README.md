# Sammlerhausen 3.4.0

Mobile Progressive Web App für eine private Sammlung von Lustigen Taschenbüchern und Sonderbänden.

## Neu in 3.4.0

- Flohmarkt-Modus mit dauerhaft gespeicherten Markierungen
- fehlende Bände unterwegs als gefunden markieren
- Zustand je Fund auswählen oder gesammelt anwenden
- alle gefundenen Bände gesammelt in die Sammlung übernehmen
- erweiterte Reihenverwaltung mit Bearbeiten, Umbenennen und Entfernen
- eigener Duckipedia-Pfad pro benutzerdefinierter Reihe
- Platzhalter `{band}` für direkte Duckipedia-Bandseiten
- nachträgliches Hinzufügen und Entfernen eines zweiten Exemplars direkt in der Comic-Karte
- das zweite Exemplar bleibt Bestandteil desselben Sammlungsdatensatzes und erzeugt keine Dublette
- neues Farbkonzept mit Archiv-Blau für Aktionen, Comic-Gelb für Akzente, Grün für Erfolg und Rot für Fehler beziehungsweise destruktive Aktionen
- aktualisiertes Backupformat mit Reihenpfaden und optionalem Flohmarkt-Zwischenstand

Die bestehende IndexedDB bleibt erhalten. Vorhandene eigene Reihen werden beim ersten Start automatisch in das neue Reihenformat übernommen.

## Drittanbieter-Komponenten

- Quagga2 1.12.1 für die lokale Barcode-Erkennung
- jsPDF 4.2.1 für die lokale PDF-Erzeugung

Die minifizierten Browserdateien und die jeweiligen MIT-Lizenztexte liegen im Ordner `vendor/`.

Sammlungsdaten, Flohmarkt-Markierungen und eigene Coverfotos bleiben in der lokalen IndexedDB des Geräts. Duckipedia wird nur zur optionalen Abfrage bibliografischer Zusatzinformationen kontaktiert.
