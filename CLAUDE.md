# CLAUDE.md

Orientierung für Agenten-Sessions in diesem Repo. Projektsprache ist **Deutsch** —
Code-Kommentare, Commit-Messages, Doku und UI-Texte alle auf Deutsch.

## Was das ist

Modernere Alternative zur offiziellen WebUntis-App für **Schüler-Konten** der HTBLuVA
St. Pölten (`htlstp.webuntis.com`, Schule `htlstp`). React 19 + TypeScript (strict) + Vite +
Tailwind v4, später Capacitor für APK/iOS (M9, noch nicht gebaut). Reine Client-App, keine
eigene Nutzerverwaltung, kein Backend außer einem geplanten dummen CORS-Proxy.

Die drei Doku-Dateien sind der eigentliche Projektspeicher — **vor größeren Änderungen lesen
und danach fortschreiben**:

| Datei | Inhalt |
|---|---|
| [PLAN.md](PLAN.md) | Architektur, Meilensteine M0–M11, Risiken **R1–R11** (jedes mit Messdatum) |
| [IDEEN.md](IDEEN.md) | Offene Fragen A1–A6, Entscheidungen **B1–B8**, Backlog C. „Nichts hier wird ohne ausdrückliche Freigabe umgesetzt." |
| [TESTING.md](TESTING.md) | Was wogegen getestet wurde, echte Messungen gegen den Schulserver, offene Checkliste |

`2018-09-20-WebUntis_JSON_RPC_API.pdf` ist die **einzige** offizielle API-Quelle.

## Befehle

```bash
npm install        # node_modules fehlt im frischen Checkout
```
```bash
npm test           # Vitest, Stand zuletzt: 259 Tests grün
```
```bash
npm run typecheck  # tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
```
```bash
npm run dev        # Vite mit Proxy auf htlstp.webuntis.com
```
```bash
npm run mock       # Mock-Server auf localhost:4001, Logins: mmuster/test1234 (Schüler), aschmidt/test1234 (Lehrer)
```
```bash
WEBUNTIS_USER='...' WEBUNTIS_PASSWORD='...' npm run smoke   # gegen den echten Server, nur der Nutzer führt das aus
```

Build-Output liegt bewusst **außerhalb** des Projekts: `/home/emanschi/builds/BetterWebuntis/`
(`vite.config.ts`, `vitest.config.ts` coverage).

## Architektur und die harte Regel

```
src/api/      JSON-RPC-Layer: types.ts (1:1 aus der Doku) · transport.ts (fetch | CapacitorHttp)
              client.ts (Umschlag, Cookie-Jar, Warteschlange/Drosselung) · methods.ts (genau
              eine Funktion je dokumentierter Methode) · format.ts · errors.ts
              ⚠ examsRest.ts / absencesRest.ts / calendarEntryRest.ts = undokumentierte REST-
              Endpunkte, gebündelt unter dem eigenen Namensraum `restApi` (restApi.ts)
src/domain/   reine Funktionen: timetable.ts (Wochenraster, Doppelstunden-Merge, Zeitachse),
              colors.ts (Fachfarbe + WCAG-Kontrast), ics.ts (RFC 5545), schoolyear.ts
src/state/    Zustand-Stores: sessionStore (nur im Speicher!), themeStore, subjectColorStore
src/ui/       AppShell, router.tsx (HashRouter), screens/, components/
src/mock/     Mock-Server + Fake-Schule „Mock-HTL"; rpcHandler.ts wird von server.ts (Node)
              UND msw/handlers.ts (Tests) geteilt — eine Fachlogik, zwei Transporte
scripts/      smoke-test.ts (echter Server), mock-server.ts
```

**Harte Regel: `ui/` und `domain/` sprechen nie direkt mit dem Netz, nur über `src/api`.**

Zweite Regel: `methods.ts` enthält **ausschließlich** dokumentierte Methoden. Alles
Undokumentierte kommt nach `restApi` und bleibt dadurch an jeder Aufrufstelle sichtbar.

## Was man wissen muss, bevor man etwas ändert

**Datums-/Zeitformate sind Zahlen.** `WuDate` = `20260918`, `WuTime` = `1220` (12:20),
`WuColor` = `"EE7F00"` ohne `#`. Konverter ausschließlich aus `api/format.ts`. Leere Felder
lässt der Server weg → jedes optionale API-Feld ist im TS-Typ optional, und `tsconfig`
erzwingt `exactOptionalPropertyTypes` (also `{...(x === undefined ? {} : {x})}`-Muster statt
`x: undefined`).

