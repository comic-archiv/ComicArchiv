# Entenarchiv 4.3.0 – CI- und Kalender-Hotfix

Dieser Hotfix verändert die veröffentlichte App nicht. Er stabilisiert ausschließlich die GitHub-Actions-Prüfung:

- deterministische Tests laufen vor dem Live-Abruf externer Kalenderdaten,
- synchronisierte iCal-Dateien werden danach separat validiert,
- der Kalender-Test erwartet keine dauerhaft festgeschriebene Zahl von Verlagsterminen mehr,
- Node-24-kompatible GitHub-Actions-Versionen bleiben aktiv.

Die App-Version bleibt `4.3.0`.
