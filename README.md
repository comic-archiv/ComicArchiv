# Sammlerhausen 3.3.0

Mobile Progressive Web App für eine private Sammlung von Lustigen Taschenbüchern und Sonderbänden.

Neu in 3.3.0:

- automatische Duckipedia-Anreicherung für numerische Bände
- lokaler Metadaten-Cache für Titel, Erscheinungsjahr, Bandseite und Cover-Vorschau
- optionale eigene Coverfotos, komprimiert und lokal in IndexedDB gespeichert
- Coverdarstellung in den Sammlungskarten, wobei eigene Fotos Vorrang haben
- eigene Ansicht „Medien & Metadaten“ mit Speicherübersicht
- vollständiges Medien-Backup mit Sammlungsdaten, Metadaten-Cache und eigenen Coverfotos
- Import normaler Daten-Backups und vollständiger Medien-Backups
- Sammelanreicherung bereits vorhandener Bände ohne Überschreiben manuell gepflegter Titel oder Jahre

Die bestehende IndexedDB wird auf Schema-Version 4 erweitert. Vorhandene Comics bleiben erhalten.

## Drittanbieter-Komponente

Für die Barcode-Erkennung wird Quagga2 1.12.1 verwendet. Die minifizierte Browserdatei und die MIT-Lizenz liegen im Ordner `vendor/`.

Die Sammlungsdaten und eigenen Coverfotos bleiben ausschließlich in der lokalen IndexedDB des Geräts. Duckipedia wird nur zur optionalen Abfrage bibliografischer Zusatzinformationen kontaktiert.
