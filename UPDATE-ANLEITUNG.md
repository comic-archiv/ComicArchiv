# Entenarchiv 4.3.0 – Update-, Bedienungs- und Testanleitung

## Was dieses Update verändert

Version 4.3.0 behebt die verdeckten Zurück-Buttons und ergänzt das Erscheinungsradar. Datenbankname, IndexedDB-Schema, Datenformat und Archivmodell bleiben unverändert. Eine erneute Migration der Sammlung ist nicht erforderlich.

## Vor dem Update

1. Entenarchiv auf dem iPhone öffnen.
2. Unter **Export & Backup** ein aktuelles JSON-Backup erstellen.
3. Bei eigenen Coverbildern zusätzlich ein vollständiges Medien-Backup erstellen.
4. In der Dateien-App prüfen, dass beide Dateien vorhanden sind.

# Teil 1: sichtbare Projektdateien hochladen

1. `Entenarchiv-v4.3.0-Erscheinungsradar.zip` herunterladen.
2. ZIP auf dem Mac entpacken.
3. Das bestehende GitHub-Repository öffnen.
4. **Add file → Upload files** wählen.
5. Den vollständigen sichtbaren Inhalt des entpackten Ordners `Entenarchiv` hochladen.
6. Bestehende Dateien ersetzen.
7. Besonders prüfen, dass diese neuen Dateien vorhanden sind:

```text
release-radar.js
scripts/sync-release-calendars.mjs
```

8. Beispielsweise mit `Entenarchiv Version 4.3.0` committen.

# Teil 2: Workflow einmalig aktualisieren

Der vorhandene GitHub-Actions-Workflow aus Version 3.9 beziehungsweise 4.2 veröffentlicht die App weiterhin. Für die **automatische jährliche Kalendererkennung** muss die versteckte Workflow-Datei einmalig auf die neue Fassung gebracht werden.

Da sich der Ordner `.github` über den normalen Browser-Upload oft nicht zuverlässig ersetzen lässt:

1. Im Repository den Reiter **Code** öffnen.
2. Zu `.github/workflows/deploy-pages.yml` navigieren.
3. Das Stift-Symbol **Edit this file** anklicken.
4. Den gesamten bisherigen Inhalt markieren und löschen.
5. Den Inhalt der mitgelieferten Datei `deploy-pages-4.3.yml` einfügen.
6. Mit `Workflow für automatische Jahrespläne aktualisieren` committen.

Alternativ kann die Datei über **Add file → Create new file** mit diesem Pfad angelegt werden:

```text
.github/workflows/deploy-pages.yml
```

Die neue Workflow-Datei:

- prüft die App bei jedem Commit,
- prüft zusätzlich montags um 04:17 Uhr UTC den offiziellen LTB-Downloadbereich,
- verwendet bei einem vorübergehenden Netzwerkfehler den vorhandenen Kalenderstand,
- veröffentlicht anschließend das geprüfte Produktionspaket.

## GitHub Actions abwarten

1. Den Bereich **Actions** öffnen.
2. Den Lauf **Entenarchiv prüfen und veröffentlichen** auswählen.
3. Warten, bis beide Jobs grün sind:

```text
Qualitätsprüfung
GitHub Pages veröffentlichen
```

## Update auf dem iPhone aktivieren

1. Internetverbindung aktivieren.
2. Entenarchiv über den App-Umschalter vollständig schließen.
3. App erneut öffnen.
4. Bei Bedarf ein zweites Mal schließen und öffnen.
5. Im Backup-Bereich ganz unten kontrollieren:

```text
Entenarchiv v4.3.0
```

Die Home-Screen-App darf installiert bleiben. Websitedaten müssen nicht gelöscht werden.

# Erscheinungsradar verwenden

## Radar öffnen

Das Radar ist erreichbar über:

- die Karte **Erscheinungsradar** auf der Startseite,
- die Karte **Neuerscheinungen prüfen** in der Kalenderansicht,
- eine Zahl am Kalender-Icon, wenn neue oder heute fällige Veröffentlichungen vorliegen.

## Bedeutung der Status

- **Im Besitz:** Die Ausgabe existiert bereits im Archiv.
- **Fehlt:** Die Ausgabe liegt innerhalb des persönlichen Sammlungsziels.
- **Nicht vorgemerkt:** Der Termin ist bekannt, aber noch nicht Teil eines Ziels.
- **Vorgemerkt:** Die Ausgabe soll gesucht oder gekauft werden.
- **Bestellt:** Die Ausgabe wurde bereits bestellt.
- **Ignoriert:** Der Termin soll nicht mehr als offene Aufgabe erscheinen.

## Ausgabe vormerken

