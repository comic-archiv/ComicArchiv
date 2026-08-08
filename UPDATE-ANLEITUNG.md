# Entenarchiv 4.3.1 – Kalender-Reihenzuordnung

Version 4.3.1 erweitert das Erscheinungsradar um eine direkte Zuordnung bislang unbekannter Verlagstermine. Datenbankname, IndexedDB-Schema, Datenformat und Archivmodell bleiben unverändert. Eine Datenmigration ist nicht erforderlich.

## Neu in 4.3.1

### Nicht zugeordnete Termine direkt verknüpfen

Bei Verlagsterminen, die Entenarchiv noch keiner Reihe zuordnen kann, erscheint jetzt **„Reihe zuordnen“**. Die Funktion steht sowohl im Erscheinungsradar als auch in der Kalenderliste zur Verfügung.

Danach gibt es zwei Wege:

1. **Bestehende Reihe** – wähle eine vorhandene Reihe aus.
2. **Neue Reihe erstellen** – lege direkt aus dem Kalendertermin eine neue Reihe an.

Entenarchiv versucht aus dem Titel bereits Reihennamen und Bandnummer vorzuschlagen. Die Angaben können vor dem Speichern geändert werden.

### Kalender-Aliase

Die im Kalender verwendete Bezeichnung kann als Alias gespeichert werden. Beispiel:

- Archivreihe: `LTB Ostern`
- Kalender-Alias: `LTB Frohe Ostern`

Künftige Termine mit demselben Alias werden automatisch der richtigen Reihe zugeordnet. Bei eigenen Reihen werden die Aliase zusätzlich an der Reihenverwaltung angezeigt.

### Direkte Einzelverknüpfung

Neben dem Alias speichert Entenarchiv die konkrete Zuordnung des aktuellen Termins zu Reihe und Bandnummer. Dadurch bleibt auch ein ungewöhnlich benannter Einzeltermin korrekt verknüpft.

### Neue Reihe aus einem Kalendertermin

Beim Erstellen einer neuen Reihe werden gespeichert:

- stabiler interner Reihenbezeichner
- Reihenname
- Kalender-Alias
- optionale Duckipedia-Vorlage
- konkrete Terminzuordnung

Die neue Reihe steht danach sofort in Sammlung, Fehlbandverwaltung, Reihenzielen und Erscheinungsradar zur Verfügung.

### Reihenziel beim Vormerken

Sobald der Termin zugeordnet ist, funktionieren **Vormerken** und **Bestellt** wie bei bekannten Reihen. Liegt die Bandnummer über dem bisherigen Reihenziel, wird das Ziel automatisch angehoben. Niedrigere Bandnummern reduzieren ein bestehendes höheres Ziel nicht.

## Bestehende Daten

Unverändert bleiben:

- Datenbank: `comicarchiv-db`
- IndexedDB-Schema: 5
- Datenformat: 9
- Archivmodell: 1
- alle vorhandenen Ausgaben und Exemplare
- Coverbilder
- Reihenziele
- Fehlbanddetails
- Flohmarktmarkierungen
- Kalendertermine

Neue Zuordnungen werden als normale App-Einstellungen gespeichert und sind Bestandteil der JSON- und Medien-Backups.

## Installation

1. Aktuelles JSON-Backup erstellen.
2. Bei eigenen Coverbildern zusätzlich ein Medien-Backup erstellen.
3. `Entenarchiv-v4.3.1-Kalender-Reihenzuordnung.zip` herunterladen und entpacken.
4. Im bestehenden GitHub-Repository **Add file → Upload files** wählen.
5. Den vollständigen sichtbaren Inhalt des Ordners `Entenarchiv` hochladen und vorhandene Dateien ersetzen.
6. Beispielsweise mit `Entenarchiv Version 4.3.1` committen.
7. Unter **Actions** warten, bis Qualitätsprüfung und GitHub-Pages-Veröffentlichung grün sind.
8. Entenarchiv auf dem iPhone vollständig schließen und erneut öffnen.
9. Im Backup-Bereich muss `Entenarchiv v4.3.1` stehen.

Der bestehende GitHub-Actions-Workflow muss nicht erneut geändert werden.

## Funktionstest

### Bestehender Reihe zuordnen

1. Erscheinungsradar öffnen.
2. Einen Eintrag mit `Nicht zugeordnet` suchen.
3. **Reihe zuordnen** antippen.
4. **Bestehende Reihe** auswählen.
5. Reihe, Kalender-Alias und Bandnummer prüfen.
6. **Zuordnung speichern** antippen.
7. Der Termin muss unmittelbar die gewählte Reihe und Bandnummer anzeigen.
8. Danach müssen **Vormerken**, **Bestellt** und – bei bereits erschienenen Ausgaben – **Als vorhanden eintragen** verfügbar sein.

### Neue Reihe erstellen

1. Einen weiteren nicht zugeordneten Termin öffnen.
2. **Neue Reihe erstellen** wählen.
3. vorgeschlagenen Reihennamen und Bandnummer prüfen.
4. optional einen Duckipedia-Pfad hinterlegen.
5. speichern.
6. Die Reihe muss danach in der normalen Reihenverwaltung und im Erscheinungsradar vorhanden sein.

### Alias prüfen

Wenn zwei Termine derselben bisher unbekannten Reihe im Jahresplan vorhanden sind, ordne den ersten Termin zu und speichere den vorgeschlagenen Kalender-Alias. Der zweite Termin sollte danach automatisch derselben Reihe zugeordnet werden, sofern sein Titel dem Muster `Alias + Bandnummer` entspricht.

### Reihenziel prüfen

1. Einen zugeordneten zukünftigen Band wählen, dessen Nummer über dem bisherigen Reihenziel liegt.
2. **Vormerken** antippen.
3. Reihenfortschritt öffnen.
4. Das Reihenziel muss auf mindestens diese Bandnummer angehoben worden sein.

## Rückgängig machen

Eine versehentliche Zuordnung kann derzeit nicht über einen einzelnen „Zuordnung löschen“-Button entfernt werden. Bei selbst erstellten Reihen kann die Reihe über die Reihenverwaltung entfernt werden; zugehörige Kalender-Aliase und manuelle Terminverknüpfungen werden dabei mitbereinigt. Für eine bestehende Standardreihe kann eine fehlerhafte Zuordnung durch erneutes Zuordnen desselben Termins überschrieben werden.
