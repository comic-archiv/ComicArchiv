# Sammlerhausen 3.2.0

Mobile Progressive Web App für eine private Sammlung von Lustigen Taschenbüchern und Sonderbänden.

Neu in 3.2.0:

- Backup-Center mit Änderungszähler und Erinnerung
- Warnung bei 25 Änderungen oder 14 Tagen seit dem letzten Backup
- Scanner-Warteschlange für die Erfassung vieler Bände
- Sammelspeicherung und Sammelbearbeitung der Scanner-Einstellungen
- vorhandene Bände können übersprungen oder als zweites Exemplar übernommen werden
- Fortschritt je Reihe mit vorhandenen, fehlenden und gewünschten Bänden
- frei definierbare höchste gewünschte Bandnummer pro Reihe
- Fortschrittsziele und Backup-Status werden im JSON-Backup gesichert

Die Scanner-Warteschlange ist bewusst nur temporär. Sie bleibt beim Schließen des Scannerfensters erhalten, wird aber nach einem vollständigen Neuladen der App verworfen. Erst **Alle geprüften Bände speichern** schreibt die Einträge dauerhaft in IndexedDB.

## Drittanbieter-Komponente

Für die Barcode-Erkennung wird Quagga2 1.12.1 verwendet. Die minifizierte Browserdatei und die MIT-Lizenz liegen im Ordner `vendor/`.

Die Sammlungsdaten bleiben ausschließlich in der lokalen IndexedDB des Geräts. Es wurde keine Server-Datenbank ergänzt.
