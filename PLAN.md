# BetterWebUntis – Projektplan

Stand: 2026-09-10 · Basis: `2018-09-20-WebUntis_JSON_RPC_API.pdf` (vollständig gelesen, 26 Abschnitte)

---

## 1. Was die Doku tatsächlich hergibt

Vollständige Liste der dokumentierten Methoden (alles andere existiert für uns nicht):

| # | Methode | Recht | Zweck |
|---|---------|-------|-------|
| 1 | `authenticate` | – | Login, liefert `sessionId`, `personType` (2=Lehrer, 5=Schüler), `personId`. Pflicht-Query-Param `?school=SCHULNAME`, Param `client` |
| 2 | `logout` | – | Session beenden |
| 3 | `getTeachers` | masterdata teachers | id, name, foreName, longName, foreColor, backColor |
| 4 | `getStudents` | masterdata students | id, key, name, foreName, longName, gender |
| 5 | `getKlassen` | masterdata Klassen | optional `schoolyearId`; id, name, longName, foreColor, backColor, did, teacher1/2 |
| 6 | `getSubjects` | – | id, name, longName, foreColor, backColor |
| 7 | `getRooms` | – | id, name, longName, foreColor, backColor |
| 8 | `getDepartments` | – | id, name, longName |
| 9 | `getHolidays` | – | id, name, longName, startDate, endDate |
| 10 | `getTimegridUnits` | – | pro `day` (1=So … 7=Sa) Array `timeUnits` mit startTime/endTime |
| 11 | `getStatusData` | – | `lstypes` (ls/oh/sb/bs/ex) + `codes` (cancelled/irregular) inkl. Farben |
| 12 | `getCurrentSchoolyear` | – | id, name, startDate, endDate |
| 13 | `getSchoolyears` | – | alle Schuljahre |
| 14 | `getTimetable` (simple) | timetable view | Params `id`, `type` (1=Klasse,2=Lehrer,3=Fach,4=Raum,5=Schüler), `startDate`, `endDate` |
| 15 | `getTimetable` (customizable) | timetable view | `options`-Objekt, siehe unten – **das nutzen wir** |
| 17 | `getLatestImportTime` | – | Unix-Timestamp des letzten Untis-Imports |
| 18 | `getPersonId` | – | `type`, `sn`, `fn`, `dob` → personId oder 0 |
| 19 | `getSubstitutions` | any timetable view | `startDate`, `endDate`, `departmentId` (0 = alle) |
| 20/26 | `getClassregEvents` | classregevents / classevent | Klassenbucheinträge, global oder pro Element |
| 21 | `getExams` | examinations read | **`examTypeId` ist Pflicht**, `startDate`, `endDate` |
| 22 | `getExamTypes` | examtypes read | Liste der Prüfungstypen |
| 23 | `getTimetableWithAbsences` | Student absences | `options{startDate,endDate}` → `result.periodsWithAbsences[]`, referenziert **externalkeys**, nicht ids |
| 24 | `getClassregCategories` | classregister | Bemerkungskategorien |
| 25 | `getClassregCategoryGroups` | classregister | Gruppen dazu |

Abschnitt 16 ist in der Doku als „no longer supported" markiert.

Globale Konventionen (verbindlich): UTF-8, Datum `YYYYMMDD` (number), Zeit `HHMM` (number, also `800` = 08:00, `1425` = 14:25), Farbe `RRGGBB` (ohne `#`). **Leere Felder werden weggelassen** – jedes optionale Feld muss im TS-Typ optional sein.

Session: nach `authenticate` wird die `sessionId` als Cookie `JSESSIONID=...` im Request-Header mitgeschickt. Der Pfad-Parameter `;jsessionid=` ist deprecated → nutzen wir nicht.

