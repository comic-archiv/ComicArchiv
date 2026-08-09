# Entenarchiv Legacy Mirror Repair Report

Stand: 4.6.2 · Data Stack v2 · Parity Recovery.

## Zweck

Der `comics`-Store ist in der aktuellen Übergangsarchitektur ein abgeleiteter Legacy-Mirror. Die aktive Sammlungsansicht liest bereits aus `seriesCatalog`, `issues` und `copies`. 4.6.2 ergänzt deshalb einen sicheren Recovery-Pfad für den Fall, dass der Archivgraph gültig ist und beide Seiten exakt dieselben Ausgabe-IDs enthalten, einzelne Mirror-Datensätze aber in ihren Feldern abweichen.

## Sicherheitsregeln

Eine automatische Reparatur ist nur erlaubt, wenn:

1. der Archivgraph vollständig valide ist,
2. im Mirror keine Ausgabe fehlt,
3. der Mirror keine zusätzliche Ausgabe enthält und
4. mindestens ein Datensatz inhaltlich abweicht.

Vor dem Rewrite wird ein `pre-legacy-mirror-repair-v1`-Snapshot erzeugt. Er enthält Archivgraph, bisherigen Legacy-Mirror, Settings und eine Feldübersicht der Abweichungen. Anschließend wird ausschließlich der `comics`-Store aus dem Archivgraph neu materialisiert und die vollständige Parität erneut geprüft.

Fehlende oder zusätzliche IDs werden nicht automatisch repariert. In diesem Fall bleibt die Sicherheitsbremse aktiv.

## Prävention

`saveSeriesDefinition()` aktualisiert ab 4.6.2 neben `seriesCatalog` auch die materialisierten Mirror-Einträge der betroffenen Reihe. Damit wird ein bekannter Desynchronisationspfad geschlossen.

## Unverändert

- IndexedDB-Schema: 6
- Datenformat: 9
- Archivmodell: 1
- Settings Split: Spiegelphase
- Archivgraph, Cover und Settings werden bei der Mirror-Reparatur nicht verändert.
