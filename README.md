# Sammlerhausen 3.3.1

Mobile Progressive Web App für eine private Sammlung von Lustigen Taschenbüchern und Sonderbänden.

Neu in 3.3.1:

- kompakte Sammlungsauswahl mit getrennten Ansichten für Hauptreihe und weitere Reihen
- automatische Duckipedia-Anreicherung beim Öffnen eines fehlenden Bands
- zentrierte, unverzerrte Coverdarstellung
- funktionierende Zustandsbalken ohne Abkürzungen in den Beschriftungen
- kompakteres Dashboard mit drei Karten pro Reihe
- Reihenfortschritt: Hauptreihe zuerst, danach nach Vollständigkeit sortiert
- Zielbandnummern hinter einer diskreten, standardmäßig geschlossenen Verwaltung
- überflüssige Hilfstexte in Formular und Scanner entfernt

Die bestehende IndexedDB und alle gespeicherten Daten bleiben unverändert.

## Drittanbieter-Komponente

Für die Barcode-Erkennung wird Quagga2 1.12.1 verwendet. Die minifizierte Browserdatei und die MIT-Lizenz liegen im Ordner `vendor/`.

Sammlungsdaten und eigene Coverfotos bleiben in der lokalen IndexedDB des Geräts. Duckipedia wird nur zur optionalen Abfrage bibliografischer Zusatzinformationen kontaktiert.