### Was in der Doku NICHT existiert (→ `IDEEN.md`, wird nicht erfunden)
- **Mitteilungen/Nachrichten** – keine Methode. Punkt 6 der Pflichtliste ist mit dieser API nicht erfüllbar.
- **Kontaktdaten ändern** – keine Methode. Nur Anzeige, und selbst die nur, soweit Masterdata es hergibt.
- **Passwort ändern** – keine Methode.
- **„Meine Termine / Sprechstunden"** – keine eigene Methode. Rekonstruierbar aus `lstype:"oh"` (office hour) in `getTimetable` sowie `type:"oh"`/`"sb"`/`"bs"` in `getSubstitutions`. Wird so gebaut und in `IDEEN.md` als Teil-Lösung vermerkt.
- **ICS-Abo-Feed** – braucht zwingend einen Server (siehe Risiko R2).

---

## 2. Tech-Stack-Empfehlung

**React 19 + TypeScript + Vite + Tailwind CSS v4 + Capacitor 7**

| Baustein | Wahl | Begründung |
|---|---|---|
| Framework | React 19 + TS (strict) | Web ist hier das *primäre* Ziel; React liefert dafür die beste Bundle-Größe und das beste Tooling |
| Build | Vite 7 | schnell, integrierter Dev-Proxy (löst CORS in Dev, siehe R1) |
| Styling | Tailwind v4 + CSS-Variablen-Tokens | Dark/Light über `prefers-color-scheme` + manueller Override, ohne Theme-Bibliothek |
| Daten | TanStack Query | Caching, Stale-While-Revalidate, Retry – passt exakt zu langsamer/gedrosselter WebUntis-API |
| State | Zustand | nur Session + UI-Präferenzen, minimal |
| Tests | Vitest + Testing Library + MSW | MSW mockt JSON-RPC auf Netzwerkebene, dieselben Fixtures wie der Mock-Server |
| Mobile | Capacitor 7 | wrappt exakt dieselbe Web-App zu APK/IPA; `CapacitorHttp` macht native Requests → **umgeht CORS auf Mobile komplett** |
| ICS | eigener RFC-5545-Writer (~120 Zeilen) | keine Dependency, volle Kontrolle über `UID`/`SEQUENCE` (nötig für Update-Semantik) |

**Warum nicht Flutter Web:** großes Initial-Bundle, Canvas-Text-Rendering, schlechtere PWA-/Browser-Integration – bei „Web-App zuerst" der falsche Trade-off.
**Warum nicht React Native + RNW:** Web bleibt Bürger zweiter Klasse, deutlich mehr Config-Reibung, kein echtes PWA.

---

## 3. Architektur

```
src/
  api/
    transport.ts     JSON-RPC-Transport: fetch (Web, via Proxy) | CapacitorHttp (Nativ), Cookie-Handling
    methods.ts       genau eine typisierte Funktion je dokumentierter Methode – nichts darüber hinaus
    types.ts         TS-Typen 1:1 aus der Doku, optionale Felder optional
    errors.ts        WebUntis-Fehlercodes → typisierte Fehler
    format.ts        YYYYMMDD ↔ Date, HHMM ↔ Minuten, RRGGBB ↔ CSS
  domain/
    timetable.ts     Perioden + Substitutions mergen, Raster/Tag/Woche bauen, Kollisionen auflösen
    colors.ts        foreColor/backColor aus API, sonst deterministische Palette je Fach (Hash → HSL)
    ics.ts           Exams → ICS (RFC 5545)
    absences.ts      externalkey → Masterdata-Mapping
  state/             Session-Store, Theme-Store
  ui/
    components/      TimetableGrid, PeriodCard, DayColumn, ElementPicker, ThemeToggle …
    screens/         Login, Stundenplan, Elementwechsel, Abwesenheiten, Prüfungen, Termine, Profil
  mock/
    fixtures/        JSON-Payloads, direkt aus den Doku-Beispielen abgeleitet
    server.ts        eigenständiger Node-Mock-Server (dieselben Fixtures)
```

Harte Regel: `ui/` und `domain/` reden **nie** direkt mit dem Netz, nur über `api/methods.ts`.

---

## 4. Risiken & offene Entscheidungen

