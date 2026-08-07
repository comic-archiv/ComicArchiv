# Entenarchiv 4.1.0 – Update- und Testanleitung

## Was dieses Update bringt

Version 4.1 ergänzt den Archivkern aus Version 4.0 um die neue visuelle Sammlungsoberfläche:

- digitales Regal für jede Reihe,
- Reihenbibliothek,
- sichtbare Lücken zwischen vorhandenen Bänden,
- intelligente Listen,
- Banddetailansicht,
- Sammelbearbeitung mit Rückgängig-Funktion.

Die Datenbankstruktur wird nicht erneut verändert. Deine bereits migrierte Version-4-Sammlung bleibt erhalten.

---

# 1. Vor dem Update sichern

Auch bei einem Update ohne Datenmigration sollte ein aktuelles Backup vorhanden sein.

## JSON-Backup

1. Öffne Entenarchiv auf dem iPhone.
2. Scrolle zu **Export & Backup**.
3. Tippe auf **JSON-Backup erstellen**.
4. Speichere die Datei in der Dateien-App.
5. Öffne die Dateien-App und prüfe, dass die Datei vorhanden ist.

## Medien-Backup

Hast du eigene Coverfotos gespeichert:

1. Öffne **Medien & Metadaten**.
2. Erstelle zusätzlich ein vollständiges Medien-Backup.
3. Prüfe auch diese Datei in der Dateien-App.

---

# 2. Update bei GitHub hochladen

Dein GitHub-Actions-Workflow läuft bereits. Die Pages-Einstellungen und `.github/workflows/deploy-pages.yml` müssen deshalb nicht erneut angefasst werden.

1. Lade das ZIP `Entenarchiv-v4.1.0-Digitale-Regale.zip` herunter.
2. Entpacke es auf dem Mac mit einem Doppelklick.
3. Öffne dein bestehendes Entenarchiv-Repository auf GitHub.
4. Klicke auf **Add file → Upload files**.
5. Öffne den entpackten Ordner `Entenarchiv`.
6. Lade dessen vollständigen sichtbaren Inhalt hoch.
7. Ersetze die vorhandenen Dateien.
8. Achte besonders darauf, dass diese beiden neuen Dateien im Hauptverzeichnis landen:

```text
shelf.js
shelf-ui.js
```

9. Auch `tests/shelf.test.mjs` und `tests/shelf-ui-smoke.test.mjs` müssen mit hochgeladen werden.
10. Verwende beispielsweise die Commit-Nachricht:

```text
Entenarchiv Version 4.1.0
```

11. Bestätige mit **Commit changes**.

## Richtige Struktur

```text
Repository/
├── index.html
├── app.js
├── shelf.js
├── shelf-ui.js
├── style.css
├── service-worker.js
├── tests/
├── scripts/
└── ...
```

Es darf kein zusätzlicher Ordner `Entenarchiv` zwischen Repository und `index.html` liegen.

---

# 3. GitHub Actions kontrollieren

1. Öffne im Repository den Reiter **Actions**.
2. Öffne den neuen Lauf **Entenarchiv prüfen und veröffentlichen**.
3. Warte, bis beide Bereiche grün sind:

```text
Qualitätsprüfung
GitHub Pages veröffentlichen
```

Wenn die Qualitätsprüfung rot wird, öffne den fehlgeschlagenen Schritt. Die alte veröffentlichte Version bleibt bis zu einem erfolgreichen Lauf erreichbar.

---

# 4. Update auf dem iPhone aktivieren

1. Stelle eine Internetverbindung her.
2. Öffne den iPhone-App-Umschalter.
3. Wische Entenarchiv vollständig nach oben weg.
4. Öffne die Home-Screen-App erneut.
5. Schließe und öffne sie bei Bedarf ein zweites Mal.
6. Scrolle zu **Export & Backup**.
7. Ganz unten muss stehen:

```text
Entenarchiv v4.1.0
```

Die Home-Screen-App muss nicht entfernt und Safari-Websitedaten dürfen nicht gelöscht werden.

---

# 5. Neue Bibliothek testen

## Hauptreihe

