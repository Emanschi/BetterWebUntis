# TESTING.md

Was ist wogegen getestet? Was steht noch aus?

---

## 1. Server-Check (Auftrag Abschnitt 0) — ✅ erledigt, 2026-09-10

**Ziel:** Unterstützt der WebUntis-Server der HTBLuVA St. Pölten die JSON-RPC-Schnittstelle von 2018 überhaupt noch?

- Server: `htlstp.webuntis.com`
- Schule: `htlstp`
- Endpunkt: `https://htlstp.webuntis.com/WebUntis/jsonrpc.do?school=htlstp`
- Methode: Dummy-Login mit einem nicht existierenden Benutzernamen (keine echten Zugangsdaten nötig)

| Test | Ergebnis |
|---|---|
| `authenticate` mit Dummy-Zugangsdaten | HTTP 200, `{"error":{"message":"bad credentials","code":-8504}}` |
| `getStatusData` ohne Session | HTTP 200, `{"error":{"message":"not authenticated","code":-8520}}` |
| Content-Type der Antwort | `application/json-rpc;charset=UTF-8` |
| Antwortzeit | ~0,8 s |
| Tenant-Id (aus Cookie) | `7053500` |
| `schoolname`-Cookie | `_aHRsc3Rw` = base64(`htlstp`) — bestätigt den Schulnamen |

**Fazit: Die JSON-RPC-API von 2018 ist an dieser Schule aktiv und verhält sich wie dokumentiert.**
`-8504` statt `404`/`405` beweist, dass die Methode `authenticate` existiert, geroutet wird und den `?school=`-Parameter akzeptiert. `-8520` beweist, dass auch andere Methoden geroutet werden und die Session-Prüfung greift. Es ist kein neuerer Auth-Flow erzwungen.

**Noch offen (braucht echte Zugangsdaten):** ob das Konto zusätzlich 2FA/App-Secret verlangt und welche Rechte es hat (siehe Abschnitt 3).

### Nebenbefund: CORS

| Header | Wert |
|---|---|
| `access-control-allow-origin` | spiegelt die Request-Origin (getestet mit `http://localhost:5173`) |
| `access-control-allow-methods` | `GET, POST, OPTIONS, DELETE, PUT, PATCH` |
| `access-control-allow-headers` | `Accept, Origin, X-Requested-With, Content-Type, …` |
| `access-control-allow-credentials` | **fehlt** |
| Session-Cookie | `JSESSIONID=…; Path=/WebUntis; Secure; HttpOnly; SameSite=None` |

Der Preflight geht durch, aber `Access-Control-Allow-Credentials` fehlt. Damit blockiert der Browser jeden Request mit `credentials: "include"` — und genau der wäre nötig, um das `JSESSIONID`-Cookie mitzuschicken. Das Cookie ist zusätzlich `HttpOnly`, JavaScript kann es also weder lesen noch von Hand setzen (`Cookie` ist ein Forbidden Header).

**Konsequenz: Die reine Browser-Version kann WebUntis nicht direkt aufrufen. Ein Proxy ist zwingend** (Dev: Vite-Proxy, Produktion: World4you). Android/iOS sind nicht betroffen, weil `CapacitorHttp` nativ requestet und keiner Browser-Policy unterliegt.

---

## 2. Nur gegen Mock-Daten getestet

**Stand nach der Kalender-Nachbesserung (Zeitachse, realistische Prüfungstermine, Theme-Toggle): 207 Tests, alle grün.** `npm test`

| Bereich | Tests | Grundlage |
|---|---|---|
| `format.ts` — YYYYMMDD, HHMM, RRGGBB, Timegrid-Tage | 23 | Werte aus den Doku-Beispielen |
| `client.ts` — Umschlag, `?school=`, Cookies, Fehler-Mapping, Warteschlange | 24 | Doku Abschnitt 1 + echte Server-Header |
| `methods.ts` — alle 23 dokumentierten Methoden | 40 | Beispiel-Responses der Doku |
| `errors.ts` — Codes, Prädikate, deutsche Meldungen | 12 | gemessene Codes + JSON-RPC-2.0-Spec |
| `mock/` Format-Compliance — Fake-Daten entsprechen der Doku | 15 | dieselben Validatoren wie für echte Antworten |
| `mock/` RPC-Handler — Session, Rechte, Randfälle | 14 | Doku + PLAN.md R4 |
| `mock/` Integration — echter `WebUntisClient` gegen MSW | 7 | derselbe Code-Pfad wie im Dev-Server |