**Proxy-Pfad exakt `/WebUntis`, Großschreibung.** WebUntis setzt `JSESSIONID` mit
`Path=/WebUntis; HttpOnly`; Cookie-Pfade sind case-sensitiv. Ein kleingeschriebener
Proxy-Pfad hat schon einmal jeden echten Login zerstört (TESTING.md Abschnitt 3, Bug 1).
Betrifft `vite.config.ts` und `sessionStore.ts`.

**Die Web-Version kann WebUntis nicht direkt aufrufen.** Kein
`Access-Control-Allow-Credentials` → Proxy zwingend (Dev: Vite; Produktion: geplanter PHP-Proxy
auf World4you, M11, **noch nicht gebaut** und deckt die `/WebUntis/api/*`-REST-Pfade laut
Planung noch nicht ab). Capacitor ist nicht betroffen.

**Das echte Schüler-Konto hat wenig Rechte** (gemessen, `mock/accounts.ts` spiegelt das 1:1):
gesperrt sind `getTeachers`, `getStudents`, `getExamTypes`, `getExams`, `getSubstitutions`,
`getTimetableWithAbsences`, `getClassregEvents`, `getClassregCategories` — alle mit Code
`-8509`. Jeder Screen muss degradieren statt zu crashen. Deshalb existieren die drei
REST-Workarounds (IDEEN.md B3/B3b/B8):

| Zweck | Endpunkt | Modul |
|---|---|---|
| Prüfungen | `GET /WebUntis/api/exams` | `api/examsRest.ts` |
| Abwesenheiten | `GET /WebUntis/api/classreg/absences/students` | `api/absencesRest.ts` |
| „Lehrstoff" | `GET /WebUntis/api/rest/view/v2/calendar-entry/detail` | `api/calendarEntryRest.ts` |

Alle drei hat der Nutzer selbst aus den DevTools der Original-Oberfläche geliefert und
ausdrücklich freigegeben. Ihr **Fehlerformat ist ungemessen** — nur grober HTTP-Status, kein
Retry. Weitere undokumentierte Endpunkte nur nach neuer, ausdrücklicher Freigabe.

**Zwei REST-Generationen, zwei Auth-Mechanismen (gemessen 2026-09-22, IDEEN.md B8 Fortsetzung).**
`api/exams`/`api/classreg/…` kommen mit dem `JSESSIONID`-Cookie allein aus (`client.getRest()`).
Die neuere `api/rest/view/v2/**`-Fläche (Pfadsegment `/view/v2/` ist das Erkennungsmerkmal)
braucht zusätzlich einen Bearer-Token aus `GET /api/token/new` — **ohne ihn kommt HTTP 404,
nicht 401/403**, sieht also wie "Endpunkt existiert nicht" aus, ist aber "kein gültiger Token".
`client.getRestBearer()` erledigt das automatisch (Token holen, cachen, bei 401/403 einmal neu
holen + wiederholen). Für jeden NEUEN undokumentierten Endpunkt unter `api/rest/**`: erst
`getRestBearer()` probieren, nicht `getRest()` — sonst wiederholt sich dieser Bug. Mocks
(`mock/calendarEntryRestMock.ts` `MOCK_BEARER_TOKEN`) prüfen den `Authorization`-Header
absichtlich streng, damit ein versehentlicher Rückfall auf `getRest()` sofort im Test auffällt.

**`getTimetable` verlangt Start/Ende innerhalb EINES Schuljahres** (`-8507`, R10). Zeiträume
immer über `getCurrentSchoolyear()`/`getSchoolyears()` klammern, nie ein festes ±N-Tage-Fenster.
Ob dieselbe Regel für andere Methoden gilt, ist ungemessen — also nicht annehmen.

**Perioden können ganztägig sein** (00:00–23:59, kein Fach) — real vorgekommen, nicht in der
Doku. `domain/timetable.ts` trennt sie ab 10 h Dauer nach `allDayBlocks`, sonst zerreißt es die
Zeitachse.

