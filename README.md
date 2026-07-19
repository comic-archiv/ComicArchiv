# Sammlerhausen 3.1.0

Mobile Progressive Web App für eine private Sammlung von Lustigen Taschenbüchern und Sonderbänden.

Neu in 3.1.0:
- Serien-Scanner für EAN-2- und EAN-5-Zusatzcodes
- `03` wird zu Band 3, `00239` zu Band 239
- Reihe und Standardzustand werden nur einmal für mehrere Scans gewählt
- Live-Kamera, Foto-Fallback und manuelle Zusatzcode-Eingabe
- direkte Prüfung auf bereits vorhandene Bände
- optionale Ergänzung von Titel und Erscheinungsjahr über die Duckipedia-API
- Scanner-Bibliothek lokal mitgeliefert, damit die Erkennung nach dem ersten Laden auch offline funktioniert

## Drittanbieter-Komponente

Für die Barcode-Erkennung wird Quagga2 1.12.1 verwendet. Die minifizierte Browserdatei und die MIT-Lizenz liegen im Ordner `vendor/`.

Die Sammlungsdaten bleiben weiterhin ausschließlich in der lokalen IndexedDB des Geräts. Es wurde keine Server-Datenbank ergänzt.
