# Entenarchiv CSS Cascade Cleanup Report

Stand: 4.5.3 · Tranche 2B1.

## Ergebnis

| Kennzahl | Vorher | Nachher |
|---|---:|---:|
| Dateigröße | 196.7 KB | 193.6 KB |
| Zeilen | 10385 | 10385 |
| Style-Regeln | 1603 | 1603 |
| Deklarationen | 5183 | 5028 |
| eindeutige Selektoren je Kontext | 1388 | 1388 |
| wiederholte Selektorgruppen | 195 | 195 |
| zusätzliche Selektor-Regelblöcke | 215 | 215 |

Entfernt wurden **155 Deklarationen**. Eine Deklaration wurde nur entfernt, wenn derselbe Selektor im exakt selben At-Rule-Kontext später dieselbe Property mit demselben Wert erneut setzt. Unterschiedliche Werte, Browser-Fallbacks und responsive Overrides werden nicht automatisch zusammengeführt.

Der Sicherheitscheck vergleicht zusätzlich den effektiven Selektor-/Property-Fingerprint vor und nach dem Cleanup.

## Betroffene Selektoren

- `.scanner-queue-editor > summary` · global
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `cursor: pointer`
  - `list-style: none`
  - `color: var(--primary)`
  - `font-weight: 850`
- `.scanner-queue-empty` · global
  - `display: grid`
  - `border-radius: 16px`
  - `text-align: center`
  - `text-align: center`
  - `color: var(--text-muted)`
  - `border: 1px dashed var(--border)`
- `.scanner-detected-flash` · global
  - `position: absolute`
  - `inset: 50% auto auto 50%`
  - `display: grid`
  - `transform: translate(-50%, -50%)`
  - `text-align: center`
- `.scanner-pro-header` · global
  - `position: relative`
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `border-bottom: 1px solid var(--border)`
- `.scanner-queue-card` · global
  - `overflow: hidden`
  - `border: 1px solid var(--border)`
  - `border: 1px solid var(--border)`
  - `background: var(--surface-soft)`
- `.scanner-queue-number` · global
  - `display: grid`
  - `place-items: center`
  - `color: var(--primary)`
  - `font-weight: 950`
- `.scanner-queue-status, .scanner-copy-count` · global
  - `display: inline-flex`
  - `align-items: center`
  - `border-radius: 999px`
  - `white-space: nowrap`
- `.scanner-session-stats > div` · global
  - `display: grid`
  - `min-width: 0`
  - `border: 1px solid var(--border)`
  - `text-align: center`
- `.scanner-session-stats span` · global
  - `overflow: hidden`
  - `font-weight: 800`
  - `text-overflow: ellipsis`
  - `white-space: nowrap`
- `.assistant-choice, .assistant-defect-choice` · global
  - `display: grid`
  - `align-items: center`
  - `border: 1px solid var(--border)`
- `.assistant-result-heading` · global
  - `display: grid`
  - `grid-template-columns: auto minmax(0, 1fr) auto`
  - `align-items: center`
- `.condition-assistant-card` · global
  - `display: grid`
  - `grid-template-rows: auto auto minmax(0, 1fr) auto`
  - `overflow: hidden`
- `.condition-assistant-header` · global
  - `display: flex`
  - `justify-content: space-between`
  - `border-bottom: 1px solid var(--border)`
- `.condition-assistant-step-label` · global
  - `color: var(--primary)`
  - `font-weight: 900`
  - `text-transform: uppercase`
- `.cover-editor-preview img` · global
  - `width: 100%`
  - `height: 100%`
  - `min-height: 104px`
- `.scanner-copy-editor-fields` · global
  - `display: grid`
  - `grid-template-columns: minmax(0, 1fr) auto`
  - `align-items: end`
- `.scanner-mode-button` · global
  - `min-height: 62px`
  - `display: grid`
  - `text-align: left`
- `.scanner-queue-card-heading` · global
  - `display: flex`
  - `align-items: flex-start`
  - `justify-content: space-between`
- `.scanner-source-actions` · global
  - `display: grid`
  - `grid-template-columns: repeat(2, minmax(0, 1fr))`
  - `gap: 8px`
