# Sammlerhausen 3.3.2

Mobile Progressive Web App für eine private Sammlung von Lustigen Taschenbüchern und Sonderbänden.

Neu in 3.3.2:

- Fehlende Bände sind auf der Startseite in Hauptreihe und Sonderreihen getrennt
- eigene bildschirmfüllende Fehlband-Ansichten
- geöffnete Reihe bleibt nach dem Speichern von Banddetails geöffnet
- fehlender Band kann mit einem Klick als vorhanden übernommen werden; erforderlich ist nur der Zustand
- gespeicherte Zielbandnummern können über einen eigenen Button entfernt werden
- korrekte Duckipedia-Links für `LTB präsentiert` einschließlich Umlaut
- gestalteter PDF-Export als Flohmarkt- und Comicbörsen-Suchliste
- PDF mit Reihenblöcken, großen Bandnummern, Abhakfeldern, Wunschzustand, Notizen und klickbaren Duckipedia-Links

Die bestehende IndexedDB und alle gespeicherten Daten bleiben unverändert.

## Drittanbieter-Komponenten

- Quagga2 1.12.1 für die lokale Barcode-Erkennung
- jsPDF 4.2.1 für die lokale PDF-Erzeugung

Die minifizierten Browserdateien und die jeweiligen MIT-Lizenztexte liegen im Ordner `vendor/`.

Sammlungsdaten, fehlende Bände und eigene Coverfotos bleiben in der lokalen IndexedDB des Geräts. Die PDF-Datei wird vollständig auf dem Gerät erzeugt. Duckipedia wird nur zur optionalen Abfrage bibliografischer Zusatzinformationen kontaktiert.
