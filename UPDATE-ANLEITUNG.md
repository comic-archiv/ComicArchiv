# Entenarchiv 4.5.1 – Design-Polish Update

## Was sich ändert

Version 4.5.1 räumt das visuelle System der gesamten App auf. Es kommen keine neuen Sammlungsdaten hinzu und es findet keine Migration statt.

Die wichtigsten Änderungen:

- einheitliche Radien für Karten, Controls und Modals
- einheitlich quadratische Zurück-Buttons
- konsistentere Abstände und Textausrichtung
- kompakteres Dashboard und Backup-Center
- geglättete Karten in Kalender, Radar, Scanner, Regalen und Statistiken
- Share Cards mit dichterem Editorial-Layout und 2×2-Faktenraster

## Vor dem Update

1. Entenarchiv öffnen.
2. Ein aktuelles JSON-Backup erstellen.
3. Bei eigenen Coverbildern zusätzlich ein Medien-Backup erstellen.

## Update hochladen

1. `Entenarchiv-v4.5.1-Design-Polish.zip` herunterladen und entpacken.
2. Im GitHub-Repository **Add file → Upload files** öffnen.
3. Den vollständigen sichtbaren Inhalt des Ordners `Entenarchiv` hochladen.
4. Vorhandene Dateien ersetzen.
5. Beispielsweise mit `Entenarchiv Version 4.5.1` committen.
6. Unter **Actions** warten, bis Qualitätsprüfung und GitHub-Pages-Veröffentlichung grün sind.
7. Entenarchiv auf dem iPhone vollständig schließen und neu öffnen.
8. Im Backup-Bereich muss `Entenarchiv v4.5.1` stehen.

Der GitHub-Actions-Workflow muss nicht verändert werden.

## Design-Test auf dem iPhone

Prüfe anschließend kurz diese Bereiche:

1. **Startseite** – Dashboard-Kacheln, Sammlungs-Hubs und Backup-Bereich wirken gleichmäßig und nicht gequetscht.
2. **Unterseiten** – der Zurück-Button ist überall quadratisch und gleich groß.
3. **Digitales Regal** – Kacheln, Cover und Texte besitzen konsistente Radien und Abstände.
4. **Banddetail** – Cover, Datenblöcke und Aktionen folgen derselben Kartenlogik.
5. **Kalender / Erscheinungsradar** – Datumsblöcke, Titel und Aktionen liegen auf sauberen Achsen.
6. **Scanner Pro** – Moduswahl und Controls wirken wie ein zusammengehöriges System.
7. **Statistiken** – Kennzahlen und Charts haben einheitliche Kartenhöhen und klare Textachsen.
8. **Share Cards** – die Mitte ist nicht mehr leer; vier kompakte Faktenblöcke sitzen direkt unter der Hauptaussage.

## Technische Daten

- App-Version: 4.5.1
- Service-Worker-Cache: v4-5-1
- Datenformat: 9
- Archivmodell: 1
- IndexedDB-Schema: 5
- keine Datenmigration
