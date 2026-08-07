# GitHub Pages mit Entenarchiv 4

Entenarchiv wird über den vorhandenen benutzerdefinierten GitHub-Actions-Workflow geprüft und veröffentlicht.

## Keine erneute Pages-Umstellung erforderlich

Wenn unter **Settings → Pages → Source** bereits **GitHub Actions** ausgewählt ist und Version 3.9 erfolgreich veröffentlicht wurde, muss dort für Version 4 nichts geändert werden.

Die beiden vorgeschlagenen Vorlagen **GitHub Pages Jekyll** und **Static HTML** dürfen nicht zusätzlich konfiguriert werden.

## Vorhandene Workflow-Datei

```text
.github/workflows/deploy-pages.yml
```

Der Workflow führt bei jedem Commit auf `main` aus:

1. Projekt laden,
2. Node.js bereitstellen,
3. `npm run check`,
4. `npm run build`,
5. das geprüfte Verzeichnis `dist/` als Pages-Artefakt hochladen,
6. GitHub Pages veröffentlichen.

## Weitere Entenarchiv-Updates

1. JSON-Backup erstellen.
2. Bei eigenen Coverbildern zusätzlich ein Medien-Backup erstellen.
3. ZIP entpacken.
4. Den vollständigen sichtbaren Projektinhalt in das bestehende Repository hochladen.
5. Vorhandene Dateien ersetzen.
6. Darauf achten, dass insbesondere `archive-model.js`, `scripts`, `tests`, `package.json` und `version.json` vorhanden sind.
7. Mit beispielsweise `Entenarchiv Version 4.2.0` committen.
8. Unter **Actions** den Lauf **Entenarchiv prüfen und veröffentlichen** öffnen.
9. Erst nach einem vollständig grünen Workflow die App auf dem iPhone neu öffnen.

Der versteckte Ordner `.github` muss nicht erneut hochgeladen werden, wenn der Workflow bereits aus Version 3.9 im Repository vorhanden ist. Die neue ZIP enthält ihn trotzdem vollständig für neue Installationen oder eine spätere Wiederherstellung.

## Woran eine erfolgreiche Veröffentlichung erkennbar ist

Im Workflow müssen beide Jobs grün sein:

```text
Qualitätsprüfung
GitHub Pages veröffentlichen
```

Erst danach wird die neue Version über die bestehende GitHub-Pages-Adresse ausgeliefert.