**R1 – CORS: bestätigt, Proxy ist zwingend.** *(gemessen 2026-09-10, siehe `TESTING.md`)*
`htlstp.webuntis.com` spiegelt zwar die Request-Origin in `Access-Control-Allow-Origin`, sendet aber **kein** `Access-Control-Allow-Credentials`. Damit blockiert der Browser jeden Request mit `credentials: "include"` — genau den bräuchte es für das `JSESSIONID`-Cookie. Das Cookie ist zusätzlich `HttpOnly`, JS kann es also weder lesen noch selbst setzen. Konsequenz:
- Dev: Vite-Proxy (`server.proxy`)
- Web-Produktion: schlanker, **zustandsloser** PHP-Proxy auf World4you — keine Datenbank, keine Nutzerverwaltung, reine Weiterleitung inkl. Cookie
- Android/iOS: nicht betroffen, `CapacitorHttp` requestet nativ am Browser-CORS vorbei

**R2 – ICS-Abo-Feed: entschieden.** Erst der rein clientseitige ICS-Datei-Export (M8), danach der Abo-Feed als eigener Dienst auf World4you (M11). Der Feed muss zwangsläufig Zugangsdaten serverseitig vorhalten; das wird bewusst und isoliert gebaut: eigener Endpunkt, verschlüsselt abgelegte Zugangsdaten, geheime Feed-URL pro Nutzer, keinerlei Kopplung an die App-Session. Details und Sicherheitsmodell in `IDEEN.md` B2.

**R3 – Doku von 2018: geprüft, Entwarnung.** *(gemessen 2026-09-10)*
`authenticate` antwortet mit `-8504 bad credentials`, `getStatusData` mit `-8520 not authenticated` — die JSON-RPC-API ist an dieser Schule aktiv und verhält sich wie dokumentiert. Kein neuerer Auth-Flow erzwungen. Offen bleibt nur, ob das konkrete Konto 2FA/App-Secret verlangt; das zeigt sich erst mit echten Zugangsdaten.

**R4 – Rechte.** `getSubstitutions`, `getStudents`, `getExams`, `getTimetableWithAbsences` hängen an Rechten, die ein Schüler-Account oft nicht hat. Jeder Screen muss sauber degradieren statt zu crashen. Der eigene Stundenplan bleibt auch ohne `getSubstitutions` brauchbar, weil `code`/`substText`/`info` bereits in `getTimetable` (customizable) stecken.

**R5 – `getExams` verlangt `examTypeId` als Pflichtparameter.** Also erst `getExamTypes`, dann pro Typ abfragen und zusammenführen. Fehlt das Recht auf `getExamTypes`, ist der Prüfungsexport nur eingeschränkt möglich.
*Eingetreten und gelöst (2026-09-17):* Für echte Schüler-Konten an der HTL St. Pölten sind sowohl `getExamTypes` als auch `getExams` selbst gesperrt (Code -8509, direkt gemessen). Auch ein Feld im Stundenplan (`lstype`) hilft nicht — echte Prüfungsstunden tragen keins. Gelöst über einen undokumentierten REST-Endpunkt, siehe R8.

**R6 – `getTimetableWithAbsences` liefert externalkeys, keine ids.** Auflösung nur über Masterdata mit `externalkey` – die aber nicht jede Schule pflegt. Fallback: Rohanzeige.

**R7 – Rate-Limits.** WebUntis drosselt. Masterdata (Lehrer/Klassen/Fächer/Räume/Timegrid/Holidays) wird pro Schuljahr einmal geholt und lokal gecacht.

