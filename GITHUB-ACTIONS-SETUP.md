# GitHub Pages und automatische Jahrespläne in Entenarchiv 4.3

Entenarchiv wird weiterhin über den benutzerdefinierten GitHub-Actions-Workflow geprüft und veröffentlicht.

## Pages-Einstellung

Unter **Settings → Pages → Source** bleibt ausgewählt:

```text
GitHub Actions
```

Die vorgeschlagenen Vorlagen **GitHub Pages Jekyll** und **Static HTML** werden nicht zusätzlich konfiguriert.

## Workflow-Datei einmalig aktualisieren

Version 4.3 erweitert den bestehenden Workflow um die automatische Suche nach offiziellen LTB-Jahresplänen. Die Datei liegt unter:

```text
.github/workflows/deploy-pages.yml
```

Da der versteckte Ordner `.github` im Browser-Upload häufig nicht sauber ersetzt wird:

1. Im Repository `.github/workflows/deploy-pages.yml` öffnen.
2. Das Stift-Symbol anklicken.
3. Den gesamten Inhalt durch `deploy-pages-4.3.yml` ersetzen.
4. Direkt nach `main` committen.

## Ausführung

Der Workflow startet:

- bei jedem Commit auf `main`,
- bei Pull Requests zur Qualitätsprüfung,
- manuell über **Run workflow**,
- automatisch montags um 04:17 Uhr UTC.

Er führt aus:

1. Projekt laden,
2. Node.js bereitstellen,
3. offizielle LTB-iCal-Dateien suchen und validieren,
4. `npm run check`,
5. `npm run build`,
6. `dist/` als Pages-Artefakt hochladen,
7. GitHub Pages veröffentlichen.

Kann der externe Downloadbereich vorübergehend nicht erreicht werden, verwendet die Synchronisierung den vorhandenen Stand und der Workflow setzt die Qualitätsprüfung fort.

## Woran eine erfolgreiche Veröffentlichung erkennbar ist

Im Workflow müssen beide Jobs grün sein:

```text
Qualitätsprüfung
GitHub Pages veröffentlichen
```

Die GitHub-Pages-Adresse, das Home-Screen-Symbol und die lokale IndexedDB bleiben unverändert.
