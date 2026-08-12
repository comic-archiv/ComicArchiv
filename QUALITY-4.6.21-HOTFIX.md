# Entenarchiv 4.6.21 Mobile Density Hotfix

## Ursache

4.6.20 reduzierte zwar Container-Mindesthöhen, zwei Effekte hielten die mobile Oberfläche optisch groß: die volle iOS-Safe-Area plus Zusatzabstand im Header und eine alte direkte Regel `.bottom-nav span { font-size: 1.15rem }`, die die kleineren Item-Schriftgrößen überstimmte.

## Änderung

- Smartphone-Header nutzt die Safe Area um 14 px enger, behält aber einen Mindestabstand.
- Eyebrow wird bis 600 px ausgeblendet; Logo 36 px, Theme-Aktion 38 px.
- Bottom-Nav-Texte erhalten explizit 0.68 rem statt der historischen 1.15 rem.
- Navigationseinträge 42 px, primäre Aktion 46 px, Icons 19/22 px.
- Untere Safe Area wird weiterhin berücksichtigt, aber um 8 px enger genutzt.
- Share-Card-Breitenfix aus 4.6.20 bleibt bestehen.

## Sicherheit

Keine Änderungen an IndexedDB, Data Stack, Featurelogik oder Sammlungsdaten. Neue Regressionstests sichern die direkten Span-Regeln und die mobile Safe-Area-Dichte.
