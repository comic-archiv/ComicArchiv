# Entenarchiv 4.1.1 – Regal- und Cover-Hotfix

Version 4.1.1 behebt die vier Auffälligkeiten der ersten digitalen Regalansicht:

- Der Reihenkopf überlagert auf kleinen iPhone-Displays weder Titel noch Fortschritt.
- Die nächste Neuerscheinung besitzt ein kompaktes, sauber ausgerichtetes Layout.
- Lange Reihen lassen sich ohne Bandbereichsauswahl kontinuierlich durchscrollen.
- Duckipedia-Cover werden zuverlässiger gefunden und bei vorhandenen Bänden ohne Cover im Hintergrund nachgeladen.
- Die Banddetailansicht zeigt wieder Cover, Basisdaten, alle Exemplare und sämtliche Aktionen statt einer bildschirmfüllenden Platzhalterfläche.

Die Datenbank, das Datenformat und der Archivkern bleiben unverändert. Es ist keine erneute Migration notwendig.

---

## 1. Vor dem Update sichern

Auch bei einem reinen Oberflächen- und Metadaten-Hotfix sollte ein aktuelles Backup vorhanden sein.

### JSON-Backup

1. Öffne Entenarchiv auf dem iPhone.
2. Scrolle zu **Export & Backup**.
3. Tippe auf **JSON-Backup erstellen**.
4. Speichere die Datei außerhalb der App, beispielsweise in iCloud Drive.
5. Kontrolliere in der Dateien-App, dass die Datei vorhanden ist.

### Medien-Backup

Hast du eigene Coverfotos gespeichert:

1. Öffne **Medien & Metadaten**.
2. Erstelle zusätzlich ein vollständiges Medien-Backup.
3. Kontrolliere auch diese Datei in der Dateien-App.

---

## 2. Update bei GitHub hochladen

Dein GitHub-Actions-Workflow bleibt unverändert bestehen.

1. Lade `Entenarchiv-v4.1.1-Regal-Cover-Hotfix.zip` herunter.
2. Entpacke das ZIP auf dem Mac.
3. Öffne dein bestehendes Entenarchiv-Repository auf GitHub.
4. Wähle **Add file → Upload files**.
5. Öffne den entpackten Ordner `Entenarchiv`.
6. Lade dessen vollständigen sichtbaren Inhalt hoch.
7. Ersetze die vorhandenen Dateien.
8. Achte besonders darauf, dass diese geänderten Dateien übernommen werden:

```text
index.html
style.css
shelf-ui.js
duckipedia.js
app.js
service-worker.js
```

9. Lade auch die aktualisierten Tests mit hoch, insbesondere:

```text
tests/duckipedia.test.mjs
tests/project.test.mjs
tests/shelf-ui-smoke.test.mjs
```

10. Verwende beispielsweise die Commit-Nachricht:

```text
Entenarchiv Version 4.1.1
```

11. Bestätige mit **Commit changes**.

`index.html` muss weiterhin direkt im Hauptverzeichnis des Repositorys liegen. Es darf kein zusätzlicher Ordner zwischen Repository und App-Dateien entstehen.

---

## 3. GitHub Actions kontrollieren

1. Öffne im Repository den Reiter **Actions**.
2. Öffne den Lauf **Entenarchiv prüfen und veröffentlichen**.
3. Warte, bis beide Bereiche grün abgeschlossen sind:

```text
Qualitätsprüfung
GitHub Pages veröffentlichen
```

Die bestehende veröffentlichte Version bleibt erreichbar, solange ein neuer Lauf noch nicht erfolgreich abgeschlossen wurde.

---

## 4. Update auf dem iPhone aktivieren

1. Stelle eine Internetverbindung her.
2. Öffne den iPhone-App-Umschalter.
3. Wische Entenarchiv vollständig nach oben weg.
4. Öffne die Home-Screen-App erneut.
5. Schließe und öffne sie bei Bedarf ein zweites Mal.
6. Scrolle zu **Export & Backup**.
7. Ganz unten muss stehen:

```text
Entenarchiv v4.1.1
```

Die Home-Screen-App muss nicht entfernt werden. Lösche auch keine Safari-Websitedaten.

---

## 5. Reihenkopf testen

1. Tippe auf der Startseite auf **Lustige Taschenbücher**.
2. Prüfe den oberen Reihenkopf.
3. Cover-Collage, Reihentitel, Prozentzahl und Fortschritt dürfen sich nicht mehr überlagern.
4. Der Bereich **Nächste Neuerscheinung** muss aus drei klaren Teilen bestehen:
   - Kalender-Icon,
   - Bezeichnung und Ausgabe,
   - kompaktes Datum rechts.
