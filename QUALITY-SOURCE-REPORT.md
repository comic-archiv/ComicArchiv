# Entenarchiv Source-Hygiene Report

Stand: 4.5.3 · automatisch erzeugt beim CSS/HTML Source Cleanup.

## CSS

| Kennzahl | Vorher | Nachher |
|---|---:|---:|
| Dateigröße | 197.7 KB | 196.7 KB |
| Zeilen | 10449 | 10385 |
| analysierte Style-Regeln | 1619 | 1603 |
| eindeutige Selektoren je Kontext | 1388 | 1388 |
| wiederholte Selektorgruppen | 206 | 195 |
| zusätzliche Selektor-Regelblöcke | 231 | 215 |
| exakt redundante Regelblöcke | 16 | 0 |

Entfernt wurden ausschließlich **vollständig identische Regelblöcke desselben Selektors im selben At-Rule-Kontext**. Der jeweils letzte Block bleibt erhalten. Abweichende Overrides werden bewusst nicht automatisch zusammengeführt.

### Häufigste border-radius-Werte

- `999px`: 34×
- `12px`: 23×
- `14px`: 16×
- `16px`: 14×
- `13px`: 13×
- `15px`: 12×
- `var(--radius-control)`: 12×
- `10px`: 10×
- `11px`: 10×
- `18px`: 8×
- `17px`: 7×
- `var(--radius-medium)`: 6×

### Entfernte exakte Duplikate

- `.stats-grid` · @media (min-width: 560px)
- `.stat-card-highlight` · @media (min-width: 560px)
- `.scanner-status[data-type="success"]` · global
- `.scanner-status[data-type="error"]` · global
- `.scanner-queue` · global
- `.scanner-queue-list` · global
- `.backup-status-grid` · global
- `.app-page` · global
- `.app-page-content` · global
- `.assistant-result-reasons` · global
- `.scanner-queue-card.is-success` · global
- `.scanner-queue-card.is-warning` · global
- `.scanner-queue-card.is-error` · global
- `.scanner-queue-identity > div` · global
- `.scanner-queue-editor > summary::-webkit-details-marker` · global
- `.scanner-copy-notes` · global

## HTML

| Kennzahl | Vorher | Nachher |
|---|---:|---:|
| Dateigröße | 83.8 KB | 83.8 KB |
| Zeilen | 950 | 950 |
| Elemente | 1418 | 1418 |
| IDs | 528 | 528 |
| eindeutige IDs | 528 | 528 |
| Templates | 0 | 0 |

HTML wurde in dieser sicheren Tranche nur hinsichtlich Zeilenenden, trailing whitespace und mehrfachen Leerzeilen normalisiert. DOM-Struktur und IDs bleiben byte-unabhängig identisch.

## Nächster Schritt

Der Report dient als belastbare Basis für Tranche 2B: gezielte Konsolidierung **abweichender** CSS-Overrides und Lazy-Mounting seltener Unterseiten/Modals. Diese Änderungen benötigen visuelle Smoke-Tests und werden deshalb bewusst nicht automatisch mit 2A vermischt.