Die Fixtures liegen in `src/api/__tests__/fixtures/` und sind wörtlich aus der Doku
übernommen. Welche Satzfehler der Doku dabei korrigiert wurden und welche inhaltliche
Abweichung eine Entscheidung erforderte, steht in `src/api/__tests__/fixtures/README.md`.

### Mock-Server (M3)

Eine vollständige Fake-Schule ("Mock-HTL", Klasse 3AHIF) mit zwei Test-Logins:

| Login | Passwort | Rolle | Fehlende Rechte (Simulation von PLAN.md R4) |
|---|---|---|---|
| `mmuster` | `test1234` | Schüler (Max Muster) | `getStudents`, `getTimetableWithAbsences`, `getClassregEvents`, `getClassregCategories`, `getClassregCategoryGroups` |
| `aschmidt` | `test1234` | Lehrerin (Anna Schmidt) | keine |

Der generierte Stundenplan deckt alle geforderten Randfälle ab, deterministisch über den
Wochentag definiert (funktioniert für jeden angefragten Zeitraum gleich):

- **Entfall** — Mittwoch, 1. Stunde (`code: "cancelled"`)
- **Vertretung** — Montag, 6./7. Stunde (`code: "irregular"`, Lehrerwechsel, `orgid` in `getSubstitutions`)
- **Raumänderung** — Freitag, 3. Stunde (`code: "irregular"`, Raumwechsel, `orgid` in `getSubstitutions`)
- **Doppelstunde** — Montag 1./2. sowie Donnerstag 6./7. Stunde
- **Schularbeit/Prüfung** — Donnerstag, 3. Stunde (`lstype: "ex"` + passender `getExams`-Eintrag)
- **Sprechstunde** — Lehrer-Ansicht, Dienstag (`lstype: "oh"`, ohne Klassenbezug — Annäherung an "Meine Termine", siehe IDEEN.md A4)
- **Bereitschaft** — Lehrer-Ansicht, Freitag (`lstype: "sb"`)
- **Ferientag** — an den Terminen aus `getHolidays` werden keine Perioden erzeugt

Zwei Transporte, eine Fachlogik (`src/mock/rpcHandler.ts`):

- `npm run mock` — eigenständiger Node-HTTP-Server unter `/WebUntis/jsonrpc.do` zum manuellen
  Testen der App ohne echten Server oder Proxy (sendet großzügigere CORS-Header als der echte
  Server, um lokal ohne Proxy entwickeln zu können — siehe Warnhinweis in `src/mock/server.ts`)
- `src/mock/msw/` — MSW-Handler für automatisierte Tests, fangen echten `fetch` ab

**Simplifikation, bewusst nicht nachgebildet:** `getSubstitutions`-Typ `"shift"` (verschobene
Stunde) hat keinen generierten Testfall — die drei geforderten Kernfälle (Entfall, Vertretung,
Raumänderung) genügten für den Umfang von M3. Bei Bedarf leicht ergänzbar in `timetable.ts`.

### M4 — App-Shell, Theme, Session-Store, Login (+15 Tests)

| Bereich | Tests | Grundlage |
|---|---|---|
| `themeStore` | 4 | Zustandslogik, defensiv gegen fehlendes `document`/`localStorage` |
| `sessionStore` | 5 | echter Login-Flow gegen MSW (`mmuster`/`test1234` aus M3) |
| `LoginScreen` (Komponente) | 3 | React Testing Library + MSW, echter Submit-Flow |
| `App` (Smoke-Test) | 3 | Login → Weiterleitung → Navigation → Logout, Ende-zu-Ende durch die UI |

