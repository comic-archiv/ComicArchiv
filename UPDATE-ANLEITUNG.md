# Entenarchiv 4.0.0 – Update- und Testanleitung

## Was dieses Update verändert

Entenarchiv 4.0 trennt erstmals sauber zwischen:

- **Reihe:** zum Beispiel Lustiges Taschenbuch
- **Ausgabe:** zum Beispiel Band 239
- **physischem Exemplar:** das konkrete Buch in deinem Besitz

Damit kann eine Ausgabe beliebig viele Exemplare besitzen, ohne dass die Fehlbandliste, der Reihenfortschritt oder der Kalender denselben Band mehrfach zählen.

Die Oberfläche bleibt weitgehend vertraut. Die wichtigste sichtbare Neuerung ist der vollständige **Exemplarmanager** hinter dem Einstellungsicon jeder Comic-Karte.

---

# 1. Vor dem Update unbedingt sichern

## Normales Backup

1. Öffne auf dem iPhone Entenarchiv.
2. Scrolle zu **Export & Backup**.
3. Tippe auf **JSON-Backup erstellen**.
4. Speichere die Datei in der Dateien-App.
5. Öffne anschließend die Dateien-App und kontrolliere, dass die JSON-Datei wirklich vorhanden ist.

## Medien-Backup

Hast du eigene Coverfotos hinterlegt:

1. Öffne **Medien & Metadaten**.
2. Erstelle zusätzlich ein vollständiges Medien-Backup.
3. Kontrolliere auch diese Datei in der Dateien-App.

Der neue lokale Rückfall-Schnappschuss in Version 4 ist eine zusätzliche Absicherung, ersetzt aber kein extern gespeichertes Backup.

---

# 2. Update in GitHub hochladen

Da GitHub Actions bei dir bereits funktioniert, musst du die Pages-Einstellungen und den Workflow nicht erneut einrichten.

1. Lade das ZIP `Entenarchiv-v4.0.0-Archivkern.zip` auf den Mac.
2. Entpacke das ZIP mit einem Doppelklick.
3. Öffne dein bestehendes GitHub-Repository.
4. Wähle **Add file → Upload files**.
5. Lade den vollständigen Inhalt des entpackten Ordners `Entenarchiv` hoch.
6. Ersetze die vorhandenen Dateien.
7. Achte besonders darauf, dass auch diese neue Datei hochgeladen wird:

```text
archive-model.js
```

8. Ebenfalls erforderlich sind die aktualisierten Ordner und Dateien:

```text
scripts/
tests/
package.json
version.json
app.js
config.js
storage.js
export.js
recovery.js
diagnostics.js
service-worker.js
index.html
style.css
```

Der bereits auf GitHub vorhandene versteckte Ordner `.github` kann unverändert bleiben. Du musst ihn nicht erneut über den Finder hochladen.

9. Verwende beispielsweise die Commit-Nachricht:

```text
Entenarchiv Version 4.0.0
```

10. Öffne auf GitHub den Reiter **Actions**.
11. Warte, bis der Workflow **Entenarchiv prüfen und veröffentlichen** vollständig grün ist.

Schlägt die Qualitätsprüfung fehl, wird die neue App-Version nicht veröffentlicht.

---

# 3. Update auf dem iPhone aktivieren

1. Stelle eine Internetverbindung her.
2. Schließe Entenarchiv über den App-Umschalter vollständig.
3. Öffne die App erneut.
4. Bleibe beim ersten Start kurz in der App, während die lokale Datenbank aktualisiert wird.
5. Schließe und öffne die App ein zweites Mal, falls zunächst noch die alte Versionsnummer erscheint.

Ganz unten im Backup-Bereich muss anschließend stehen:

```text
Entenarchiv v4.0.0
```

Entferne die Home-Screen-App nicht und lösche keine Websitedaten. Das ist für dieses Update nicht erforderlich.

---

# 4. Was beim ersten Start passiert

Entenarchiv liest deine bisherige Sammlung und baut daraus den neuen Archivkern.

## Beispiele

Bisher:

