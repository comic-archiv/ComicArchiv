# Entenarchiv DOM Lazy-Mount Report

Stand: 4.5.3 · Tranche 2B2.

## Umgestellt

Vier selten genutzte Bereiche werden nicht mehr als aktive DOM-Teilbäume beim App-Start aufgebaut, sondern liegen bis zur ersten Nutzung in `<template>`-Elementen:

- Zustandsassistent: 64 Elemente
- Backup-Import: 30 Elemente
- Diagnose & Sicherheit: 23 Elemente
- Share Cards: 22 Elemente

Zusammen enthielten diese Bereiche zuvor **139 aktive DOM-Elemente**. Nach der Umstellung existieren initial nur noch vier leichte Template-Knoten; deren Inhalte liegen inert in `DocumentFragment`s. Das reduziert den initial aktiven DOM-Baum netto um ungefähr **135 Elemente**.

## Verhalten

- Ein Bereich wird beim ersten Öffnen genau einmal in `document.body` gemountet.
- Event-Listener werden erst beim Mounten dieses Bereichs gebunden.
- Nach dem Schließen bleibt der bereits gemountete Bereich bestehen; wiederholtes Öffnen erzeugt keine Duplikate.
- Der Zustandsassistent erzeugt seine dynamischen Auswahloptionen ebenfalls erst beim ersten Öffnen.
- Escape-Handling und Body-Modalstatus akzeptieren nicht gemountete Bereiche.
- Scanner, Kalender, Sammlung, Storage und Datenbankschema bleiben unverändert.

## Dateien

- `index.html`
- `app.js`
- `lazy-dom.js` (neu)
- `service-worker.js`
- `scripts/build-static.mjs`
- `tests/lazy-dom.test.mjs` (neu)

## Prüfung

Vor dem Umbau lief `npm run ci` auf dem vom Nutzer gelieferten 4.5.3-Stand vollständig grün (136/136 Tests). Nach dem Umbau muss derselbe vollständige CI-Pfad inklusive neuer Lazy-DOM-Regressionstests erneut grün sein. Der finale Stand besteht 141/141 Tests, Kalenderprüfung und Produktions-Build.