1. Bei einer Veröffentlichung **Vormerken** antippen.
2. Entenarchiv erweitert das Sammlungsziel dieser Reihe bei Bedarf bis zur betreffenden Bandnummer.
3. Der Band erscheint dadurch zusätzlich unter den fehlenden Bänden.

## Ausgabe als bestellt markieren

1. **Bestellt** antippen.
2. Der Band bleibt Teil des Sammlungsziels, wird im Radar aber separat als bestellt geführt.
3. Nach dem Erscheinen kann er über **Als vorhanden eintragen** zum Hinzufügen vorbereitet werden.

## Ausgabe in die Sammlung übernehmen

Bei einer bereits erschienenen Ausgabe:

1. **Als vorhanden eintragen** antippen.
2. Reihe, Bandnummer und Erscheinungsjahr werden in das Hinzufügen-Formular übernommen.
3. Nur Zustand und persönliche Eigenschaften kontrollieren.
4. Comic speichern.

## Erinnerungen in Apple Kalender

1. Gewünschte Ausgaben als **Vorgemerkt** oder **Bestellt** markieren.
2. Im Radar **Vorgemerkte erinnern** antippen.
3. Die erzeugte iCal-Datei über das iOS-Teilen-Menü mit Apple Kalender öffnen.
4. Termine übernehmen.

So funktionieren Erinnerungen auch bei vollständig geschlossener Entenarchiv-App ohne zusätzlichen Push-Server.

## App-Badge aktivieren

1. Im Radar **Automatik & App-Badge** aufklappen.
2. **Zahl am Entenarchiv-Symbol** aktivieren.
3. Die von iOS angeforderte Mitteilungsberechtigung bestätigen.

Das Badge wird beim Öffnen von Entenarchiv aus den lokal bekannten Terminen berechnet. Es zählt jede neue oder heute fällige Ausgabe höchstens einmal.

# Automatische neue Kalenderjahre

Sobald der Verlag im Downloadbereich eine neue `.ics`-Datei veröffentlicht, versucht der wöchentliche Workflow:

1. den offiziellen Downloadbereich zu lesen,
2. ausschließlich HTTPS-Dateien von `lustiges-taschenbuch.de` zu akzeptieren,
3. iCal-Struktur und Kalenderjahr zu prüfen,
4. bei mehreren Fassungen die höchste `v`-Version zu verwenden,
5. die Datei als `data/ltb-JAHR.ics` in das veröffentlichte Pages-Paket aufzunehmen,
6. `data/kalender-index.json` für die App zu aktualisieren.

Die GitHub-Pages-Adresse bleibt dabei unverändert. Die App muss nicht neu installiert werden.

# Konkrete Tests nach dem Update

## Zurück-Buttons

1. Hauptreihe, Sonderreihenbibliothek, Kalender und Statistiken nacheinander öffnen.
2. In jeder Ansicht scrollen.
3. Prüfen, dass der jeweilige Zurück-Button sichtbar und anklickbar bleibt.
4. Prüfen, dass die globale Startseiten-Kopfzeile während einer Unterseite nicht darüberliegt.

## Radar-Verknüpfung

1. Erscheinungsradar öffnen.
2. Eine Ausgabe wählen, die noch nicht vorhanden ist.
3. **Vormerken** antippen.
4. Fehlbandliste der betreffenden Reihe öffnen.
5. Prüfen, dass die Bandnummer nun dort erscheint.

## Vorhandene Ausgabe

1. Einen Kalendertermin zu einem bereits gespeicherten Band suchen.
2. Prüfen, dass **Im Besitz** angezeigt wird.
3. **In Sammlung** antippen.
4. Prüfen, dass die passende Ausgabe geöffnet beziehungsweise gefiltert wird.

## Badge

1. App-Badge aktivieren.
2. Entenarchiv vollständig schließen und erneut öffnen.
3. Prüfen, ob bei offenen neuen Terminen eine Zahl am Home-Screen-Symbol angezeigt wird.
4. Neue Termine als gesehen markieren und App erneut öffnen.
5. Prüfen, dass die Zahl sinkt oder verschwindet.

## Offline

1. Entenarchiv mindestens einmal online öffnen.
2. App vollständig schließen.
3. Flugmodus aktivieren.
4. App erneut öffnen.
5. Sammlung, Regale, bereits importierte Kalendertermine und Radarstatus müssen verfügbar bleiben. Neue Jahrespläne und Duckipedia-Daten benötigen weiterhin Internet.

# Bestehende Daten

Version 4.3.0 verändert nicht:

- vorhandene Reihen,
- Ausgaben und physische Exemplare,
- Zustände und Notizen,
- Reihenziele und fehlende Bände,
- Flohmarkt-Markierungen,
- eigene Termine,
- eigene Coverbilder,
- bisherige Backups.