```text
LTB 239
Zustand 1
Doppelt: Ja
Zustand Exemplar 2: 2
```

Danach:

```text
Ausgabe: LTB 239
Exemplar 1: Zustand 1
Exemplar 2: Zustand 2
```

Hattest du denselben Band versehentlich oder absichtlich als zwei getrennte Einträge gespeichert, werden diese nicht gelöscht. Entenarchiv bildet daraus eine gemeinsame Ausgabe mit mehreren physischen Exemplaren.

## Migrationsbericht

Nach erfolgreicher Umstellung erscheint einmalig ein Bericht mit:

- Zahl der bisherigen Einträge
- Zahl der eindeutigen Ausgaben
- Zahl der physischen Exemplare
- Zahl der verwendeten Reihen
- zusammengeführten doppelten Ausgaben
- übernommenen zusätzlichen Exemplaren
- gegebenenfalls neu zugeordneten Coverbildern

Du kannst den Bericht als JSON exportieren.

## Rückfallstand

Vor der ersten Umstellung speichert Entenarchiv lokal einen Schnappschuss der bisherigen Comicdaten und Einstellungen. Die Schaltfläche **Vorherigen Datenstand wiederherstellen** setzt den Sammlungsinhalt auf diesen Stand zurück und baut daraus erneut einen geprüften Archivkern.

Dabei gehen Änderungen verloren, die du nach der Umstellung vorgenommen hast. Deshalb vor der Wiederherstellung erneut ein aktuelles Backup erstellen.

---

# 5. Exemplarmanager verwenden

1. Öffne **Meine Sammlung**.
2. Öffne eine Comic-Karte.
3. Tippe auf das Einstellungsicon.
4. Wähle **Exemplare verwalten**.

Für jedes physische Exemplar kannst du separat festlegen:

- Zustand
- gelesen
- foliert
- Notiz

Über **Weiteres Exemplar hinzufügen** kannst du ein drittes, viertes oder beliebig weiteres Exemplar anlegen.

Mit **Entfernen** löschst du nur dieses physische Exemplar. Das letzte verbleibende Exemplar kann nicht im Exemplarmanager entfernt werden, weil eine Ausgabe ohne vorhandenes Buch nicht in der Sammlung bleiben darf.

Die gesamte Ausgabe löschst du weiterhin über **Comic löschen**.

---

# 6. Erneute Erfassung eines vorhandenen Bands

Gibst du im normalen Formular dieselbe Reihe und Bandnummer erneut ein, meldet Entenarchiv:

> Die neue Eingabe wird als weiteres physisches Exemplar gespeichert, ohne einen doppelten Bandeintrag anzulegen.

Nach deiner Bestätigung:

- bleibt genau eine Ausgabe sichtbar,
- steigt die Exemplarzahl dieser Ausgabe,
- Fehlbandliste und Fortschritt zählen den Band weiterhin nur einmal.

Dasselbe Prinzip gilt für den Serien-Scanner. Bereits vorhandene Bände können dort als zusätzliches Exemplar übernommen werden.

---

# 7. Backups in Version 4

Ein neues JSON-Backup enthält:

- eine lesbare kompatible Sammlungsliste,
- stabile Reihen,
- eindeutige Ausgaben,
- sämtliche physischen Exemplare,
- Einstellungen,
- Fehlbanddetails,
- Kalenderdaten,
- Duckipedia-Metadaten.

Beim Zusammenführen eines Backups erkennt Entenarchiv dieselbe Ausgabe anhand von Reihen-ID und Bandnummer. Zusätzliche Exemplare werden übernommen, ohne einen zweiten Bandeintrag anzulegen.

Der CSV-Export enthält pro physischem Exemplar eine eigene Zeile. Dadurch können Zustand, gelesen, foliert und Notiz je Exemplar sauber ausgewertet werden.

---

# 8. Konkreter Testplan

## Test A: Bestehende Sammlung

1. Öffne die Hauptreihe und mehrere Sonderreihen.
2. Prüfe stichprobenartig Titel, Bandnummer, Jahr, Zustand und Cover.
3. Prüfe mindestens einen bisher als doppelt markierten Band.

