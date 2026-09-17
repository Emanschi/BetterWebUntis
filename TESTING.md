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

## 3. Test gegen den echten Server — ✅ erster Durchlauf erledigt, 2026-09-16

Smoke-Test (`npm run smoke`) und App im Browser (`npm run dev`, Proxy auf
`htlstp.webuntis.com`) mit einem echten Schüler-Konto der HTBLuVA St. Pölten,
vom Nutzer selbst im eigenen Terminal/Browser ausgeführt — Zugangsdaten haben
diese Session nie erreicht, nur die Diagnose-Ausgabe.

| Punkt | Ergebnis |
|---|---|
| `authenticate` mit echten Zugangsdaten | ✅ liefert `sessionId`, `personType: 5` (Schüler), `personId` |
| 2FA / App-Secret erforderlich? | Nein, für dieses Konto nicht |
| `getCurrentSchoolyear` | ✅ 2026/2027, 07.09.2026–04.07.2027 |
| `getTimegridUnits` | ✅ `day`-Werte 2–7 beobachtet (kein 0, kein 1 — Sonntag hat schlicht keine Einheiten). Bestätigt den Doku-Fließtext "1=Sonntag…7=Samstag" als richtige Interpretation gegenüber dem widersprüchlichen Beispiel, siehe `format.ts` |
| `getTimetable` (customizable) für den eigenen Plan | ✅ 42 Perioden im Wochenzeitraum — inkl. eines nicht dokumentierten Sonderfalls, siehe unten |
| `logout` | ✅ |
| Rate-Limit bei mehreren Requests hintereinander | Keine Auffälligkeiten bei den getesteten ~15 Aufrufen |

**Rechte dieses konkreten Schüler-Kontos** (Doku-Rechtespalte lässt offen, was genau
gilt — das hier ist eine echte Messung, kein Vorabraten mehr):

| Methode | Recht? |
|---|---|
| `getKlassen`, `getSubjects`, `getRooms`, `getDepartments`, `getHolidays`, `getStatusData`, `getLatestImportTime` | ✅ ja |
| `getTeachers` | ❌ nein — **Überraschung**, war bisher im Mock offen angenommen |
| `getStudents` | ❌ nein (wie erwartet) |
| `getExamTypes` | ❌ nein — **Überraschung**, macht `getExams`/ICS-Export für dieses Konto faktisch unbenutzbar (siehe IDEEN.md) |
| `getSubstitutions` | ❌ nein — unkritisch, weil `getTimetable` mit `showSubstText`/`showInfo` dieselben Infos direkt mitliefert (PLAN.md R4) |
| `getTimetableWithAbsences`, `getClassregCategories` | ❌ nein (wie erwartet) |

`src/mock/accounts.ts` ist entsprechend aktualisiert — das Schüler-Konto im Mock
spiegelt jetzt exakt diese gemessenen Rechte, nicht mehr eine Annahme.

### Zwei echte Bugs gefunden und behoben

**1. Cookie-Path-Bug, diesmal beim echten Server (derselbe Bug wie M5, aber woanders).**
Nach dem Login zeigte die App sofort "Die Sitzung ist abgelaufen." Ursache: WebUntis
setzt `Path=/WebUntis` (Großschreibung, bereits in Abschnitt 1 gemessen). Der Dev-Proxy
lief bis dahin unter `/webuntis` (klein) und schrieb erst serverseitig auf `/WebUntis`
um — der Browser sah nie den umgeschriebenen Pfad, das Cookie passte nie zu dem, was
er tatsächlich anfragte. Betraf **jeden** echten Login über den Proxy, nicht nur den
Mock-Server. Fix: Proxy-Pfad in `vite.config.ts` und der Default in `sessionStore.ts`
exakt auf `/WebUntis` (Großschreibung) geändert, keine Pfadumschreibung mehr nötig.

