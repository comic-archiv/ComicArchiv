# Entenarchiv 4.2.0 – Update-, Bedienungs- und Testanleitung

## Was dieses Update verändert

Version 4.2.0 ergänzt Scanner Pro, den geführten Zustandsassistenten und den Header-Hotfix. Datenbankname, IndexedDB-Schema, Datenformat und Archivmodell bleiben unverändert. Eine erneute Migration der Sammlung ist nicht erforderlich.

## Vor dem Update

1. Entenarchiv auf dem iPhone öffnen.
2. Unter **Export & Backup** ein aktuelles JSON-Backup erstellen.
3. Bei eigenen Coverbildern zusätzlich ein vollständiges Medien-Backup erstellen.
4. In der Dateien-App prüfen, dass die Dateien vorhanden sind.

## Dateien bei GitHub hochladen

1. `Entenarchiv-v4.2.0-Scanner-Pro-Zustandsassistent.zip` herunterladen.
2. ZIP auf dem Mac entpacken.
3. Das bestehende GitHub-Repository öffnen.
4. **Add file → Upload files** wählen.
5. Den vollständigen sichtbaren Inhalt des entpackten Ordners `Entenarchiv` hochladen.
6. Bestehende Dateien ersetzen.
7. Besonders prüfen, dass diese neuen Dateien im Hauptverzeichnis liegen:

```text
scanner-pro.js
condition-assistant.js
```

8. Beispielsweise mit `Entenarchiv Version 4.2.0` committen.
9. Unter **Actions** warten, bis **Qualitätsprüfung** und **GitHub Pages veröffentlichen** grün sind.

Der bereits eingerichtete GitHub-Actions-Workflow muss nicht verändert werden.

## Update auf dem iPhone aktivieren

1. Internetverbindung aktivieren.
2. Entenarchiv über den App-Umschalter vollständig schließen.
3. App erneut öffnen.
4. Bei Bedarf ein zweites Mal schließen und öffnen.
5. Im Backup-Bereich ganz unten kontrollieren:

```text
Entenarchiv v4.2.0
```

Die Home-Screen-App darf installiert bleiben. Websitedaten müssen nicht gelöscht werden.

# Scanner Pro verwenden

## Scan & weiter

Dieser Modus eignet sich für größere Stapel.

1. **Hinzufügen → Serien-Scanner** öffnen.
2. **Scan & weiter** wählen.
3. Reihe und Standardwerte festlegen.
4. Kamera erlauben und die vollständige weiße Barcodefläche in den Rahmen halten.
5. Nach der grünen Bestätigung den Band aus dem Bild nehmen.
6. Nächsten Band vor die Kamera halten.

Jeder akzeptierte Scan landet direkt in der Warteschlange. Duckipedia-Titel und Erscheinungsjahr werden unabhängig davon im Hintergrund geladen.

## Vorher prüfen

Dieser Modus ist sinnvoll bei uneinheitlichen Reihen oder problematischen Barcodes.

1. **Vorher prüfen** wählen.
2. Band scannen.
3. Titel und Erscheinungsjahr kontrollieren.
4. **Vormerken & weiter** antippen.
5. Nächsten Band scannen.

## Mehrere Exemplare derselben Ausgabe

Wird derselbe Band erneut gescannt, bleibt es bei einer Ausgabe. In der Warteschlange erscheint ein weiteres physisches Exemplar. Für jedes Exemplar lassen sich separat pflegen:

- Zustand,
- gelesen oder ungelesen,
- foliert oder nicht foliert,
- Notiz.

Über **+ Exemplar** kann ein weiteres Exemplar auch manuell ergänzt werden. Vorhandene Ausgaben können als zusätzliches Exemplar übernommen oder übersprungen werden.

## Warteschlange speichern

1. Treffer mit gelbem Hinweis öffnen und prüfen.
2. Bei Bedarf Titel, Jahr oder Exemplardaten korrigieren.
3. **Geprüfte Bände speichern** antippen.

Erst dann werden die Daten dauerhaft in IndexedDB geschrieben.

# Zustandsassistent verwenden

Neben einem Zustandsfeld gibt es jetzt **Assistent** und **Stufen**.

Der Assistent fragt nacheinander:

1. Ist der Comicteil vollständig?
2. Ist der Umschlag vollständig?
3. Wie wirkt der Band insgesamt?
4. Welche konkreten Mängel sind vorhanden?

Danach erscheint eine begründete Empfehlung. Mit **Empfehlung übernehmen** wird die Stufe in das jeweilige Zustandsfeld geschrieben. Ist ein Notizfeld verfügbar, können die ausgewählten Mängel zusätzlich als Notiz gespeichert werden.

Wichtig: Die Empfehlung ist eine Orientierungshilfe. Grenzfälle, Restaurationen und ungewöhnliche Mängelkombinationen müssen weiterhin am konkreten Exemplar beurteilt werden.

# Konkrete Tests nach dem Update

## Header

1. Eine Reihenseite, Sammlungsliste oder Statistik öffnen.
2. Nach unten scrollen.
3. Kontrollieren, dass Karten und Auswahlleisten hinter der Kopfzeile verschwinden.

## Scanner-Schnellmodus

1. Zwei unterschiedliche Bände scannen.
2. Ersten Band aus dem Bild nehmen und danach noch einmal scannen.
3. Prüfen:
   - zwei Ausgaben in der Warteschlange,
   - beim doppelt gescannten Band zwei Exemplare,
   - Kamera blieb zwischen den Scans aktiv.

## Vorhandener Band

1. Einen bereits gespeicherten Band scannen.
2. Prüfen, dass **Als weiteres Exemplar speichern** angeboten wird.
3. Zustand des neuen Exemplars setzen.
4. Warteschlange speichern.
5. In der Banddetailansicht kontrollieren, dass kein zweiter Bandeintrag entstanden ist.

## Zustandsassistent

1. Im normalen Hinzufügen auf **Assistent** tippen.
2. Einen gepflegten Gesamteindruck und einen Riss bis etwa 5 cm wählen.
3. Prüfen, dass die Empfehlung nicht besser als Zustand 2–3 ausfällt.
4. Empfehlung übernehmen und kontrollieren, dass die Mängelnotiz ergänzt wurde.

## Offline

1. Entenarchiv mindestens einmal online öffnen.
2. App vollständig schließen.
3. Flugmodus aktivieren.
4. App erneut öffnen.
5. Sammlung, Regale, Zustandsassistent und bereits vorgemerkte lokale Daten müssen erreichbar sein. Duckipedia-Anreicherung benötigt weiterhin Internet.

# Bestehende Daten

Version 4.2.0 verändert nicht:

- vorhandene Ausgaben,
- physische Exemplare,
- eigene Reihen,
- Reihenziele,
- fehlende Bände,
- Flohmarkt-Markierungen,
- Kalendertermine,
- eigene Coverbilder,
- bisherige Backups.