**Sicherheitsentscheidung:** Die Session lebt nur im Speicher (kein `sessionId` in
localStorage/sessionStorage) — ein Reload meldet ab. Das ist die sicherste
Grundeinstellung gemäß Projektauftrag ("nicht im Klartext persistieren, wo
vermeidbar"). Nur der Schulname wird gemerkt (kein Geheimnis). Siehe
`src/state/sessionStore.ts`.

**Manuell im Browser verifiziert** (Mock-Server + Dev-Server, Screenshots im
Session-Verlauf): Login, Theme-Umschaltung Dark→Light, Profilseite mit korrekten
Session-Daten, Logout — alles wie erwartet.

### M5 — Stundenplan-Ansicht (+20 Tests; Zeitraster kam später in einer Nachbesserung dazu, siehe unten)

| Bereich | Tests | Grundlage |
|---|---|---|
| `domain/colors.ts` | 5 | API-Farben bevorzugt, deterministischer Fallback |
| `domain/timetable.ts` | 15 | Wochenraster, Substitutions-Merge, Doppelstunden-Erkennung |

**Echter Bug gefunden und behoben beim manuellen Test im Browser (nicht von den
automatisierten Tests erfasst):** Der Mock-Server setzte das Session-Cookie mit
`Path=/WebUntis`. Der Vite-Dev-Proxy ruft `/webuntis` (klein) auf und schreibt das erst
serverseitig auf `/WebUntis` um — der Browser selbst sieht nie den umgeschriebenen Pfad.
Damit passte das Cookie-Path-Attribut nie zu dem, was der Browser tatsächlich anfragt
(Pfad-Matching ist case-sensitiv), und die Session ging nach dem Login sofort wieder
verloren. Die automatisierten MSW-Tests haben das nicht bemerkt, weil `FetchTransport`
dort selbst Cookies verwaltet statt sich auf die Browser-Cookie-Jar zu verlassen — der
Unterschied zwischen "Test simuliert den Netzwerk-Layer" und "echter Browser mit echtem
Proxy" wurde hier sichtbar. Fix: Cookie-Path auf `/` gesetzt (`src/mock/server.ts`,
`src/mock/msw/handlers.ts`). **Lehre für M11 (echter Proxy):** dort denselben Path-Bezug
zwischen Proxy-Pfad und Cookie-Attribut vorab prüfen.

**Bewusste Heuristik, keine Doku-Vorgabe:** Zwei Perioden gelten als "Doppelstunde" (werden
optisch zu einem Block zusammengefasst), wenn zwischen ihnen höchstens 15 Minuten liegen
UND Fach/Lehrer/Raum/Code identisch sind. Die Doku kennt den Begriff "Doppelstunde" nicht;
selbst echte Doppelstunden haben im Timegrid meist die normale kurze Pause dazwischen
(nie exakt 0 Minuten). 15 Minuten deckt kurze Pausen ab, bleibt aber unter einer
Mittagspause. Schwellenwert dokumentiert in `domain/timetable.ts`, beim Smoke-Test gegen
den echten Server zu beobachten, ob die reale Schule andere Pausenlängen hat.

**Manuell im Browser verifiziert** (Mock-Server + Dev-Server, Light/Dark, Desktop/Mobile):
Wochenansicht mit allen sechs Randfällen korrekt dargestellt (Entfall durchgestrichen,
Vertretung/Raumänderung mit ⚠-Hinweis und Farbe, Doppelstunden als ein Block, Prüfungs-Badge),
responsive Umbruch auf Mobile (eine Spalte), Wochennavigation.

### M6 — Elementwechsel: Klasse/Lehrer/Fach/Raum (+8 Tests)

| Bereich | Tests | Grundlage |
|---|---|---|
| `elementRoutes.ts` | 5 | Segment ↔ ElementType Mapping, Rundreise |
| `ElementPicker` (Integration) | 3 | echter Wechsel-Flow durch die UI gegen MSW |

Neue URL-Struktur `/timetable/:segment/:id` (z. B. `/timetable/klasse/102`,
`/timetable/lehrer/11`) — `TimetableScreen` bleibt dabei unverändert prop-getrieben
(`element`-Prop), nur `TimetableRouteScreen` bindet die URL an.

**Manuell im Browser verifiziert:** Picker öffnet mit Klassen-Tab (3AHIF/2BHIF aus
schoolData.ts), Tab-Wechsel zu Lehrer zeigt alle sechs Lehrer, Filter funktioniert,
Auswahl navigiert korrekt und aktualisiert Titel + "← Mein Plan"-Link. Anna Schmidts
Lehrer-Stundenplan zeigt korrekt ihre SEW-Stunden **und** ihre Sprechstunde
(lstype "oh") mit Badge — bestätigt, dass die Teilfunktion aus IDEEN.md A4 technisch
trägt.

### M7 — Abwesenheiten, Prüfungen, Meine Termine (+8 Tests)

| Bereich | Tests | Grundlage |
|---|---|---|
| `domain/timetable.ts` — `appointmentPeriods` | 3 | Filter auf lstype oh/sb/bs, Sortierung |
| Screen-Integration (AbsencesScreen/ExamsScreen/AppointmentsScreen) | 5 | echte Anfragen gegen MSW, beide Konten |

