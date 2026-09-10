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

**Stand nach M2 (API-Layer): 99 Tests, alle grün.** `npm test`

| Bereich | Tests | Grundlage |
|---|---|---|
| `format.ts` — YYYYMMDD, HHMM, RRGGBB, Timegrid-Tage | 23 | Werte aus den Doku-Beispielen |
| `client.ts` — Umschlag, `?school=`, Cookies, Fehler-Mapping, Warteschlange | 24 | Doku Abschnitt 1 + echte Server-Header |
| `methods.ts` — alle 23 dokumentierten Methoden | 40 | Beispiel-Responses der Doku |
| `errors.ts` — Codes, Prädikate, deutsche Meldungen | 12 | gemessene Codes + JSON-RPC-2.0-Spec |

Die Fixtures liegen in `src/api/__tests__/fixtures/` und sind wörtlich aus der Doku
übernommen. Welche Satzfehler der Doku dabei korrigiert wurden und welche inhaltliche
Abweichung eine Entscheidung erforderte, steht in `src/api/__tests__/fixtures/README.md`.

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