**R8 – Undokumentierte REST-Endpunkte für Prüfungen UND Abwesenheiten, ausdrücklich freigegeben (2026-09-17).** Siehe R5/R6: Die 2018er-JSON-RPC-Doku reicht für beides bei echten Schüler-Konten nicht aus (`getExams`/`getExamTypes`/`getTimetableWithAbsences` alle gesperrt, Code -8509 — und kein Stundenplan-Feld hilft). Der Nutzer hat aus den Browser-DevTools der originalen WebUntis-Oberfläche zwei Endpunkte kopiert und deren Nutzung freigegeben:
- `GET /WebUntis/api/exams?startDate=…&endDate=…&studentId=…&withGrades=true&klasseId=-1` — `src/api/examsRest.ts`
- `GET /WebUntis/api/classreg/absences/students?startDate=…&endDate=…&studentId=…&excuseStatusId=-1` — `src/api/absencesRest.ts`

Beide bewusst von `methods.ts` getrennt (gemeinsamer Namensraum `restApi`, siehe `api/restApi.ts`/`api/index.ts`), damit an jeder Aufrufstelle sichtbar bleibt, was dokumentiert ist und was nicht. `WebUntisClient.getRest()` bedient beide gleich (Cookie-Auth, Warteschlange/Drosselung geteilt mit `call()`).

Drei offene Punkte:
- **Fehlerformat ungemessen.** Nur grob als HTTP-Status behandelt (`WebUntisClient.getRest`), nicht mit der Rechte-Feinauflösung aus `errors.ts`.
- **Produktions-Proxy (M11, noch nicht gebaut) deckt das noch nicht ab.** Der in B1/IDEEN.md geplante PHP-Proxy leitet laut Plan nur `jsonrpc.do` weiter, nicht beliebige `/WebUntis/*`-Pfade. Muss erweitert werden, bevor diese Endpunkte in Produktion funktionieren — im Dev-Vite-Proxy (leitet den ganzen `/WebUntis`-Präfix weiter) funktionieren sie schon.
- **Abwesenheiten: nur ein Beispiel gemessen**, und zwar eine unbearbeitete (`isExcused: false, excuseStatus: null`). Wie eine bereits entschuldigte Abwesenheit aussieht, ist unklar.

**R9 – Fachfarben-Override lokal gespeichert, `localStorage` statt Cookies (2026-09-17).** Nutzerwunsch: Fachfarben individuell anpassbar, dauerhaft gemerkt — auf der Website und später in der Capacitor-App (M9). Umgesetzt über `localStorage` (`state/subjectColorStore.ts`, gleiches Muster wie `themeStore.ts`), nicht Cookies: die Farben werden nie an den Server geschickt, Cookies wären bei jeder Proxy-Anfrage unnötiger Overhead. Funktioniert unverändert in Capacitor, weil das eine echte WebView mit eigenem persistentem `localStorage` einbettet — keine Sonderbehandlung nötig, aber erst nach M9 am echten Gerät verifizierbar. Falls `localStorage` unter Android nicht robust genug ist (Speicherdruck), wäre `@capacitor/preferences` der Ersatz — bewusst nicht vorab eingebaut, da M9 noch nicht existiert (YAGNI).

**R10 – `getTimetable` verlangt Start-/Enddatum innerhalb eines einzigen Schuljahres, Code `-8507` (gemessen 2026-09-17).** Bisher unbekannte Serverbedingung, gefunden über einen echten Absturz der Einstellungen-Seite: `SettingsScreen.tsx` fragte den eigenen Stundenplan über ein festes ±180-Tage-Fenster ab, das teilweise über eine Schuljahresgrenze hinausreicht — der Server lehnt das mit `-8507 startDate and endDate are not within a single school year` ab, statt die Anfrage einfach zu kappen oder zu ignorieren. Behoben durch dieselbe Schuljahres-Klammerung (`getCurrentSchoolyear()`), die Prüfungen/Abwesenheiten (R8) schon nutzen. Bewusst nur für `getTimetable` in `mock/rpcHandler.ts` nachgebildet — ob `getSubstitutions`/`getExams`/`getTimetableWithAbsences` derselben Regel unterliegen, wurde nie gemessen. Details: IDEEN.md B7.

---

## 5. Meilensteine