**2. Ganztägiger Eintrag ohne Doku-Entsprechung.** Unter den 42 Perioden war ein
Eintrag "14.09.2026 00:00–23:59, kein Fach, kein Raum, `code: irregular`" — die Doku
kennt so einen Fall nicht. Ungefixt hätte das unsere neue Zeitraster-Achse (siehe
Kalender-Nachbesserung) auf 24 Stunden aufgebläht und echte Stunden winzig gequetscht.
Fix: `domain/timetable.ts` trennt jetzt Perioden ab 10 Stunden Dauer in ein eigenes
`allDayBlocks`-Feld, das `TimetableScreen` als eigene Zeile über dem Zeitraster zeigt,
statt die Stundenachse zu verzerren. Im Mock nachgebildet (`ALL_DAY_EVENT_DATE` in
`mock/timetable.ts`), damit der Fall auch ohne echten Server sichtbar bleibt.
**Offen:** was dieser Eintrag inhaltlich darstellt (Schulveranstaltung? Systemeintrag?)
ist nicht geklärt — nur dass er vorkommt und die UI ihn jetzt nicht mehr kaputt macht.

### Prüfungen ohne getExams — Weg zur Lösung, 2026-09-17

Drei Messrunden am selben echten Schüler-Konto, jede mit `npm run smoke`:

**Runde 1 (getExams direkt):** `getExamTypes` war schon als gesperrt bekannt (Abschnitt 3).
`scripts/smoke-test.ts` erweitert, probiert seitdem `getExams` direkt mit den IDs 1–10 — alle
10 mit Code -8509. Also nicht nur `getExamTypes`, auch `getExams` selbst ist für dieses Konto
gesperrt. Trotzdem zeigt die originale WebUntis-Weboberfläche für dasselbe Konto Prüfungen an.

**Runde 2 (Diagnose des Stundenplans):** Naheliegende Theorie: die Original-App markiert
Prüfungsstunden im Stundenplan (`lstype: "ex"`, ein Feld, das `getTimetable` liefert und für
das dieses Konto ein Recht hat). `scripts/smoke-test.ts` bekam einen Diagnose-Block: lädt das
komplette Schuljahr, zählt die Verteilung von `lstype`/`code`/`activityType` über alle Perioden
und sucht gezielt nach einer aus der Original-App bekannten Prüfung. Ergebnis:

```
1466 Perioden im ganzen Schuljahr geladen.
lstype-Verteilung: { '(leer)': 1466 }
code-Verteilung: { irregular: 12, cancelled: 40, '(leer)': 1414 }
Gefunden (1x) — volle Rohdaten:
  {"id":9392681,"date":20260918,"startTime":1220,"endTime":1310,
   "kl":[{"id":5022,"name":"3BHIF"}],"te":[{"id":96,"name":"MAYR"}],
   "su":[{"id":176,"name":"NW2","longname":"NATURWISSENSCHAFTEN"}],
   "ro":[{"id":343,"name":"N306"}],"lsnumber":137500,
   "info":"SMÜ Nomenklatur","activityType":"Unterricht"}
```

**Kein einziges** der 1466 Perioden hatte `lstype` gesetzt — auch nicht die echte
Prüfungsstunde. Sie war strukturell nicht von einer normalen Stunde zu unterscheiden, nur ein
freier `info`-Text ("SMÜ Nomenklatur") verriet sie. Die `lstype`-Theorie war damit widerlegt:
es gibt keinen Weg über die dokumentierte API, Prüfungen für dieses Konto zuverlässig zu
erkennen.

**Runde 3 (undokumentierter REST-Endpunkt, mit Freigabe):** Drei Optionen vorgelegt
(undokumentierte Schnittstelle nutzen / Text-Heuristik auf Notizen / Feature aufgeben) — der
Nutzer entscheidet sich für die Schnittstelle und liefert sie selbst aus den Browser-DevTools
der originalen Weboberfläche:

```
GET https://htlstp.webuntis.com/WebUntis/api/exams?startDate=20260901&endDate=20260930&studentId=<personId>&withGrades=true&klasseId=-1

{"data":{"exams":[{"id":0,"examType":"SA_TE","name":"NW2","studentClass":["3BHIF"],
  "examDate":20260918,"startTime":1220,"endTime":1310,"subject":"NW2",
  "teachers":["MAYR"],"rooms":["N306"],"text":"Nomenklatur","grade":""}]}}
```

Bereits aufgelöste Kurzcodes (Fach/Lehrkraft/Raum als Strings, kein Nachschlagen nötig) — genau
das, was die "Prüfungen"-Seite der Original-App zeigt. Implementiert in `api/examsRest.ts`
(eigener Namensraum `restApi`, bewusst getrennt von den dokumentierten Methoden), genutzt von
`ExamsScreen.tsx`. Details, Risiko und offene Punkte: IDEEN.md B3, `api/examsRest.ts`.

### Abwesenheiten ohne getTimetableWithAbsences — derselbe Weg, 2026-09-17

