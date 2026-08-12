# GitHub Pages und Actions für Entenarchiv

Entenarchiv wird über `.github/workflows/deploy-pages.yml` geprüft und über GitHub Pages veröffentlicht.

## Pages-Einstellung

Unter **Settings → Pages → Source** muss ausgewählt sein:

```text
GitHub Actions
```

Es wird keine zusätzliche Jekyll- oder Static-HTML-Vorlage benötigt.

## Normaler Ablauf

Der Deploy-Workflow läuft unter anderem bei Änderungen auf `main` und kann zusätzlich manuell unter **Actions** gestartet werden. Er synchronisiert bei normalen Releases zunächst die offiziellen Kalenderdaten und führt danach den vollständigen `npm run ci`-Pfad aus: Projekt-/Testprüfung, Hardening-Gates, Kalenderprüfung und frischer `dist/`-Build. Nur dieser geprüfte Build wird auf GitHub Pages veröffentlicht.

`dist/` gehört deshalb nicht ins Repository und steht in `.gitignore`.

## Erfolgreiche Veröffentlichung

Im normalen Deploy-Workflow müssen Qualitätsprüfung und GitHub-Pages-Veröffentlichung erfolgreich sein. Nach einem Release sollte die in der App angezeigte Version mit `package.json` und `version.json` übereinstimmen.

## Einmalige Upgrade-Workflows

Größere Datenmigrationen können als einmalige manuell gestartete Workflows ausgeliefert werden. Solche Workflows sollen:

1. den erwarteten Ausgangsstand prüfen,
2. die Migration anwenden,
3. `npm run ci` vollständig ausführen,
4. ohne Force-Push mit dem aktuellen `main` synchronisieren,
5. erneut prüfen,
6. den getesteten Build selbst auf GitHub Pages veröffentlichen,
7. einmalige Installer-/Workflow-Dateien anschließend wieder entfernen.

Damit hängt die Veröffentlichung nicht von einem zweiten Workflow ab, der nach einem `GITHUB_TOKEN`-Commit möglicherweise nicht automatisch ausgelöst wird.

## Hardening-Gates

Seit 4.6.22 enthält `npm run ci` zusätzlich feste Performance-/Architektur-Budgets, einen Dead-Export-Check, einen semantischen Backup-Roundtrip und eine Repo-Hygiene-Prüfung. Eine bewusste Erhöhung eines Budgets muss deshalb als explizite Codeänderung in `quality-budgets.json` sichtbar sein.

Der dauerhafte Branch soll nur `deploy-pages.yml` enthalten. Einmalige Upgrade-Workflows löschen sich vor der finalen CI und dem Release-Commit wieder aus dem Arbeitsstand.
