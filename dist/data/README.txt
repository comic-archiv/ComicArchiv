ENTENARCHIV – LTB-JAHRESPLÄNE
============================

Ab Version 4.3 versucht der GitHub-Actions-Workflow einmal pro Woche, neue
oder korrigierte iCal-Jahrespläne automatisch im offiziellen LTB-
Downloadbereich zu finden.

AUTOMATISCHER ABLAUF
--------------------

1. scripts/sync-release-calendars.mjs liest die offizielle Downloadseite.
2. Akzeptiert werden nur HTTPS-iCal-Dateien von lustiges-taschenbuch.de.
3. iCal-Struktur und Kalenderjahr werden validiert.
4. Bei mehreren Fassungen eines Jahres gewinnt die höchste v-Version.
5. Die Datei wird als data/ltb-JAHR.ics im veröffentlichten Pages-Paket
   bereitgestellt.
6. data/kalender-index.json wird für Entenarchiv ergänzt.

Die GitHub-Pages-Adresse und die installierte App ändern sich dadurch nicht.
Ein vorübergehender Netzwerkfehler lässt den bisherigen Kalenderstand
unverändert.

MANUELLER FALLBACK
------------------

Sollte die automatische Erkennung einen ungewöhnlich benannten Jahresplan
nicht finden, kann weiterhin manuell ergänzt werden.

Beispiel 2027:

1. Offizielle iCal-Datei als data/ltb-2027.ics hochladen.
2. In data/kalender-index.json im Array "calendars" ergänzen:

{
  "id": "ltb-2027-v1",
  "year": 2027,
  "label": "LTB Jahresplan 2027",
  "file": "data/ltb-2027.ics",
  "sourceUrl": "OFFIZIELLE_VERLAGSADRESSE",
  "publisher": "Egmont Ehapa Media",
  "version": "v1",
  "active": true,
  "notes": "Offizieller Jahresplan 2027"
}

3. updatedAt aktualisieren und committen.
4. In Entenarchiv Kalender > Jahrespläne verwalten > Jahre prüfen öffnen.
