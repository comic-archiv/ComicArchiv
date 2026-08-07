# Einmalige Einrichtung der geprüften GitHub-Pages-Veröffentlichung

Die App funktioniert weiterhin auch mit der bisherigen Pages-Einstellung `Deploy from a branch`. Für die sicherere Veröffentlichung sollte GitHub Pages einmalig auf `GitHub Actions` umgestellt werden.

## Vor dem Upload

1. In Entenarchiv ein aktuelles JSON-Backup erstellen.
2. Bei eigenen Coverbildern zusätzlich ein Medien-Backup erstellen.
3. Das Update-ZIP entpacken.
4. Im Finder mit `Cmd + Shift + .` versteckte Dateien einblenden. Dadurch wird der Ordner `.github` sichtbar.

## GitHub Pages umstellen

1. Das Repository `Entenarchiv` beziehungsweise `ComicArchiv` auf GitHub öffnen.
2. `Settings` öffnen.
3. Links `Pages` auswählen.
4. Unter `Build and deployment` bei `Source` den Eintrag `GitHub Actions` wählen.

Die bisher veröffentlichte Seite bleibt normalerweise erreichbar, bis der neue Workflow eine geprüfte Version bereitstellt.

## Update hochladen

1. Im Repository `Add file → Upload files` wählen.
2. Den vollständigen Inhalt des entpackten Ordners hochladen.
3. Darauf achten, dass auch `.github/workflows/deploy-pages.yml`, `scripts`, `tests`, `package.json` und `version.json` enthalten sind.
4. Mit `Entenarchiv Version 3.9.0` committen.
5. Den Reiter `Actions` öffnen.
6. Der Lauf `Entenarchiv prüfen und veröffentlichen` muss vollständig grün werden.

Erst nach erfolgreicher Qualitätsprüfung wird das Produktionspaket veröffentlicht.

## Falls der Workflow nicht startet

- Prüfen, ob der Ordner `.github/workflows` wirklich im Repository vorhanden ist.
- Unter `Actions` kann der Workflow zusätzlich über `Run workflow` manuell gestartet werden.
- Die App kann notfalls weiterhin über die bisherige Branch-Veröffentlichung betrieben werden; die Sicherheitsfunktionen in Version 3.9.0 sind davon unabhängig.
