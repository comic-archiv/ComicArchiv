# Entenarchiv 3.8.0

Private, mobile Progressive Web App zur Verwaltung einer Sammlung von Lustigen Taschenbüchern und Sonderbänden.

## Neu in 3.8.0

### Deutsches Comic-Zustandssystem

Das bisherige internationale Raster N, NM, VF, FN, VG, GD, FR und PR wurde durch das in der deutschen Comicsammler-Szene gebräuchliche System ersetzt:

- Zustand 0 – Perfekt
- Zustand 0-1 – Fast perfekt
- Zustand 1 – Sehr gut
- Zustand 1-2 – Fast sehr gut
- Zustand 2 – Gut
- Zustand 2-3 – Noch recht gut
- Zustand 3 – Noch sammelwürdig
- Zustand 3-4 – Schlecht
- Zustand 4 – Zum Wegwerfen zu schade
- Zustand 5 – Unvollständiger Comic

In allen relevanten Bereichen steht eine Bewertungshilfe mit Beschreibungen, Preisrelationen und Hinweisen zu typischen Mängeln bereit.

### Verlustfreie Migration vorhandener Bewertungen

Beim ersten Start werden frühere Zustände automatisch und konservativ übertragen:

| Bisher | Neu |
| --- | --- |
| N | 0-1 |
| NM | 1 |
| VF | 1-2 |
| FN | 2 |
| VG | 2-3 |
| GD | 3 |
| FR | 3-4 |
| PR | 4 |

Die Zuordnung vermeidet eine künstliche Aufwertung. Vorhandene Comic-Einträge, zweite Exemplare, Fehlband-Wunschzustände und Flohmarkt-Markierungen bleiben erhalten. Alte JSON-Backups werden beim Import ebenfalls automatisch umgewandelt.

### Angepasste Statistiken

Die Qualitätsstatistik verwendet nun „Zustand 1-2 oder besser“ anstelle von „mindestens Very Fine“. Zustandskarten und Verteilungsbalken folgen weiterhin einer Farbskala von Hellblau und Grün bis Orange, Rot und Dunkelrot.

## Datenspeicherung

Die bestehende IndexedDB `comicarchiv-db` bleibt unverändert. Version 3.8.0 erhöht nur die interne Datenformat-Version und speichert die migrierten Zustandswerte in den vorhandenen Datensätzen.

## Update

Vor dem Update wird wie immer ein aktuelles JSON-Backup empfohlen. Nach dem Upload aller Dateien und der Veröffentlichung über GitHub Pages muss unten im Backup-Bereich `Entenarchiv v3.8.0` stehen.