- `.app-page-back` · global
  - `border: 1px solid var(--border)`
  - `background: var(--surface)`
- `.app-page-header` · global
  - `z-index: 1000`
  - `padding: calc(10px + env(safe-area-inset-top)) 14px 10px`
- `.assistant-confidence` · global
  - `border-radius: 999px`
  - `white-space: nowrap`
- `.backup-actions` · global
  - `grid-template-columns: repeat(2, minmax(0, 1fr))`
  - `gap: 8px`
- `.brand-mark.brand-logo` · global
  - `transform: none`
  - `border: 0`
- `.card-menu > summary` · global
  - `width: 38px`
  - `height: 38px`
- `.condition-assistant-actions` · global
  - `display: flex`
  - `border-top: 1px solid var(--border)`
- `.condition-assistant-body` · global
  - `overflow-y: auto`
  - `overscroll-behavior: contain`
- `.scanner-copy-editor-item` · global
  - `display: grid`
  - `border: 1px solid var(--border)`
- `.scanner-frame` · global
  - `position: absolute`
  - `pointer-events: none`
- `.scanner-frame span::after` · global
  - `right: -3px`
  - `bottom: -3px`
- `.scanner-frame span::before` · global
  - `bottom: -3px`
  - `left: -3px`
- `.scanner-frame::after` · global
  - `top: -3px`
  - `right: -3px`
- `.scanner-frame::before` · global
  - `top: -3px`
  - `left: -3px`
- `.scanner-frame::before, .scanner-frame::after, .scanner-frame span::before, .scanner-frame span::after` · global
  - `position: absolute`
  - `content: ""`
- `.scanner-mode-switch` · global
  - `display: grid`
  - `grid-template-columns: repeat(2, minmax(0, 1fr))`
- `.scanner-pro-body` · global
  - `overflow-y: auto`
  - `overscroll-behavior: contain`
- `.scanner-queue-heading-actions` · global
  - `display: flex`
  - `align-items: center`
- `.scanner-queue-identity` · global
  - `min-width: 0`
  - `align-items: center`
- `.scanner-session-stats` · global
  - `display: grid`
  - `grid-template-columns: repeat(4, minmax(0, 1fr))`
- `.scanner-viewport` · global
  - `position: relative`
  - `overflow: hidden`
- `.series-hero` · @media (max-width: 620px)
  - `gap: 13px`
  - `padding: 15px`
- `.assistant-choice-group` · global
  - `display: grid`
- `.assistant-confidence.is-high` · global
  - `color: var(--success)`
- `.assistant-confidence.is-low` · global
  - `color: var(--danger)`
- `.assistant-confidence.is-medium` · global
  - `color: var(--secondary-strong)`
- `.assistant-defect-group` · global
  - `border: 1px solid var(--border)`
- `.assistant-result-card` · global
  - `display: grid`
- `.assistant-result-heading > div` · global
  - `display: grid`
- `.calendar-page-content` · global
  - `display: grid`
- `.card-right-column` · global
  - `align-items: flex-start`
- `.comic-card-cover img` · global
  - `width: 100%`
- `.condition-assistant-progress` · global
  - `height: 5px`
- `.condition-badge-list` · global
  - `gap: 5px`
- `.issue-detail-layout` · @media (max-width: 430px)
  - `gap: 12px`
- `.metadata-controls` · global
  - `align-items: center`
- `.progress-card-stats span` · global
  - `text-align: center`
- `.release-radar-home-date` · global
  - `font-size: 0.72rem`
- `.release-radar-home-side` · global
  - `display: grid`
- `.scanner-camera-placeholder` · global
  - `z-index: 3`
- `.scanner-copy-editor-heading > div` · global
  - `display: grid`
- … 19 weitere Selektorgruppen im vollständigen Lauf.

## Nächster Schritt

Tranche 2B2 kann auf dieser Basis gezielt DOM-Lazy-Mounting für selten genutzte Modals/Unterseiten einführen. Abweichende CSS-Overrides bleiben bis zu einem visuellen, selektorweisen Review unangetastet.