**Session lebt nur im Speicher.** Kein Passwort, keine sessionId in localStorage/sessionStorage;
Reload = abgemeldet. Bewusste Sicherheitsentscheidung, nur nach expliziter Freigabe ändern.
Persistiert werden nur Schulname, Theme und Fachfarben.

## Tests

Vitest, Default-Environment `node`. Komponententests brauchen `// @vitest-environment jsdom`
als **erste Zeile** der Datei. Fixtures in `src/api/__tests__/fixtures/` stammen wörtlich aus
der API-Doku; Fake-Daten halten sich an dieselben Formatregeln und werden von
`mock/__tests__/format-compliance.test.ts` dagegen geprüft.

## Arbeitsweise in diesem Projekt

- **Keine erfundenen API-Felder.** Was die Doku nicht hergibt, wird nicht behauptet — lieber
  ehrlich benennen (siehe B7: `bkText` heißt „Buchungshinweis", nicht „Lehrstoff", solange die
  Zuordnung unbestätigt ist).
- **Messungen von Annahmen trennen.** Jede Aussage in den Doku-Dateien trägt, ob sie gemessen
  oder vermutet ist, samt Datum. Diesen Stil beibehalten.
- **Kein toter Code.** Entfernter Scope wird gelöscht, nicht auskommentiert (B4/B5) — `git log`
  ist das Archiv.
- **Nach jeder Runde:** Tests + typecheck grün, dann PLAN.md/IDEEN.md/TESTING.md und die
  Status-Tabelle in README.md fortschreiben.
- **Git:** `origin` = `github.com/Emanschi/BetterWebUntis`, lokaler Branch `main`. **Push und
  Commit nur nach ausdrücklicher Erlaubnis je Runde, nie automatisch.**
- **Zugangsdaten erreichen nie eine Agenten-Session.** Smoke-Tests gegen den echten Server führt
  der Nutzer selbst im eigenen Terminal aus und bringt nur die Diagnose-Ausgabe zurück.

## Offen / als Nächstes

- **M9 Capacitor** (Android-Projekt + APK, iOS-Scaffold) — braucht JDK + Android SDK, beides
  nicht installiert.
- **M11 ICS-Abo-Feed** + Produktions-Proxy auf World4you — Proxy muss dann auch
  `/WebUntis/api/*` weiterleiten, nicht nur `jsonrpc.do`.
- Offene Messfragen stehen als Checkliste in TESTING.md (u. a.: funktionieren die REST-Pfade
  auch über den Proxy gegen den echten Server; wie sieht eine *entschuldigte* Abwesenheit aus;
  liefert die Schule echte `foreColor`/`backColor`; was der ganztägige Eintrag bedeutet).

## Umgebungs-Stolpersteine (Stand 2026-09-18)

- Repo liegt unter `/home/emanschi/Projekte/BetterWebUntis/BetterWebUntis` (doppelt
  verschachtelt) — PLAN.md Abschnitt 7 nennt noch den alten Pfad `/home/emanschi/Projects/BetterWebuntis`.
- **npm ist jetzt installiert** (per User-Wunsch, ohne root/sudo): CachyOS trennt `npm`
  vom `nodejs`-Paket, `sudo pacman -S npm` scheiterte ohne Passwort. Stattdessen wurde
  npm 11.19.0 aus dem offiziellen `node-v26.8.1-linux-x64.tar.xz` (Checksumme verifiziert)
  nach `~/.local/lib/node_modules/npm` entpackt, mit Symlinks `~/.local/bin/npm` und
  `~/.local/bin/npx` — läuft mit dem bereits vorhandenen System-`node`. `~/.local/bin` war
  schon vorher in PATH, kein Profil geändert. Bei Bedarf sauber ersetzbar durch
  `sudo pacman -S npm` (überschreibt/ergänzt dieselben PATH-Einträge).
- `npm install` (180 Pakete), `npm test` (259/259 grün), `npm run typecheck` (sauber),
  `npm run dev` und `npm run mock` — alle am 2026-09-18 verifiziert, funktionieren.
- Ein Lifecycle-Script wird von npm 11 standardmäßig geblockt: `msw`s Postinstall
  (generiert `mockServiceWorker.js` fürs Browser-Mocking). Unkritisch — dieses Projekt
  nutzt MSW nur serverseitig (`setupServer` in Tests), nie `setupWorker` im Browser. Bei
  Bedarf: `npm install-scripts approve msw`.
