# Entenarchiv 4.6.20 UI Hotfix

## Änderungen

- Globaler App-Header: sichtbare Chrome-Höhe von rund 76 px auf 58 px reduziert; iOS-Safe-Area bleibt vollständig erhalten.
- Unterseiten-Header: gleiche kompakte Höhenlogik mit 42-px-Zurück-Button.
- Bottom-Navigation: sichtbare Höhe um rund 20 px reduziert; Navigationsziele bleiben mindestens 48 px hoch.
- Primäre Hinzufügen-Aktion: von 68 px auf 54 px reduziert.
- Share-Card-Dialog: mobile Breite wird mit `width: 100%`, `max-width` und `min-width: 0` Safari-sicher begrenzt.
- Canvas, Select, Überschrift und Aktionsbereich können die Modalbreite nicht mehr durch intrinsische Mindestbreiten aufweiten.

## Sicherheit

- Keine Änderung an IndexedDB, Data Stack, Sammlung oder Medien.
- Keine Änderung an Feature-Modulen oder Runtime-State.
- Service-Worker-Version wird auf 4.6.20 angehoben, damit der CSS-Hotfix zuverlässig geladen wird.
- Neue Regressionstests prüfen kompakte Chrome-Höhen und die Share-Card-Breitenbegrenzung.
