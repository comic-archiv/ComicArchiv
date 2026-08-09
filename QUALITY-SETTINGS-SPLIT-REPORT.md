# Entenarchiv Settings Split Report

Stand: 4.6.1 · Data Stack v2 · Settings Split Mirror.

## Ziel

Der bisherige `settings`-Datensatz bleibt in dieser Zwischenstufe die aktive Lesequelle und der sichere Legacy-Fallback. Gleichzeitig werden alle normalisierten Einstellungen verlustfrei in sechs fachlich getrennte Schema-6-Stores gespiegelt.

## Aufteilung

| Store | Inhalt |
|---|---|
| `preferences` | Theme, Coveranzeige, Duckipedia-Auto-Enrichment, Scanner-Modus |
| `calendarState` | Kalendertermine, Quellen, Importstatus, Ansicht, Reminder |
| `missingState` | bekannte Höchstbände und Fehlbanddetails |
| `fleaMarketState` | Flohmarkt-Session |
| `releaseRadarState` | Radar-Entscheidungen, Signaturen, Filter, Aliase und Event-Links |
| `collectorState` | eigene Reihen, Backupstatus, Meilensteine und Migrationsbestätigung |

Alle 35 normalisierten Settings-Felder sind genau einer Gruppe zugeordnet.

## Sicherheit

- Vor der ersten Spiegelung wird ein vollständiger Snapshot vom Typ `pre-settings-split-v1` angelegt.
- Archivgraph und `comics`-Mirror werden vor der Settings-Migration erneut auf Parität geprüft.
- Nach dem Schreiben werden alle sechs Gruppen gegen den normalisierten Legacy-Settings-Datensatz verglichen.
- Fehlende oder abweichende Gruppen markieren den Settings Split als fehlgeschlagen; der bisherige Legacy-Settings-Pfad bleibt dabei weiterhin funktionsfähig.
- `saveAppSettings()` schreibt Legacy-Settings und die sechs Split-Stores in derselben IndexedDB-Transaktion, sobald die Spiegelung erfolgreich vorbereitet ist.
- Eine Wiederherstellung des Data-Stack-Snapshots stellt auch die Split-Stores wieder synchron her.

## Noch bewusst nicht geändert

- `getAppSettings()` liest weiterhin den Legacy-`settings`-Datensatz.
- Der Legacy-Settings-Datensatz wird weiterhin bei jeder Settings-Änderung aktualisiert.
- Es gibt deshalb in 4.6.1 noch keinen vollständigen Write-Amplification-Gewinn; 4.6.1 dient der sicheren Paritätsphase.
- `comics` bleibt weiterhin als Live-Mirror bestehen.

## Prüfung

- 151/151 automatisierte Tests erfolgreich.
- Kalenderprüfung erfolgreich.
- Produktions-Build erfolgreich.
- Settings-Gruppen werden in Unit-Tests vollständig, überschneidungsfrei und verlustfrei geprüft.
- Schema 6 und die bestehenden Legacy-Stores bleiben unverändert kompatibel.

## Nächster Schritt

4.6.2 kann nach erfolgreicher Bewährung dieser Spiegelphase `getAppSettings()` auf die sechs Split-Stores umstellen und `saveAppSettings()` nur noch die tatsächlich betroffene Gruppe schreiben. Der Legacy-Settings-Datensatz bleibt dann zunächst als statischer Rollback-Snapshot erhalten, wird aber nicht mehr als Live-Mirror gepflegt.