Direkt im Anschluss an die Prüfungen-Lösung: da `getTimetableWithAbsences` ebenfalls gesperrt
ist (Code -8509) und kein Stundenplan-Äquivalent hat, lag nahe, dass die
"Abwesenheiten"-Seite der Original-App denselben REST-Aufbau hat wie die Prüfungen-Seite. Der
Nutzer hat selbst nachgesehen und den Endpunkt gefunden:

```
GET https://htlstp.webuntis.com/WebUntis/api/classreg/absences/students?startDate=20260907&endDate=20270704&studentId=<personId>&excuseStatusId=-1

{"data":{"absences":[{"id":1350715,"startDate":20260911,"endDate":20260911,
  "startTime":750,"endTime":915,"reasonId":0,"reason":"","text":"",
  "isExcused":false,"excuseStatus":null,
  "excuse":{"id":-1,"text":"","excuseDate":0,"excuseStatus":"","isExcused":false,"userId":-1,"username":""}}],
  "absenceReasons":[],"excuseStatuses":null,"showAbsenceReasonChange":false,"showCreateAbsence":false}}
```

Der Eintrag mit Status "?" aus dem allerersten Screenshot (weit zu Beginn dieser
Testreihe) ist damit erklärt: `isExcused: false, excuseStatus: null` — eine noch nicht
bearbeitete Abwesenheit, kein separater Selbstmelde-Workflow, wie zwischenzeitlich vermutet.

Implementiert in `api/absencesRest.ts`, genutzt von `AbsencesScreen.tsx` (Tab wieder da).
Details: IDEEN.md B3b.

**Noch offen (gilt für beide REST-Workarounds, Prüfungen und Abwesenheiten):**
- [ ] Erneuter Login-Test gegen den echten Server: funktioniert `getRest()` (Cookie-Auth,
      Proxy-Pfade `/WebUntis/api/exams` und `/WebUntis/api/classreg/absences/students`) dort
      genauso wie gegen den Mock?
- [ ] Fehlerverhalten der Endpunkte bei abgelaufener Session ist ungemessen (aktuell nur grober
      HTTP-Status, siehe `WebUntisClient.getRest`)
- [ ] Wie sieht eine bereits *entschuldigte* Abwesenheit in der Antwort aus? Nur eine
      unbearbeitete wurde bisher gemessen (`excuseStatus: null`)
- [ ] Test mit einem Lehrer-Konto gegen den echten Server (bisher nur simuliert über `aschmidt` im Mock)
- [ ] Liefern Fächer/Klassen echte `foreColor`/`backColor`, oder greift bei dieser Schule durchgehend der generierte Fallback aus `domain/colors.ts`?
- [ ] Was der ganztägige Eintrag ohne Fach/Raum inhaltlich bedeutet

### Kalender-Redesign: gefüllte Fach-Karten, Detailansicht, Fachfarben-Einstellungen (2026-09-17)

Nutzerwunsch: Fach-Karten ganzflächig statt nur mit Farbstreifen, Stunden zum Öffnen für
längere Infos, und ein Einstellungs-Tab zum Anpassen der Fachfarben (lokal gespeichert,
Web und später APK). Details und Hintergrund: IDEEN.md B6.

**Manuell verifiziert** (Mock-Server, `mmuster`, Light **und** Dark Mode explizit
durchgeklickt):
- Stundenplan zeigt ausgefüllte Fach-Karten in beiden Themes, Text gut lesbar (automatische
  Kontrastwahl über `domain/colors.ts`)
- Entfall (Mittwoch) bleibt neutral/grau statt farbig, Vertretung/Raumänderung (Freitag)
  zeigt die ⚠-Pille weiterhin klar lesbar auf der Fachfarbe
- Klick auf die SEW-Doppelstunde (Montag) öffnet das Modal mit Fach (Langname), Datum,
  Uhrzeit+Dauer (105 Min., korrekt für die zusammengefasste Doppelstunde), Lehrkraft
  ("Schmidt"), Raum ("EDV-Saal 1"), Klasse ("3AHIF") — sowohl in Dark als auch Light Mode
- "Farbe für SEW anpassen →" im Modal führt korrekt zu `/settings`
- Einstellungen zeigt 7 Fächer (nicht das 8. Katalog-Fach "Physik", das absichtlich nirgends
  für die Klasse eingeplant ist — Test dafür in `Settings.test.tsx`)