5. Öffne anschließend eine Sonderreihe und prüfe dieselbe Darstellung dort.

Lange Titel dürfen auf höchstens zwei Zeilen umbrechen, ohne das Datum aus der Karte zu drücken.

---

## 6. Kontinuierliches Regal testen

1. Öffne die Hauptreihe.
2. Unter der Suche darf keine Auswahl **Bandbereich** mehr erscheinen.
3. Scrolle kontinuierlich von den ersten Bänden in höhere Nummernbereiche.
4. Suche beispielsweise direkt nach `605` oder einem Titel aus einem höheren Bereich.
5. Die Suche und alle Filter müssen sich auf die vollständige Reihe beziehen.

Entenarchiv erzeugt weiterhin die ganze numerische Reihe inklusive sichtbarer Lücken. Cover werden jedoch erst geladen, wenn ihre Karten in die Nähe des sichtbaren Bereichs kommen. Dadurch bleibt das durchgehende Regal auch bei vielen hundert Bänden flüssiger.

---

## 7. Duckipedia-Cover testen

Für diesen Test muss das iPhone online sein.

1. Öffne eine Reihe mit vorhandenen numerischen Bänden.
2. Bleibe einige Sekunden bei den sichtbaren Karten.
3. Scrolle langsam weiter.
4. Bände mit passender Duckipedia-Seite sollten ihre Cover nach und nach anzeigen.
5. Öffne einen Band und kontrolliere das Cover zusätzlich in der Detailansicht.

Version 4.1.1 aktualisiert sichtbare Bände ohne gespeichertes Cover still im Hintergrund. Dabei laufen höchstens zwei Abfragen gleichzeitig, damit die App und Duckipedia nicht unnötig belastet werden.

Wichtig:

- Ein eigenes lokales Cover hat weiterhin Vorrang.
- Danach wird ein gespeichertes Duckipedia-Cover verwendet.
- Existiert auf der Bandseite kein nutzbares Cover oder ist Duckipedia nicht erreichbar, bleibt der grafische Platzhalter sichtbar.
- Duckipedia-Bilder sind externe Vorschaubilder. Eigene Coverfotos bleiben die zuverlässigste Offline-Lösung.

---

## 8. Banddetailansicht testen

1. Tippe im Regal auf einen vorhandenen Band.
2. Das Detailfenster muss kompakt am unteren Bildschirmbereich erscheinen.
3. Sichtbar sein müssen:
   - Reihe, Bandnummer und Titel,
   - Erscheinungsjahr,
   - Anzahl der Exemplare,
   - Lesestatus,
   - jedes physische Exemplar mit Zustand, gelesen, foliert und Notiz,
   - Duckipedia-Link,
   - **Comic bearbeiten**,
   - **Exemplare verwalten**,
   - **Duckipedia-Daten laden**.
4. Auch ohne Cover darf die blaue Platzhalterfläche nur die kleine Coverposition belegen und niemals den gesamten Dialog überdecken.
5. Öffne nacheinander mehrere Bände. Der Dialog muss bei jedem Öffnen wieder am Anfang starten.

---

## 9. Offline-Test

1. Öffne Version 4.1.1 einmal vollständig mit Internetverbindung.
2. Scrolle durch einige Regalbereiche.
3. Schließe Entenarchiv.
4. Aktiviere den Flugmodus.
5. Öffne die App erneut.
6. Reihenkopf, durchgehendes Regal, gespeicherte Daten und lokale Cover müssen weiterhin funktionieren.

Externe Duckipedia-Bilder können offline fehlen, sofern sie nicht noch im Browsercache liegen. Die eigentliche Sammlung bleibt davon unberührt.

---

## 10. Datensicherheit und Kompatibilität

Version 4.1.1 verändert nicht:

- Datenbankname `comicarchiv-db`,
- IndexedDB-Schema `5`,
- Datenformat `9`,
- Archivmodell `1`,
- vorhandene Reihen, Ausgaben oder Exemplare,
- eigene Coverbilder,
- Fehlbandinformationen,
- Reihenziele,
- Kalendertermine,
- Flohmarktmarkierungen.

Die im Hintergrund ergänzten Duckipedia-Metadaten werden wie bisher lokal am jeweiligen Band gespeichert. Regelmäßige externe Backups bleiben trotzdem erforderlich.