**Echter Bug gefunden und behoben (kein reines Test-Problem):** Der App-weite
`QueryClient` hatte `retry: 1` ohne Rücksicht auf die Fehlerart. Bei einem
Rechte-Fehler (z. B. Schüler-Konto ruft `getTimetableWithAbsences` auf) wartete
React Query vor der Fehleranzeige erst den vollen Retry mit Backoff-Delay ab (~1s) —
und wiederholte dabei eine Anfrage, die garantiert wieder denselben Fehler liefert.
Sichtbar wurde das zuerst als hängender Test (Spinner blieb sichtbar), tatsächlich
betraf es aber jeden Nutzer mit fehlenden Rechten: unnötige Verzögerung vor einer
Fehlermeldung, die sich durch Wiederholen nie ändert. Fix in `src/ui/App.tsx`:
`retry` prüft jetzt `isMissingRight`/`isNotAuthenticated`/`isBadCredentials` aus
`api/errors.ts` und verzichtet für diese Fälle ganz auf einen Retry.

**Manuell im Browser verifiziert** (Lehrer-Konto `aschmidt`, breite Rechte):
Abwesenheiten mit kontrolliert/nicht-kontrolliert-Badges, Prüfungen mit aufgelöstem
Fachnamen über mehrere Monate, Sprechstunden korrekt in "Meine Termine". Schüler-Konto
`mmuster` zeigt bei Abwesenheiten korrekt die Rechte-Fehlermeldung statt eines Absturzes.

### M8 — ICS-Export der Prüfungen (+13 Tests)

| Bereich | Tests | Grundlage |
|---|---|---|
| `domain/ics.ts` | 12 | RFC 5545 (VCALENDAR-Rahmen, Escaping, Zeilenfaltung) |
| Export-Button (Integration) | 1 | echter Blob-Download-Mechanismus, MIME-Type, Inhalt |

**Eigener Bug beim Schreiben gefunden (nicht erst beim Testen):** `'\;'` als
JavaScript-String-Literal ergibt `';'`, nicht `'\;'` — der Backslash vor einem
Zeichen ohne definierte Escape-Bedeutung wird von JS stillschweigend verschluckt.
Die erste Fassung von `escapeText()` hat Semikolons deshalb gar nicht escaped.
Beim ersten Testlauf hat sich derselbe Fehler in der Test-Assertion wiederholt
(`'\;'` in der Erwartung war ebenso wirkungslos) — erst der Blick auf die
tatsächliche Ausgabe (`Fach\; mit...`, korrekt) hat gezeigt, dass die Assertion
falsch war, nicht der Code. Fix: `'\\;'` in Code und Test.

**Zeitzone (bewusste Entscheidung, keine Doku-Vorgabe):** Die API liefert keine
Zeitzoneninformation. `DTSTART`/`DTEND` werden deshalb als "floating time" ohne
`Z`-Suffix und ohne `TZID` geschrieben — Kalenderprogramme interpretieren das als
Lokalzeit des Geräts, was für eine App mit genau einer österreichischen Schule die
richtige Annahme ist. `DTSTAMP` (Erstellungszeitpunkt) bleibt UTC, wie RFC 5545 es
vorschreibt.

**Manuell im Browser verifiziert:** Button erscheint nur, wenn Prüfungen geladen
sind; Klick löst ohne Konsolenfehler aus (Blob-Erzeugung, Anchor-Click, Revoke —
Dateiinhalt bereits vollständig durch die automatisierten Tests abgedeckt, da der
Download-Sandbox der Browser-Automatisierung keine Dateiprüfung erlaubt).

### Nachbesserung nach Nutzer-Feedback: Kalender, Prüfungstermine, Theme-Toggle (+8 Tests)

Feedback nach M8: der Stundenplan sollte "genauer sein", Uhrzeiten sollten "leicht
erkennbar" sein, die Prüfungsliste zeigte unrealistisch viele Einträge ("gefühlt 30 AM
Prüfungen"), und der Theme-Umschalter sollte nur zwei Icons haben statt drei.