Erwartung: Alle Inhalte sind vorhanden; ein doppelter Band besitzt zwei Exemplare.

## Test B: Drittes Exemplar

1. Öffne einen Band über das Einstellungsicon.
2. Wähle **Exemplare verwalten**.
3. Füge ein drittes Exemplar hinzu.
4. Vergib einen anderen Zustand und eine Notiz.
5. Speichere.
6. Schließe und öffne die App erneut.

Erwartung: Alle drei Exemplare bleiben erhalten.

## Test C: Bearbeiten ohne Verlust

1. Bearbeite anschließend denselben Band über das normale Formular.
2. Ändere nur Titel oder Jahr.
3. Speichere.
4. Öffne erneut den Exemplarmanager.

Erwartung: Das zweite und dritte Exemplar sind weiterhin vorhanden.

## Test D: Dublettenschutz

1. Lege eine Reihe und Bandnummer an, die bereits vorhanden ist.
2. Bestätige die Übernahme als weiteres Exemplar.

Erwartung: Es entsteht keine zweite Comic-Karte. Die Exemplarzahl steigt um eins.

## Test E: Fehlband und Fortschritt

1. Öffne die Fehlbandliste der betreffenden Reihe.
2. Öffne den Reihenfortschritt.

Erwartung: Mehrere Exemplare ändern weder vorhandene Bandzahl noch Fehlbandzahl.

## Test F: Backup

1. Erstelle ein neues JSON-Backup.
2. Öffne **Diagnose & Sicherheit**.
3. Starte den getrennten Testmodus.
4. Importiere dort das neue Backup.
5. Prüfe einen Band mit mindestens drei Exemplaren.

Erwartung: Alle Exemplare und ihre Eigenschaften werden übernommen.

## Test G: Diagnose

Öffne:

```text
Export & Backup
→ Technische Speicherdetails
→ Diagnose & Sicherheit
```

Der Archivkern sollte als bereit beziehungsweise gültig erscheinen. Die Zahlen für Ausgaben und Exemplare dürfen sich unterscheiden; bei Doppelstücken ist die Exemplarzahl höher.

## Test H: Offline

1. Öffne Entenarchiv einmal online.
2. Schließe die App.
3. Aktiviere den Flugmodus.
4. Öffne die App erneut.
5. Öffne eine Sammlungsliste und einen Exemplarmanager.

Erwartung: Die Kern-App und die lokale Sammlung funktionieren weiterhin offline.

---

# 9. Falls der Start scheitert

Version 3.9 hat bereits den sicheren Modus eingebaut. Sollte Version 4 nicht normal starten:

1. Warte, bis **Sicherer Modus** erscheint.
2. Erstelle zuerst ein **JSON-Notfall-Backup**.
3. Bei eigenen Coverbildern zusätzlich ein **Medien-Notfall-Backup**.
4. Exportiere den Diagnosebericht.
5. Lösche weder die Home-Screen-App noch die Websitedaten.

Der Diagnosebericht enthält App- und Datenbankstatus, jedoch regulär keine Comic-Titel, Notizen oder Bildinhalte.

---

# 10. Woran du die erfolgreiche Umstellung erkennst

- Ganz unten steht `Entenarchiv v4.0.0`.
- Unter den technischen Speicherdetails zeigt der Archivkern Ausgaben und Exemplare an.
- Bei doppelten Bänden lautet die Kartenaktion `Exemplare verwalten`.
- Ein Band kann mehr als zwei Exemplare besitzen.
- Dieselbe Reihe und Bandnummer erzeugt keinen zweiten Bandeintrag.
- Neue JSON-Backups enthalten das Archivmodell 1 und Datenformat 9.

Die reale Datenbankmigration, Kamera, iOS-Teilen-Funktion und das Service-Worker-Update müssen abschließend auf deinem iPhone geprüft werden. Die ausgelieferte Codebasis selbst hat 40 automatisierte Tests und den vollständigen Produktions-Build erfolgreich bestanden.
