# BetterWebUntis

Eine schnellere, moderne Web-Oberfläche für WebUntis — für Schüler-Konten. Echtes
Zeitraster statt Karten-Liste, frei wählbare Fachfarben, Dark Mode, ICS-Export für
Prüfungen und ein paar Detailinfos, die die offizielle Oberfläche nicht so übersichtlich
zeigt.

> **Kein offizielles WebUntis-/Untis-GmbH-Produkt.** Ein privates Open-Source-Projekt, das
> gegen die WebUntis-API läuft — Details und Einschränkungen weiter unten.

## Features

- **Stundenplan als echtes Zeitraster** — Wochen- oder Tagesansicht, Stunden nach
  Uhrzeit/Dauer positioniert statt einer losen Liste; Doppelstunden werden automatisch
  zusammengefasst
- **Vertretungen, Entfall und Raumänderungen** sofort farblich erkennbar, direkt im Plan
- **Fach-Karten in Farbe** — von der Schule vorgegeben oder frei wählbar (18 Töne + freie
  Farbwahl), pro Gerät gespeichert, mit automatisch berechnetem Kontrast für Hell **und**
  Dunkel
- **Zusatzinfo-Badge:** ein kleines Icon zeigt direkt auf der Karte, wenn eine Lehrkraft
  einen Hinweis zur Stunde hinterlegt hat (z. B. "Test"/"MÜ") — Klick zeigt den Volltext
- **Lehrstoff** je Stunde, wo von der Lehrkraft eingetragen
- **Anderen Stundenplan ansehen** (z. B. eine andere Klasse)
- **Abwesenheiten**-Übersicht mit Status (entschuldigt/unentschuldigt), Datum, Dauer
- **Prüfungen**-Übersicht — ein Klick springt im Stundenplan direkt zur passenden Woche
  und hebt die Stunde kurz hervor
- **ICS-Export der Prüfungen** — eine Datei, in jeden Kalender importierbar (Google,
  Apple, Outlook, …)
- **Dark/Light Design**, folgt automatisch dem System oder manuell umschaltbar
- **Keine eigene Nutzerverwaltung:** Login läuft direkt gegen WebUntis, die Sitzung lebt
  nur im Speicher des Browsers — ein Reload meldet ab, nichts wird auf einem eigenen
  Server gespeichert oder mitgeloggt

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer (bringt `npm` mit).

```bash
git clone https://github.com/Emanschi/BetterWebUntis.git
cd BetterWebUntis
npm install
```

`.env` aus der Vorlage anlegen und auf die **eigene Schule** einstellen:

```bash
cp .env.example .env
```

```dotenv
VITE_WEBUNTIS_SERVER=https://<eure-schule>.webuntis.com
VITE_WEBUNTIS_SCHOOL=<schulname-wie-im-webuntis-login>
```

Dann starten:

```bash
npm run dev
```

Öffnet auf `http://localhost:5173` — dort mit dem eigenen WebUntis-Konto anmelden.
Zugangsdaten verlassen dabei nie den eigenen Rechner: die Web-Version läuft komplett im
Browser, `vite` übernimmt im Hintergrund nur die Proxy-Weiterleitung an WebUntis (nötig,
weil WebUntis Browsern keine direkten Cross-Origin-Logins erlaubt).

**Ohne eigenes WebUntis-Konto zum Ausprobieren:** ein eingebauter Mock-Server simuliert
eine Fake-Schule mit Testdaten.

```bash
npm run mock          # eigenes Terminal, läuft auf Port 4001
VITE_WEBUNTIS_SERVER=http://localhost:4001 npm run dev   # zweites Terminal
```

Login dann mit `mmuster` / `test1234` (Schüler) oder `aschmidt` / `test1234` (Lehrkraft).

## Bekannte Einschränkungen

- Aktuell ausschließlich für **Schüler-Konten** gebaut und getestet.
- Ein Teil der Funktionen (Prüfungen, Abwesenheiten, Lehrstoff/Zusatzinfo) nutzt
  Endpunkte, die aus der originalen WebUntis-Oberfläche abgeschaut wurden, nicht aus
  einer offiziellen Dokumentation — sie können sich jederzeit ohne Vorwarnung ändern und
  wurden bisher nur gegen eine einzelne Schule gemessen. Funktioniert eure Schule anders,
  bitte als Issue melden.
- Mitteilungen sowie Passwort/Kontaktdaten ändern: von der WebUntis-API nicht abgedeckt,
  deshalb nicht Teil der App.
- Android/iOS (über [Capacitor](https://capacitorjs.com)) sind architektonisch
  vorbereitet, aber noch nicht gebaut — bisher reine Web-App.

## Entwicklung

```bash
npm test           # Unit-Tests (Vitest)
npm run typecheck  # TypeScript im strict-Modus
npm run build      # Produktions-Build
```

## Eigenes Hosting

Die Web-App lässt sich auf jedem Apache+PHP-Webspace (z. B. World4You) hosten — Anleitung
und der dafür nötige kleine Proxy liegen in [deploy/](deploy/README.md).

Der komplette Entwicklungsstand, alle Architekturentscheidungen und Messungen gegen den
echten Server stehen in drei laufend gepflegten Dokumenten:

- [PLAN.md](PLAN.md) — Architektur, Meilensteine, Risiken
- [IDEEN.md](IDEEN.md) — offene Fragen, Entscheidungen, Backlog
- [TESTING.md](TESTING.md) — was gegen echte Daten verifiziert ist, was noch aussteht

## Lizenz

[GPL-3.0](LICENSE).
