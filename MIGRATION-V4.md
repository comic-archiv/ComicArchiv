# Umstellung auf den Archivkern von Entenarchiv 4

Version 4 führt ein neues internes Datenmodell ein. Die sichtbare Sammlung bleibt erhalten, wird aber künftig stabiler gespeichert.

## Vor dem Update

Erstelle in der bisherigen App unbedingt:

1. ein aktuelles **JSON-Backup**,
2. bei eigenen Coverbildern zusätzlich ein **Medien-Backup**.

Der lokale Rückfall-Schnappschuss von Version 4 liegt auf demselben iPhone wie die Sammlung. Er schützt vor Bedienfehlern während der Umstellung, aber nicht vor Geräteverlust, gelöschten Websitedaten oder einem Defekt des iPhones.

## Was sich intern ändert

Bisher enthielt ein Comic-Datensatz gleichzeitig Angaben zur Reihe, zur Ausgabe und zu höchstens zwei Büchern. Version 4 trennt diese Ebenen:

```text
Reihe
└── Ausgabe
    ├── Exemplar 1
    ├── Exemplar 2
    └── Exemplar 3 …
```

### Reihe

Eine Reihe erhält eine feste interne ID. Der sichtbare Name kann danach geändert werden, ohne Verknüpfungen zu verlieren.

### Ausgabe

Eine Ausgabe ist die eindeutige Kombination aus Reihe und Bandnummer. Rein numerische Schreibweisen mit führenden Nullen werden vereinheitlicht. `3`, `03` und `003` meinen daher dieselbe Ausgabe.

### Exemplar

Jedes physische Buch erhält einen eigenen Zustand, Lesestatus, Folierungsstatus und eine eigene Notiz. Eine Ausgabe kann beliebig viele Exemplare besitzen.

## Ablauf beim ersten Start

Beim ersten Öffnen nach dem Update führt Entenarchiv diese Schritte lokal auf dem Gerät aus:

1. bisherige Comics und Einstellungen lesen,
2. einen lokalen Rückfall-Schnappschuss anlegen,
3. stabile Reihen-IDs bestimmen,
4. eindeutige Ausgaben bilden,
5. vorhandene Doppelstücke in einzelne Exemplare überführen,
6. mehrfach angelegte Datensätze derselben Ausgabe zusammenführen,
7. eigene Cover auf die neue Ausgaben-ID übertragen,
8. den vollständigen Archivgraphen prüfen,
9. eine kompatible Ansicht für die bestehende Oberfläche erzeugen.

Die Umstellung läuft in einer IndexedDB-Transaktion. Unsicher zuordenbare Einträge führen zu einem kontrollierten Abbruch, statt stillschweigend verworfen zu werden.

## Übertragung alter Doppelstücke

Im bisherigen Datenmodell hatte das zweite Exemplar einen eigenen Zustand, aber keine separat gespeicherten Werte für gelesen, foliert oder Notizen. Deshalb gilt bei der Umstellung:

- der zweite Zustand wird übernommen,
- gelesen wird für das zweite Exemplar zunächst auf **Nein** gesetzt,
- foliert wird für das zweite Exemplar zunächst auf **Nein** gesetzt,
- die Exemplarnotiz bleibt zunächst leer.

Diese Werte können anschließend über **Exemplare verwalten** ergänzt werden.

## Zusammengeführte Altdaten

Existieren mehrere frühere Datensätze derselben Reihe und Bandnummer, werden sie als eine Ausgabe mit mehreren physischen Exemplaren gespeichert. Es geht dabei kein Exemplar verloren.

Beispiel:

```text
Vorher
LTB 239 · Datensatz A · doppelt
LTB 239 · Datensatz B

Nachher
LTB 239 · eine Ausgabe
├── Exemplar 1
├── Exemplar 2
└── Exemplar 3
```

Der Reihenfortschritt und die Fehlbandberechnung zählen diese Ausgabe weiterhin einmal. Exemplarstatistiken können alle drei Bücher berücksichtigen.

## Migrationsbericht

Nach einer erfolgreichen Umstellung zeigt Entenarchiv einmalig einen Bericht mit:

- Anzahl vorheriger Einträge,
- Anzahl eindeutiger Ausgaben,
- Anzahl physischer Exemplare,
- Anzahl verwendeter Reihen,
- zusammengeführten Altdubletten,
- übernommenen zusätzlichen Exemplaren,
- neu zugeordneten eigenen Coverbildern.

Der Bericht lässt sich als JSON exportieren und später erneut öffnen:

**Export & Backup → Technische Speicherdetails → Migrationsbericht öffnen**

## Vorherigen Datenstand wiederherstellen

Im Migrationsbericht gibt es bei vorhandenem Schnappschuss die Funktion **Vorherigen Datenstand wiederherstellen**.

Dabei werden die Comic-Einträge und Einstellungen aus dem Zeitpunkt unmittelbar vor der Umstellung erneut eingelesen. Änderungen, die nach dem Update vorgenommen wurden, gehen dabei verloren. Vorher sollte deshalb erneut ein aktuelles JSON-Backup erstellt werden.

Die Wiederherstellung stellt den damaligen Dateninhalt wieder her und baut daraus anschließend erneut einen geprüften Archivkern. Sie setzt die App nicht auf eine alte Programmversion zurück.

## Prüfung nach dem Update

Kontrolliere mindestens:

1. Gesamtzahl der sichtbaren Ausgaben,
2. einen bereits als doppelt markierten Band,
3. den Zustand des ersten und zweiten Exemplars,
4. eigene Coverbilder,
5. eine eigene Reihe,
6. Fehlbandlisten und Reihenfortschritt,
7. Kalender und Flohmarktmodus,
8. ein neues JSON-Backup aus Version 4.

Unter **Technische Speicherdetails** zeigt Entenarchiv zusätzlich die Anzahl von Ausgaben, Exemplaren und Reihen im Archivkern.

## Backup-Kompatibilität

Version-4-Backups enthalten:

- eine kompatible Comic-Liste,
- den vollständigen Reihenkatalog,
- eindeutige Ausgaben,
- alle physischen Exemplare,
- die Archivmodell-Version.

Ältere Backups ohne Archivkern bleiben importierbar. Backups mit einem neueren, von der installierten App noch nicht unterstützten Archivmodell werden verständlich abgelehnt.