- Farbwahl (Palette-Swatch) wirkt sofort auf **beiden** SEW-Blöcken im Stundenplan
  (Montag und Mittwoch), bleibt nach Navigation zwischen Screens erhalten
- "Zurücksetzen" stellt die generierte Fallback-Farbe wieder her, auch sofort sichtbar

**Noch offen:**
- [ ] Ob `localStorage` in der späteren Capacitor-App (M9, noch nicht gebaut) tatsächlich
      robust genug ist, oder ob `@capacitor/preferences` nötig wird — lässt sich erst am
      echten Gerät zeigen, siehe IDEEN.md B6

### Settings-Absturz (-8507), Buchungshinweis, Prüfungs-Sprung, Tages-/Wochenansicht (2026-09-17)

Direktes Feedback nach dem ersten Live-Test des Kalender-Redesigns. Details und Hintergrund:
IDEEN.md B7, PLAN.md R10.

**Neuer, bisher ungemessener Fehlercode: `-8507`.** Die Einstellungen-Seite stürzte gegen den
echten Server ab. Ursache: `getTimetable` verlangt `startDate`/`endDate` **innerhalb eines
einzigen Schuljahres** — `SettingsScreen.tsx` fragte bisher ein festes ±180-Tage-Fenster ab,
das teilweise über die Schuljahresgrenze hinausreicht:

```
{"error":{"message":"startDate and endDate are not within a single school year","code":-8507}}
```

Behoben durch dieselbe Schuljahres-Klammerung (`getCurrentSchoolyear()`), die Prüfungen/
Abwesenheiten schon verwenden. `mock/rpcHandler.ts` validiert dieselbe Regel jetzt auch, aber
bewusst nur für `getTimetable` — ob `getSubstitutions`/`getExams`/`getTimetableWithAbsences`
derselben Einschränkung unterliegen, wurde nie gemessen.

**"Lehrstoff"-Wunsch: kein erfundenes Feld, sondern ehrlich benannt.** Das einzige dokumentierte,
bisher ungenutzte Feld in diese Richtung ist `bkText`/`bkRemark` (Doku Abschnitt 15,
`showBooking: true`) — jetzt angefragt und als "Buchungshinweis"/"Buchungsvermerk" in der
Detailansicht gezeigt, ausdrücklich **nicht** als "Lehrstoff" bezeichnet, da diese Zuordnung
nicht verifiziert ist. Der naheliegendere Kandidat, `getClassregEvents` (Klassenbuch), wurde
nie gegen das echte Schüler-Konto gemessen — die "gesperrt"-Annahme in `mock/accounts.ts` war
bisher nur übernommen, nicht selbst gemessen. `scripts/smoke-test.ts` fragt das jetzt in der
Rechte-Probe mit ab.

**Manuell verifiziert** (Mock-Server, `mmuster`, Light **und** Dark Mode):
- Einstellungen öffnet ohne Fehler, zeigt weiterhin nur die 7 tatsächlich eingeplanten Fächer
- BSP-Doppelstunde (Dienstag) zeigt "Halle 2 reserviert"/"Geräte bitte danach wieder
  wegräumen" im Detail-Modal
- Klick auf die 2. Prüfung (19.11.2026) bzw. 3. Prüfung (28.01.2027) in "Prüfungen" springt im
  Stundenplan zur jeweils korrekten Woche und zeigt einen pulsierenden roten Neon-Rahmen genau
  auf dem betroffenen Block, der nach ca. 3 Sekunden von selbst verschwindet
- Woche/Tag-Tab wechselt korrekt zwischen Ansichten; im Tagesmodus bewegen Vor/Zurück einzelne
  Tage (auch über Wochengrenzen hinweg); Warnungen (z. B. Raumänderung Freitag) bleiben auch im
  Tagesmodus sichtbar

**Noch offen:**
- [ ] Ob `bkText`/`bkRemark` bei dieser Schule real jemals befüllt ist (bisher nur simuliert)
- [ ] Ob `getClassregEvents` für das echte Schüler-Konto erreichbar ist oder gesperrt — nie
      gemessen, nur angenommen; `scripts/smoke-test.ts` probiert es jetzt in der Rechte-Probe
- [ ] Ob `-8507` auch für `getSubstitutions`/`getExams`/`getTimetableWithAbsences` gilt (nur für
      `getTimetable` direkt gemessen)
