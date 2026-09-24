# CLAUDE.md

Orientierung für Agenten-Sessions in diesem Repo. Projektsprache ist **Deutsch** —
Code-Kommentare, Commit-Messages, Doku und UI-Texte alle auf Deutsch.

## Was das ist

Modernere Alternative zur offiziellen WebUntis-App für **Schüler-Konten**. Ursprünglich nur
für die HTBLuVA St. Pölten (`htlstp.webuntis.com`, Schule `htlstp`) gebaut und dort auch
gemessen/getestet — seit B11 (IDEEN.md) ist der Produktions-Proxy aber schulunabhängig, die
App findet den richtigen Server über eine eingebaute Schulsuche (`api/schoolSearchRest.ts`).
React 19 + TypeScript (strict) + Vite + Tailwind v4, später Capacitor für APK/iOS (M9, noch
nicht gebaut). Reine Client-App, keine eigene Nutzerverwaltung, kein Backend außer einem
zustandslosen CORS-Proxy (`deploy/`).

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
npm test           # Vitest, Stand zuletzt: 309 Tests grün
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
public/       PWA-Manifest + Icons (Vite kopiert unverändert in den Build-Output, siehe
              index.html) — seit B12, IDEEN.md
```

**Responsive Layout-Werte über CSS-Variablen, nicht über JS-Viewport-Checks.** Siehe
`index.css`: `--bwu-px-per-minute`/`--bwu-time-axis-width` (Zeitraster-Dichte, B13
IDEEN.md), per `@media (max-width: 640px)` überschrieben — dieselbe Technik wie die
Theme-Tokens (`--bwu-bg` usw.). `TimetableScreen.tsx` baut daraus `calc()`-Strings
(`px()`/`pxAtLeast()`) statt fester JS-Multiplikation. Für einen neuen responsiven Wert:
diesem Muster folgen statt `window.innerWidth`/`matchMedia` in Komponenten abzufragen.

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
`Access-Control-Allow-Credentials` → Proxy zwingend (Dev: Vite, fest auf eine Schule aus
`VITE_WEBUNTIS_SERVER`; Produktion: `deploy/webuntis-proxy.php`, seit B11 schulunabhängig,
deckt alle fünf API-Pfade plus die Schulsuche ab, siehe deploy/README.md). Capacitor ist
nicht betroffen.

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
| Schulsuche (Name/Ort → Server) | `POST /WebUntis/schoolsearch` (Proxy) → `mobile.webuntis.com/ms/schoolquery2` | `api/schoolSearchRest.ts` |

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

**Produktions-Proxy kennt die Schule nicht mehr fest, sondern pro Request** (seit B11,
IDEEN.md). Der Client schickt den Server-Hostname als Header `X-WebUntis-Host`
(`WebUntisClientOptions.targetHost`, gesetzt über `createWebUntisClient({server, proxyBase})`)
— `deploy/webuntis-proxy.php` validiert ihn streng gegen `*.webuntis.com`, bevor er
weiterleitet (sonst offener Proxy, SSRF). Ein neuer undokumentierter Endpunkt unter
`api/rest/**` muss deshalb an ZWEI Stellen ergänzt werden: `ALLOWED_PATHS` in
`webuntis-proxy.php` UND (falls ein anderer Host als eine WebUntis-Schule gebraucht wird,
wie bei der Schulsuche) als eigene feste Zone dort. Der Dev-Proxy (`vite.config.ts`)
ignoriert diesen Header bewusst — er bleibt immer auf die eine in `VITE_WEBUNTIS_SERVER`
konfigurierte Schule fest, siehe die nächste Zeile.

**`deploy/webuntis-proxy.php` muss den `Authorization`-Header selbst weiterreichen — tut es
nicht automatisch.** Bug bis v1.2.0 (IDEEN.md B11 Fortsetzung): der Proxy baute seine
Weiterleitungs-Header nur aus `Accept`/`Cookie`/`Content-Type` zusammen, der Bearer-Token
für `calendar-entry/detail` (getRestBearer(), siehe oben) ging verloren → Lehrstoff nie
gefunden, obwohl alles andere lief. Zusätzliche Falle: Apache reicht `Authorization` vielen
PHP-Setups gar nicht erst in `$_SERVER['HTTP_AUTHORIZATION']` durch — deshalb liest
`incomingAuthorizationHeader()` mehrere Quellen, UND `deploy/.htaccess` erzwingt den Header
zusätzlich per `RewriteRule`. Bei jedem neuen Endpunkt, der eigene Auth-Header braucht (nicht
nur Cookie): hier drandenken, nicht nur an `ALLOWED_PATHS`.

**`vite.config.ts`-Fehler bei fehlendem `VITE_WEBUNTIS_SERVER` nur für `npm run dev`, nicht
für `npm run mock`/`npm run smoke`/`npm run build`.** `vite-node` (beide erstgenannten
Skripte) meldet intern denselben `command: "serve"` wie der echte Dev-Server — per
`ctx.command` lassen sie sich NICHT unterscheiden (empirisch geprüft, siehe IDEEN.md B11).
Die Unterscheidung läuft stattdessen über `process.env.npm_lifecycle_event === 'dev'`. Bei
Änderungen an `vite.config.ts`: immer alle vier `npm run`-Befehle gegenprüfen, nicht nur
`dev`/`build`.

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
- **Nach jeder Runde:** Tests + typecheck grün, dann PLAN.md/IDEEN.md/TESTING.md
  fortschreiben. **Seit 2026-09-22 bewusst NICHT mehr README.md:** README.md ist jetzt das
  öffentliche Aushängeschild (Features, Schnellstart) für Leute, die übers GitHub-Repo
  reinschauen — der laufende Entwicklungsstand/die Milestone-Historie gehört ausschließlich
  in PLAN.md/IDEEN.md/TESTING.md. README.md nur anfassen, wenn sich ein öffentlich
  sichtbares Feature oder der Installationsweg selbst ändert, nicht bei jeder Runde.
- **Git:** `origin` = `github.com/Emanschi/BetterWebUntis`, lokaler Branch `main`. **Push und
  Commit nur nach ausdrücklicher Erlaubnis je Runde, nie automatisch.**
- **Zugangsdaten erreichen nie eine Agenten-Session.** Smoke-Tests gegen den echten Server führt
  der Nutzer selbst im eigenen Terminal aus und bringt nur die Diagnose-Ausgabe zurück.

## Offen / als Nächstes

- **M9 Capacitor** (Android-Projekt + APK, iOS-Scaffold) — braucht JDK + Android SDK, beides
  nicht installiert.
- **M11 ICS-Abo-Feed** — eigener, zustandsloser Proxy (`deploy/webuntis-proxy.php`, seit
  B11 schulunabhängig) deckt das NICHT ab: ein Abo-Feed bräuchte serverseitig gespeicherte
  (verschlüsselte) Zugangsdaten, ein komplett getrennter, zustandsbehafteter Dienst
  (siehe IDEEN.md B2).
- `deploy/webuntis-proxy.php` in der aktuellen (B11-)Fassung wurde noch nicht gegen einen
  echten Apache+PHP-Host deployt/getestet (kein `php -l` in dieser Umgebung verfügbar).
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
