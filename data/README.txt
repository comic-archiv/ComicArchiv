ENTENARCHIV – NEUEN LTB-JAHRESPLAN ERGÄNZEN
============================================

Die GitHub-Pages-Adresse und die installierte App bleiben unverändert.
Für ein neues Jahr werden nur zwei Dateien im Ordner data angepasst.

Beispiel für 2027:

1. Die offizielle iCal-Datei des Verlags herunterladen.
2. Die Datei in ltb-2027.ics umbenennen.
3. ltb-2027.ics in diesen Ordner data hochladen.
4. data/kalender-index.json öffnen.
5. Im Array "calendars" einen weiteren Eintrag ergänzen:

{
  "id": "ltb-2027-v1",
  "year": 2027,
  "label": "LTB Jahresplan 2027",
  "file": "data/ltb-2027.ics",
  "sourceUrl": "HIER_DIE_OFFIZIELLE_VERLAGSADRESSE_EINTRAGEN",
  "publisher": "Egmont Ehapa Media",
  "version": "v1",
  "active": true,
  "notes": "Offizieller Jahresplan 2027"
}

6. Das Feld "updatedAt" auf das aktuelle Datum setzen.
7. Änderungen committen und die GitHub-Pages-Veröffentlichung abwarten.
8. In Entenarchiv Kalender > Jahrespläne verwalten > Jahre prüfen öffnen.

Bei aktivierter automatischer Aktualisierung lädt Entenarchiv das aktuelle
und das folgende Jahr selbstständig. Wird später eine korrigierte Datei
veröffentlicht, ersetze die .ics-Datei und erhöhe im Index "version",
z. B. von "v1" auf "v2". Beim nächsten Prüfen werden die Verlagstermine
dieses Jahres aktualisiert, ohne eigene Flohmärkte zu löschen.
