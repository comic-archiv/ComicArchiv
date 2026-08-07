# Entenarchiv 4.1.2 – Update- und Testanleitung

## Inhalt des Updates

Version 4.1.2 behebt die noch offenen Probleme der digitalen Regale:

1. Duckipedia-Cover werden aus der echten Band-Infobox statt über unsichere Bildheuristiken gewählt.
2. Sichtbare Galeriecover laden automatisch, ohne dass der Band vorher geöffnet werden muss.
3. Geladene Cover bleiben nach dem Verlassen und erneuten Öffnen einer Reihenseite erhalten.
4. Die Banddetailansicht nutzt auf dem iPhone den vollständigen Bildschirm.

Die Datenbankstruktur bleibt unverändert. Es ist keine Migration notwendig.

## 1. Vor dem Update sichern

1. Öffne Entenarchiv auf dem iPhone.
2. Erstelle unter **Export & Backup** ein aktuelles JSON-Backup.
3. Bei eigenen Coverfotos zusätzlich ein Medien-Backup erstellen.
4. Prüfe in der Dateien-App, dass beide Dateien vorhanden sind.

## 2. Dateien bei GitHub hochladen

1. Lade `Entenarchiv-v4.1.2-Cover-Vollbild-Hotfix.zip` herunter.
2. Entpacke die ZIP-Datei auf dem Mac.
3. Öffne dein bestehendes Entenarchiv-Repository.
4. Wähle **Add file → Upload files**.
5. Öffne den entpackten Ordner `Entenarchiv`.
6. Lade den vollständigen sichtbaren Inhalt hoch und ersetze die vorhandenen Dateien.
7. Verwende beispielsweise diese Commit-Nachricht:

```text
Entenarchiv Version 4.1.2
```

Der bestehende GitHub-Actions-Workflow muss nicht erneut eingerichtet werden. `index.html` muss weiterhin direkt im Hauptverzeichnis des Repositorys liegen.

## 3. Veröffentlichung prüfen

1. Öffne in GitHub den Reiter **Actions**.
2. Öffne **Entenarchiv prüfen und veröffentlichen**.
3. Warte, bis **Qualitätsprüfung** und **GitHub Pages veröffentlichen** grün sind.

Scheitert die Qualitätsprüfung, bleibt die bisherige geprüfte Version veröffentlicht.

## 4. Update auf dem iPhone aktivieren

1. Stelle eine Internetverbindung her.
2. Schließe Entenarchiv über den App-Umschalter vollständig.
3. Öffne die Home-Screen-App erneut.
4. Schließe und öffne sie bei Bedarf ein zweites Mal.
5. Kontrolliere unten im Backup-Bereich:

```text
Entenarchiv v4.1.2
```

Die Home-Screen-App muss nicht entfernt werden. Lösche keine Safari-Websitedaten.

## 5. Automatisches Laden der Cover testen

1. Öffne **Lustige Taschenbücher**.
2. Bleibe mit aktiver Internetverbindung einige Sekunden in der Regalansicht.
3. Die ersten sichtbaren Cover müssen erscheinen, ohne dass du einen Band antippst.
4. Scrolle langsam weiter. Weitere Cover müssen automatisch nachladen, bevor sie vollständig sichtbar sind.
5. Verlasse die Reihe und öffne sie erneut. Bereits geladene Cover müssen wieder erscheinen.
6. Schließe Entenarchiv vollständig und öffne es erneut. Erfolgreich gespeicherte Duckipedia-Cover müssen weiterhin verfügbar sein.

Beim ersten Durchlauf können ältere Einträge etwas länger benötigen, weil ihre bisherige Coverzuordnung einmalig gegen die aktuelle Infobox geprüft wird.

## 6. Das konkrete Beispiel LTB 2 prüfen

1. Suche in der Hauptreihe nach Band `2`.
2. Entenarchiv muss das Originalcover verwenden, das in der rechten Duckipedia-Bandinfobox angezeigt wird.
3. Ein Rezensionsthumbnail, ein Bild aus einer Geschichte, ein Logo oder das Feld `NEU-BILD` darf nicht als Hauptcover erscheinen.
4. Ist zunächst noch ein altes Cover sichtbar, lasse die Seite kurz online geöffnet. Die neue Lookup-Version ersetzt alte Zuordnungen automatisch.

## 7. Vollbild-Banddetails testen

1. Tippe einen vorhandenen Band an.
2. Die Detailansicht muss auf dem iPhone den gesamten Bildschirm einnehmen.
3. Das Cover muss zentriert über den Exemplardaten stehen.
4. Prüfe, dass Titel, Jahr, alle Exemplare, Zustände, Lesestatus, Folierung und Notizen lesbar sind.
5. Scrolle bis zu den Aktionen am unteren Rand.
6. Teste **Comic bearbeiten**, **Exemplare verwalten** und **Duckipedia-Daten laden**.
7. Schließe die Ansicht über das X oben rechts.

## 8. Offline-Test

1. Öffne die aktualisierte App und mindestens eine Reihe einmal online.
2. Schließe die App.
3. Aktiviere den Flugmodus.
4. Öffne Entenarchiv erneut.
5. App, Sammlung und bereits gespeicherte Cover müssen weiterhin funktionieren. Noch nie geladene Duckipedia-Bilder benötigen weiterhin eine Internetverbindung.

## Fehlerdiagnose

Sollte Entenarchiv nicht starten oder ein Coverproblem bestehen:

1. Öffne **Export & Backup → Technische Speicherdetails → Diagnose & Sicherheit**.
2. Erstelle einen Diagnosebericht.
3. Lösche nicht eigenständig die Websitedaten, da dort die lokale Sammlung gespeichert ist.