| M | Inhalt | Abhängigkeit |
|---|---|---|
| **M0** | Server-Probe (Abschnitt 0 des Auftrags): existiert `jsonrpc.do` noch? | braucht Servername + Schulname |
| **M1** | Scaffold, Tooling, Build-Output aus OneDrive heraus, `git init`, erster lokaler Commit | Standort-Entscheidung |
| **M2** | API-Layer komplett: `types.ts`, `transport.ts`, `methods.ts`, `format.ts`, `errors.ts` + Unit-Tests gegen Doku-Fixtures | M1 |
| **M3** | Fixtures + Mock-Server: Fake-Schule, Mehrtages-Stundenplan inkl. Randfällen (Vertretung, Entfall, Raumänderung, Doppelstunde, Prüfung, Feiertag) | M2 |
| **M4** | App-Shell: Routing, Theme (auto Dark/Light), Design-System, Login + Session-Handling | M3 |
| **M5** | Eigener Stundenplan: Tages-/Wochenansicht, Substitutions-Merge, Fachfarben, responsive | M4 |
| **M6** | Stundenpläne anderer Elemente (Klasse/Lehrer/Raum/Fach) mit Element-Picker | M5 |
| **M7** | Abwesenheiten, Prüfungsliste, „Meine Termine/Sprechstunden", Profil + Logout | M5 |
| **M8** | ICS-Export der Prüfungen (rein clientseitig) | M7 |
| **M9** | Capacitor: Android-Projekt + APK-Build; iOS-Projekt-Scaffold (Build braucht macOS) | M5 |
| **M10** | Echter Smoke-Test gegen den Schulserver, `TESTING.md`, Feinschliff | Zugangsdaten |
| **M11** | *(optional, nur nach Freigabe)* ICS-Abo-Feed-Service | Entscheidung zu R2 |

---

## 6. Teststrategie

- **Fixtures** ausschließlich aus den Doku-Beispielen abgeleitet; Feldnamen und Formate (`YYYYMMDD`, `HHMM`, `RRGGBB`) exakt wie dokumentiert, auch bei Fake-Daten.
- **Unit-Tests** für Parsing, Formatkonverter, Farb-Fallback, Substitutions-Merge, ICS-Ausgabe.
- **Komponenten-Tests** mit MSW gegen dieselben Fixtures.
- **Mock-Server** (`npm run mock`) für manuelles Klicken ohne echten Server.
- **Smoke-Test** gegen den echten Server: `authenticate` → `getTimetable` (eigener Plan) → `logout`, sobald Zugangsdaten vorliegen.
- **`TESTING.md`** hält fest, was nur gegen Mocks getestet wurde und was gegen den echten Server noch aussteht.

---

## 7. Umgebung / Build

**Projektstandort:** `/home/emanschi/Projects/BetterWebuntis` — am 2026-09-10 aus `~/OneDrive/Desktop/Programmierungen/Projekte/` hierher verschoben. Nichts am Projekt wird mehr von OneDrive synchronisiert.

**Build-Output:** `/home/emanschi/builds/BetterWebuntis/` (Web-Bundle, APK, iOS-Artefakte). `node_modules` bleibt im Projektordner — es ist kein Build-Output, und Auslagern bricht die Tool-Auflösung; da das Projekt nicht mehr in OneDrive liegt, ist das unkritisch.

**Vorgefunden:** Node 26.8.1, npm 12.0.2, git, curl. **Kein JDK, kein Android SDK** → für den APK-Build sind `jdk-temurin` und das Android SDK (cmdline-tools, Platform 35, Build-Tools) nachzuinstallieren. iOS-Builds sind auf Linux prinzipiell unmöglich — es entsteht nur das Xcode-Projekt plus Build-Anleitung für einen Mac.

**Server:** `htlstp.webuntis.com`, Schule `htlstp`, Tenant-Id `7053500`.

**Git:** Remote seit 2026-09-17 unter `github.com/Emanschi/BetterWebUntis` (`origin`), lokaler Branch `master` verfolgt `origin/main`. Push nur nach ausdrücklicher Erlaubnis je Runde, nie automatisch.
