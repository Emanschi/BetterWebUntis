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

**Stand nach M5 (Stundenplan): 170 Tests, alle grün.** `npm test` `npm test`

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

### M5 — Stundenplan-Ansicht (+20 Tests)

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