1. Tippe auf der Startseite auf **Lustige Taschenbücher**.
2. Es muss direkt die Reihenseite der Hauptreihe erscheinen.
3. Prüfe:
   - Cover oder Platzhalter,
   - sichtbare Lücken,
   - Fortschritt,
   - Anzahl Ausgaben und Exemplare,
   - Suche und Filter.

Ein fehlender Band muss als eigener Platzhalter zwischen den vorhandenen Nummern stehen.

## Sonderreihen

1. Gehe zurück zur Startseite.
2. Tippe auf **Sonderbände & weitere Reihen**.
3. Die Reihenbibliothek muss erscheinen.
4. Suche nach einer Reihe.
5. Probiere die Sortierungen **Vollständigkeit**, **Name**, **Größe**, **Ungelesene Bände** und **Zuletzt geändert**.
6. Öffne eine Reihe durch Antippen ihrer Karte.

## Lange Reihen

Bei einer Reihe mit mehr als 60 nummerierten Bänden erscheint der Filter **Bandbereich**. Wechsel beispielsweise zwischen `1–60` und `61–120`.

---

# 6. Banddetails und Fehlbände testen

## Vorhandener Band

1. Tippe im Regal auf einen vorhandenen Band.
2. Eine Detailansicht muss zeigen:
   - Reihe und Bandnummer,
   - Titel und Erscheinungsjahr,
   - alle physischen Exemplare,
   - deren Zustände, Lesestatus und Folierung,
   - Duckipedia-, Bearbeiten- und Exemplaraktionen.

## Fehlender Band

1. Tippe auf einen Platzhalter mit **Fehlt**.
2. Die bekannte Fehlband-Detailansicht muss sich öffnen.
3. Dort kannst du Duckipedia-Daten laden oder den Band direkt als vorhanden eintragen.
4. Nach dem Speichern muss er im Regal als vorhandener Band erscheinen.

---

# 7. Intelligente Listen testen

1. Öffne **Sonderbände & weitere Reihen**.
2. Oben erscheinen acht intelligente Listen.
3. Öffne beispielsweise **Noch ungelesen** oder **Daten ergänzen**.
4. Die klassische Kartenliste muss mit dem passenden Filter erscheinen.
5. Oben wird die aktive intelligente Liste angezeigt.
6. Tippe auf **Liste verlassen**, um zur normalen Sammlung zurückzukehren.

Die Liste **Ohne Cover** berücksichtigt sowohl eigene lokale Cover als auch Duckipedia-Vorschauen.

---

# 8. Sammelbearbeitung testen

Führe diesen Test am besten zunächst im Entenarchiv-Testmodus oder mit zwei unkritischen Bänden durch.

1. Öffne eine Reihenseite.
2. Tippe auf **Auswählen**.
3. Markiere zwei vorhandene Bände.
4. Wähle beispielsweise **Gelesen**.
5. Beide Ausgaben müssen aktualisiert werden.
6. Tippe anschließend auf **Letzte Änderung rückgängig**.
7. Der vorherige Zustand muss wiederhergestellt werden.

Wichtig: Eine Zustandsänderung in der Sammelbearbeitung gilt bewusst für **alle physischen Exemplare** der ausgewählten Ausgaben. Darauf weist die App im Auswahlbereich hin.

---

# 9. Offline-Test

1. Öffne Version 4.1 einmal mit Internetverbindung.
2. Warte einige Sekunden.
3. Schließe Entenarchiv vollständig.
4. Aktiviere den Flugmodus.
5. Öffne die App erneut.
6. Startseite, Reihenbibliothek, Regale und lokale Cover müssen weiterhin funktionieren.

Externe Duckipedia-Cover können offline fehlen. Eigene lokal gespeicherte Cover bleiben verfügbar.

---

# 10. Datensicherheit

Version 4.1 verändert nicht:

- den Datenbanknamen,
- das IndexedDB-Schema,
- das Datenformat,
- das Archivmodell,
- vorhandene Reihen, Ausgaben oder Exemplare,
- Coverbilder,
- Fehlbanddetails,
- Kalendertermine,
- Flohmarktmarkierungen.

Trotzdem bleibt Browser-Speicher kein Ersatz für externe Backups. Bewahre regelmäßig ein JSON-Backup und bei eigenen Coverbildern ein Medien-Backup außerhalb der App auf.