**1. Echtes Zeitraster statt Kartenliste.** `TimetableScreen` zeichnet jetzt eine
gemeinsame Stunden-Achse (gerundet auf volle Stunde, aus den geladenen Perioden der
Woche berechnet) und positioniert jede Periode proportional zu Startzeit und Dauer —
Lücken (Freistunden, Mittagspause) und Überschneidungen sind auf einen Blick sichtbar,
nicht nur als Text auf der Karte. Die reine Rechenlogik (`computeTimeBounds`,
`timeBoundsHourMarks`) liegt bewusst in `domain/timetable.ts`, nicht in der Komponente
— testbar ohne React, PLAN.md-Regel "ui/ redet nie direkt mit dem Netz, domain/ bleibt
reine Logik" konsequent weitergedacht.

| Bereich | Tests | Grundlage |
|---|---|---|
| `domain/timetable.ts` — `computeTimeBounds`/`timeBoundsHourMarks` | 6 | Rundung auf volle Stunde, Mehrtages-Spannen, Randwerte |
| `TimetableScreen` (erweitert) | +2 Assertions | Stundenachse sichtbar, Doppelstunde weiterhin als ein Block |

**2. Prüfungstermine nicht mehr wöchentlich.** Die vorige Fassung generierte jeden
Donnerstag eine Schularbeit — bei einer Abfrage über ein halbes Jahr (ExamsScreen)
ergab das ~26 identische Einträge. Echter Bug, kein Missverständnis: eine Schularbeit
pro Woche ist in keiner Schule realistisch. Fix: `FIXED_EXAM_DATES` in
`mock/timetable.ts` bindet die Schularbeit an fünf konkrete Donnerstage im Schuljahr
2026/2027, alle anderen Donnerstage zeigen die normale Angewandte-Mathematik-Stunde.
Regressionstest verhindert, dass das wieder passiert.

**3. Theme-Toggle auf zwei Icons reduziert.** Der dritte "System"-Button (💻) verwirrte
laut Rückmeldung nur. `ThemeToggle` ist jetzt ein einzelner Umschalter (☀️/🌙), der
zeigt, was gerade aktiv ist, und beim Klick explizit auf das jeweils andere wechselt.
Der automatische Start nach Systemeinstellung bleibt beim allerersten Laden erhalten
(siehe `themeStore.ts`) — nur die manuelle Bedienung wurde vereinfacht.

**Manuell im Browser verifiziert** (Mock-Server, Light/Dark, Desktop 900×1400 zum
Sehen der ganzen Woche auf einmal, Mobile mit horizontalem Scroll): Zeitraster
positioniert alle Randfälle korrekt (Doppelstunde als ein Block, Entfall/Vertretung/
Raumänderung an der richtigen Stelle), Prüfungsliste zeigt genau 3 statt ~26 Einträge
im Standardzeitraum, Theme-Umschalter funktioniert mit einem Klick in beide
Richtungen.

### Zusätzlich gegen den echten Server verifiziert (ohne Zugangsdaten)

Am 2026-09-10 lief der fertige API-Layer einmal komplett gegen `htlstp.webuntis.com`,
mit einem absichtlich nicht existierenden Benutzernamen:

```
Endpunkt: https://htlstp.webuntis.com/WebUntis/jsonrpc.do?school=htlstp
FEHLGESCHLAGEN: Benutzername oder Passwort ist falsch.
```

Damit ist die gesamte Kette real bestätigt: `FetchTransport` → echtes HTTPS → echte
JSON-RPC-Fehlerantwort → `WebUntisRpcError` → `describeError`. Nur der angemeldete Teil
fehlt noch — dafür braucht es echte Zugangsdaten.

## 3. Test gegen den echten Server steht noch aus

- [ ] `authenticate` mit echten Zugangsdaten → liefert `sessionId`, `personType`, `personId`?
- [ ] 2FA / App-Secret erforderlich?
- [ ] `getTimetable` (customizable) für den eigenen Stundenplan — kommen `info`, `substText`, `lstext` wie dokumentiert?
- [ ] `logout`
- [ ] Rechte-Check je Methode: `getSubstitutions`, `getStudents`, `getExams`, `getExamTypes`, `getTimetableWithAbsences`, `getClassregEvents`
- [ ] `getTimetableWithAbsences`: sind `externalkey`s an dieser Schule überhaupt gepflegt?
- [ ] Liefern Fächer/Klassen echte `foreColor`/`backColor` oder müssen wir die Palette selbst erzeugen?
- [ ] `getTimegridUnits`: tatsächliches Stundenraster der HTL
- [ ] Rate-Limit-Verhalten bei mehreren Requests kurz hintereinander
