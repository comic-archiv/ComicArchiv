# Qualitätsbericht Entenarchiv 4.6.22

## Stand

4.6.22 schließt den 4.6-Cleanup-Zyklus ab. Archivgraph und feldgenaue Settings sind die einzigen aktiven persistenten Datenquellen. Sammlung, Fehlbände, Kalender, Scanner und Diagnose sind modularisiert; `app.js` ist auf App-Orchestrierung reduziert. Dieser Release ergänzt feste Regression-Grenzen und macht die erreichte Architektur zu einem prüfbaren CI-Vertrag.

## Release-Gates

Die normale `npm run ci`-Prüfung umfasst jetzt:

1. Projektvalidierung und vollständige Node-Test-Suite,
2. Performance-/Architektur-Budgets,
3. Prüfung auf vollständig unreferenzierte Runtime-Exports,
4. semantischen Backup-Roundtrip,
5. Repo-Hygiene,
6. Kalenderdatenvalidierung,
7. sauberen Produktions-Build.

## Performance- und Architektur-Budgets

Die Grenzwerte stehen in `quality-budgets.json` und müssen bei einer bewussten Architekturentscheidung ausdrücklich geändert werden. 4.6.22 startet mit folgenden Grenzen:

- `app.js`: maximal 215.000 Bytes
- initial aktives DOM: maximal 1.325 Elemente; Inhalte in `<template>` zählen nicht als aktive Startknoten
- Core-Precache: maximal 46 Dateien und 1.200.000 Bytes
- Runtime-CSS: maximal 215.000 Bytes
- Runtime-JavaScript: maximal 950.000 Bytes
- größtes einzelnes Runtime-Modul: maximal 215.000 Bytes

Der Scanner und seine Vendor-Abhängigkeit bleiben außerhalb des Core-Precaches und werden weiterhin erst bei Bedarf geladen.

## Kontrollierte PWA-Updates

Updates ersetzen eine offene App nicht mehr ungefragt. Ein neu installierter Service Worker bleibt bei bestehenden Installationen im `waiting`-Status. Die App zeigt dann einen sichtbaren Hinweis **„Update verfügbar“** mit **„Jetzt aktualisieren“**. Erst diese Aktion sendet `SKIP_WAITING`; nach `controllerchange` wird exakt einmal neu geladen.

Die Erstinstallation darf weiterhin direkt aktiviert werden. Beim Start, beim Zurückkehren in die sichtbare App und nach Wiederherstellung der Netzwerkverbindung wird nach Updates gesucht. `icon-512.png` und `apple-touch-icon.png` gehören nicht mehr zum kritischen Core-Precache.

## Backup-/Restore-Gate

`scripts/check-backup-roundtrip.mjs` erzeugt aus einem repräsentativen Archivgraph mit mehreren Exemplaren, eigener Reihe, Settings und Metadaten ein aktuelles JSON-Backup. Dieses wird durch denselben Importvalidator gelesen, wieder in die Archive-Runtime überführt und erneut exportiert. IDs, Copy-Zustände, Custom-Series-Konfiguration, Settings und Metadaten müssen semantisch erhalten bleiben.

Der Test ersetzt kein externes Nutzerbackup, schützt aber den vollständigen Format-/Adapterpfad automatisch vor Regressionen.

## Dead Code und Legacy

4.6.22 entfernt vollständig unreferenzierte Runtime-Exports. `scripts/check-dead-exports.mjs` verhindert neue Symbole, die weder Runtime, Tests, Scripts noch Browser-Migrationstest verwenden.

Bewusst verbleibende historische Adapter sind in `LEGACY-COMPATIBILITY.md` inventarisiert. Die leeren IndexedDB-Stores `comics` und `settings` bleiben bis zu einem ohnehin notwendigen Schema-Upgrade erhalten; sie sind keine aktiven Datenquellen.

## Repo-Hygiene

Im dauerhaften Repository bleibt nur `.github/workflows/deploy-pages.yml`. Einmalige Upgrade-Installer, temporäre Workflows, alte `QUALITY-4.x`-Zwischenberichte und lokale Exportartefakte dürfen die Hygiene-Prüfung nicht passieren. `dist/` wird ausschließlich beim Build erzeugt.

## Datenmodell

- App-Version: 4.6.22
- Datenformat: 9
- Archivmodell: 1
- Data Stack: 2
- IndexedDB-Schema: 6
- aktive Sammlung: `seriesCatalog` + `issues` + `copies`
- aktive Settings: feldgenaue Datensätze in sechs Fach-Stores
- Legacy-`comics`/Mega-`settings`: leere Upgrade-Hüllen und historische Adapter

## Nächster Entwicklungsschritt

Weitere Refactorings sind kein Selbstzweck mehr. Ab 4.7 können neue Smart-Archiv-Funktionen auf der bereinigten Architektur entstehen. Die Budgets und Release-Gates sollen verhindern, dass neue Features unbemerkt wieder Monolithen, große Start-DOMs oder doppelte Persistenzpfade erzeugen.
