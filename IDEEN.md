# IDEEN.md

Offene Fragen und Feature-Ideen. **Nichts hier wird ohne ausdrückliche Freigabe umgesetzt.**

---

## A) Offene Fragen – Funktionen ohne Entsprechung in der API-Doku

Die JSON-RPC-Doku vom 20.09.2018 enthält für Folgendes **keine** Methode. Es wird deshalb nichts erfunden.

### A1 – Mitteilungen / Nachrichten *(Pflichtpunkt 6 des Auftrags)*
Kein dokumentierter Endpunkt. Mit dieser API nicht umsetzbar.
Optionen: (a) Feature entfällt, (b) das offizielle WebUntis-Web-Frontend nutzt intern `/WebUntis/api/rest/view/v1/messages` – das steht *nicht* in der Doku und wäre eine undokumentierte Schnittstelle. **Entscheidung offen.**

### A2 – Kontaktdaten ändern
Keine Schreib-Methode dokumentiert. Anzeige ist teilweise über Masterdata möglich (`getStudents`/`getTeachers`: Name, Vorname, Geschlecht, `key`), Änderung nicht. → nur Read-only, Bearbeiten-Button entfällt.

### A3 – Passwort ändern
Keine Methode dokumentiert. → entfällt, stattdessen Link ins offizielle WebUntis.

### A4 – „Meine Termine / Sprechstunden" *(Pflichtpunkt 4)*
Keine eigene Methode. Rekonstruierbar aus:
- `getTimetable` (customizable) → Perioden mit `lstype: "oh"` (office hour), `"sb"` (standby), `"bs"` (break supervision)
- `getSubstitutions` → Einträge mit `type: "oh" | "sb" | "bs"`
- `getExams` → Prüfungstermine
Das ist eine Annäherung, kein 1:1-Ersatz für die Terminverwaltung der Original-App. **Bestätigung erwünscht, ob das reicht.**

### A5 – Abwesenheiten entschuldigen / Entschuldigung einreichen
`getTimetableWithAbsences` ist rein lesend (`excuseStatus` wird nur gemeldet). Keine Schreib-Methode. → Read-only.

### A6 – Hausaufgaben
Nicht in der Doku. → entfällt.

---

## B) Architektur-Entscheidungen, die Rückfrage brauchen

### B1 – CORS-Proxy für die Web-Version — **entschieden**
*Gemessen am 2026-09-10 (siehe `TESTING.md`):* `htlstp.webuntis.com` spiegelt die Request-Origin in `Access-Control-Allow-Origin`, sendet aber **kein** `Access-Control-Allow-Credentials`. Requests mit `credentials: "include"` — nötig für `JSESSIONID` — werden vom Browser blockiert. Das Cookie ist zusätzlich `HttpOnly`, JS kann es also weder lesen noch selbst setzen.

**Entscheidung:** Dev über den Vite-Proxy, Produktion über einen zustandslosen PHP-Proxy auf World4you. Android/iOS brauchen ihn nicht (`CapacitorHttp` requestet nativ).
Der Proxy hält **keinen** Zustand: er leitet den POST-Body an `jsonrpc.do` weiter und reicht `JSESSIONID` in beide Richtungen durch. Keine Datenbank, keine Nutzerverwaltung, keine Logs mit Zugangsdaten.

*Erledigt:* Der Proxy ist nachweislich zwingend — der echte Login-Test (M10, 2026-09-16) zeigte sofort ein Cookie-Path-Problem, das erst durch eine Proxy-Anpassung (Pfad exakt `/WebUntis`, siehe TESTING.md) behoben wurde. Die deprecated `;jsessionid=`-Variante ist damit ohnehin hinfällig, ein Test darauf entfällt.

**Produktions-Proxy gebaut, 2026-09-24 (Nutzerwunsch: Deploy-Anleitung für die eigene
World4You-Subdomain).** `deploy/webuntis-proxy.php` + `deploy/.htaccess` + `deploy/README.md`
— deckt alle fünf tatsächlich genutzten Pfade ab (jsonrpc.do + die vier REST-Endpunkte aus
B3/B3b/B8), nicht nur jsonrpc.do wie in PLAN.md R8 ursprünglich als Lücke vermerkt. Feste
Positivliste exakter Pfade (kein Prefix-Match) — ein unbekannter Pfad wird mit 404
abgelehnt, damit das Skript kein offener Proxy für beliebige Ziele werden kann
(SSRF-Vermeidung). `WEBUNTIS_HOST` fest einprogrammiert, keine Datenbank, keine
Nutzerverwaltung, keine Logs mit Zugangsdaten — wie hier seit 2026-09-10 geplant.

**Noch nicht real getestet:** kein Zugriff auf einen echten PHP-Server in dieser Umgebung,
auch kein `php -l` verfügbar (nur Klammern-Balance manuell geprüft). Der Nutzer muss das
einmal selbst gegen seine World4You-Subdomain verifizieren (siehe `deploy/README.md`
"Testen").

### B2 – ICS-Abo-Feed — **entschieden: beides, in dieser Reihenfolge**
1. **M8 — ICS-Datei-Export** (rein clientseitig, kein Server, keine gespeicherten Zugangsdaten). Prüfungen aus `getExams` je `examTypeId` einsammeln, als `.ics` herunterladen.
2. **M11 — Abo-Feed auf World4you.** Ein Kalenderabo wird ohne Nutzerinteraktion abgerufen, also *muss* serverseitig gegen WebUntis authentifiziert werden. Das wird bewusst isoliert gebaut, statt es zu verstecken:
   - eigener Endpunkt, komplett getrennt vom Proxy aus B1
   - Zugangsdaten verschlüsselt at rest, Schlüssel nicht im Web-Root
   - geheime, zufällige Feed-URL je Nutzer, jederzeit widerrufbar
   - stabile `UID` je Prüfung + hochzählende `SEQUENCE`, damit verschobene Prüfungen im Kalender nachgezogen und gelöschte als `STATUS:CANCELLED` markiert werden
   - der Feed liest ausschließlich Prüfungen, nichts sonst

   **Offene Fragen an den Auftraggeber, bevor M11 startet:**
   - Welche PHP-Version läuft auf World4you? Ist `curl`/`openssl` verfügbar?
   - Gibt es Cron? (Ohne Cron wird bei jedem Feed-Abruf live gegen WebUntis authentifiziert — einfacher, aber langsamer und näher am Rate-Limit.)
   - Nur für dich selbst, oder sollen Mitschüler den Feed auch nutzen können? Das ändert das Sicherheitsmodell erheblich.

### B3 – Prüfungen für Schüler-Konten — **gelöst, 2026-09-17 (undokumentierter REST-Endpunkt)**

**Kurzfassung:** `getExams` und `getExamTypes` sind für echte Schüler-Konten an der HTL St. Pölten beide gesperrt (Code -8509, direkt gemessen). Ein Feld im Stundenplan hilft auch nicht — echte Prüfungsstunden haben weder `lstype` noch `code`. Gelöst über `GET /WebUntis/api/exams`, einen undokumentierten REST-Endpunkt, den der Nutzer aus den Browser-DevTools der originalen WebUntis-Oberfläche kopiert und dessen Nutzung ausdrücklich freigegeben hat.

**Der Weg dorthin (drei Runden, damit klar ist, was schon probiert und verworfen wurde):**
1. *2026-09-16:* `getExamTypes` gemessen → gesperrt. Erster Schluss: "Prüfungen sind für dieses Konto tot." War voreilig, siehe unten.
2. *2026-09-17, erste Nachmessung:* `getExams` selbst nie einzeln getestet (eigenes Recht laut Doku, "examinations read", getrennt von "examtypes read"). `scripts/smoke-test.ts` erweitert, probiert `getExams` jetzt direkt mit den IDs 1–10 — Ergebnis: ebenfalls durchgehend gesperrt. Zusätzlich ein Diagnose-Block, der das ganze Schuljahr über `getTimetable` lädt: **kein einziges** der 1466 geladenen Perioden hatte `lstype` gesetzt — auch nicht die echte Prüfungsstunde (18.09.2026, 12:20–13:10, Fach NW2). Sie unterschied sich strukturell überhaupt nicht von einer normalen Stunde, nur ein freier `info`-Text ("SMÜ Nomenklatur") war zu sehen.
3. *2026-09-17, zweite Runde:* Drei Optionen zur Wahl gestellt (undokumentierte Schnittstelle nutzen / Text-Heuristik auf Notizen / Feature aufgeben). Nutzer entscheidet sich für die undokumentierte Schnittstelle und liefert sie selbst: `GET /WebUntis/api/exams?startDate=…&endDate=…&studentId=…&withGrades=true&klasseId=-1`, Antwort `{"data":{"exams":[…]}}` mit `examType`, `subject`, `examDate`, `startTime`/`endTime`, `teachers`, `rooms`, `text`, `grade` — bereits aufgelöste Kurzcodes, keine weiteren Nachschlage-Calls nötig. Volle Details, Risiko und die gemessene Beispielantwort: `src/api/examsRest.ts`.

**Umgesetzt:**
- `src/api/examsRest.ts` — eigener Namensraum `restApi` (siehe `api/index.ts`), bewusst getrennt von `methods.ts`, damit an jeder Aufrufstelle sichtbar bleibt, was dokumentiert ist und was nicht.
- `WebUntisClient.getRest()` (`api/client.ts`) — neue GET-Fähigkeit neben dem bestehenden JSON-RPC-`call()`, teilt sich Warteschlange/Drosselung damit. `RpcTransport` (`api/transport.ts`) entsprechend um `sendGet` erweitert (Fetch- und Capacitor-Transport).
- `ExamsScreen.tsx` ruft `restApi.getExamsRest()` statt `getExamTypes`/`getExams`; die Schuljahr-Auswahl (`getSchoolyears`) bleibt, damit nicht die komplette Historie auf einmal geladen wird.
- `domain/ics.ts` baut jetzt auf `RestExam` statt `Exam`/`Period` — die UID wird bewusst NICHT aus `exam.id` gebaut (in der echten Antwort war das Feld `0`, keine verlässliche Kennung), sondern aus Datum+Uhrzeit+Fach.
- Mock: `mock/examsRestMock.ts` simuliert denselben Endpunkt für Tests/den lokalen Mock-Server, mit denselben fünf Fixterminen wie der Stundenplan-Mock. `mock/timetable.ts` setzt für die Prüfungsstunde kein `lstype` mehr, nur noch einen freien `info`-Text (`RawPeriod.isExamSlot` als rein interner Marker für die weiterhin simulierte `getExams`/`getExamTypes`-Methode, falls eine Schule die doch mal erlaubt).

**Bewusst nicht (noch) gemessen/gebaut:**
- Das Fehlerformat dieses Endpunkts (z. B. bei abgelaufener Session) — nur grob als HTTP-Status behandelt.
- Der geplante Produktions-Proxy (M11, World4you) leitet laut B1 nur `jsonrpc.do` weiter — für diesen Endpunkt muss er erweitert werden, bevor er in Produktion funktioniert (im Dev-Vite-Proxy, der den ganzen `/WebUntis`-Präfix weiterleitet, funktioniert er schon).
- Für Lehrer-Konten ergibt `studentId` inhaltlich keinen Sinn (der Endpunkt heißt im Original-Frontend "studentexams") — für den aktuellen Scope (vorerst nur Schüler-Konten, siehe B4) irrelevant, aber falls das Konto später auf Lehrer erweitert wird, braucht Prüfungen dort einen anderen Weg.

**Backlog-Idee (nicht beauftragt):** die neuen Prüfungsdaten mit dem Stundenplan kreuzreferenzieren, um Prüfungsstunden dort wieder optisch zu markieren (ging vorher über `lstype`, jetzt nicht mehr) — siehe Abschnitt C.

### B3b – Abwesenheiten — **gelöst, 2026-09-17 (derselbe Weg wie B3: undokumentierter REST-Endpunkt)**
Erste Runde: `getTimetableWithAbsences` bleibt gesperrt (Code -8509), und anders als bei Prüfungen gab es kein Stundenplan-Feld zum Umgehen. Tab zunächst auf Nutzerwunsch entfernt.

Zweite Runde, direkt im Anschluss an B3: Da der REST-Workaround bei Prüfungen funktioniert hat, lag nahe, dass die "Abwesenheiten"-Seite der Original-Oberfläche denselben Aufbau hat. Der Nutzer hat selbst in den Browser-DevTools nachgesehen und den Endpunkt gefunden:

```
GET /WebUntis/api/classreg/absences/students?startDate=20260907&endDate=20270704&studentId=<eigene personId>&excuseStatusId=-1

{"data":{"absences":[{"id":1350715,"startDate":20260911,"endDate":20260911,
  "startTime":750,"endTime":915,"reasonId":0,"reason":"","text":"",
  "isExcused":false,"excuseStatus":null,
  "excuse":{"id":-1,"text":"","excuseDate":0,"excuseStatus":"","isExcused":false,"userId":-1,"username":""}}],
  "absenceReasons":[],"excuseStatuses":null,"showAbsenceReasonChange":false,"showCreateAbsence":false}}
```

Bestätigt auch die frühere Beobachtung: der Eintrag mit Status "?" aus dem allerersten Screenshot entspricht genau `isExcused: false, excuseStatus: null` — eine noch nicht bearbeitete Abwesenheit, kein separater Selbstmelde-Workflow.

**Umgesetzt:** `AbsencesScreen.tsx` wieder da (Route/Nav zurück), liest jetzt `restApi.getAbsencesRest()` (`api/absencesRest.ts`) statt `getTimetableWithAbsences`. Gleiche Schuljahr-Auswahl wie bei Prüfungen — dafür wurde `defaultSchoolyearId` aus `ExamsScreen.tsx` nach `domain/schoolyear.ts` extrahiert und ein gemeinsamer Hook/Component (`useSchoolyearSelection`, `SchoolyearSelect`) gebaut, den beide Screens nutzen. Zeigt Datum(-spanne), Uhrzeit, Dauer, Status (entschuldigt/nicht entschuldigt aus dem zuverlässigen `isExcused`-Boolean) und Grund/Text, falls vorhanden.

**Bewusst nicht übernommen:** `createDate`/`lastUpdate` (Unix-Zeitstempel), `createdUser`/`updatedUser` (interne Kürzel der Schulverwaltung), `canEdit`, `interruptions`, `studentName`, das verschachtelte `excuse`-Objekt — dieselbe Begründung wie bei `examsRest.ts`. Nur ein Beispiel gemessen (eine unbearbeitete Abwesenheit) — wie eine bereits entschuldigte aussieht, ist unklar.

**Konsequenz für M11 (Kalenderabo):** betrifft laut B2 nur Prüfungen, nicht Abwesenheiten — hier ohne Auswirkung.

### B4 – Scope-Entscheidung 2026-09-17: vorerst nur Schüler-Konten, "Termine" und "Profil" entfernt
Nutzer-Feedback: die App soll vorerst ausschließlich Schüler-Konten unterstützen. Die Tabs "Meine Termine" (IDEEN.md A4, Pflichtpunkt 4 des ursprünglichen Auftrags) und "Profil" werden nicht gebraucht — beide Screens, ihre Routen und die zugehörige Domain-Funktion (`appointmentPeriods`) wurden entfernt, nicht nur ausgeblendet (Repo soll keinen toten Code tragen). Bei Bedarf über `git log` wiederherstellbar — die Funktion war vollständig getestet.
**Achtung:** A4 war Pflichtpunkt 4 des ursprünglichen Auftrags — diese Entfernung ist eine bewusste, aber vorläufige Scope-Reduktion ("vorerst"), keine endgültige Streichung der Anforderung.

### B5 – Scope-Entscheidung 2026-09-17: Elementwechsel nur noch Klassen
Nutzer-Feedback: bei "Anderen Plan ansehen" (M6) nur die Klassen-Funktion behalten, die Lehrer-/Fach-/Raum-Suche entfernen. `ElementPicker.tsx` hatte vier Tabs (Klasse/Lehrer/Fach/Raum); jetzt gibt es nur noch das Klassen-Suchfeld, keine Tabs mehr. `elementRoutes.ts`s Segment-Zuordnung (`ELEMENT_TYPE_SEGMENTS`/`ELEMENT_TYPE_LABELS`) entsprechend auf `klasse` gekürzt — als Map belassen (nicht hart verdrahtet), da die eigentliche Trennung URL-Segment ↔ `ElementType` ↔ Anzeigename auch mit einem Eintrag sinnvoll bleibt.

Nebeneffekt: `getTeachers` war für echte Schüler-Konten ohnehin gesperrt (Code -8509, siehe TESTING.md) — der Lehrer-Tab wäre für den Hauptanwendungsfall (Schüler-Konto) real nie benutzbar gewesen. `getSubjects`/`getRooms` funktionieren dagegen real (waren also keine kaputte Funktion, sondern eine bewusst nicht mehr gewollte). Die API-Methoden selbst (`getTeachers`/`getSubjects`/`getRooms` in `api/methods.ts`) bleiben unverändert bestehen, nur ihre einzige UI-Aufrufstelle ist weg — falls sich das später ändert, sind sie sofort wieder nutzbar.

Die Routen `/timetable/lehrer/:id` etc. existieren technisch nicht mehr (nicht mehr in `ELEMENT_TYPE_SEGMENTS`) — ein direkt eingegebener Link dieser Art zeigt jetzt denselben "ungültiger Link"-Fehler wie ein Tippfehler, statt eines Absturzes.

### B6 – Modernere Fach-Karten, Detailansicht, Fachfarben-Einstellungen (Nutzerwunsch 2026-09-17)
Drei zusammenhängende Änderungen an der Kalender-Ansicht:

**1. Ganzflächig gefüllte Fach-Karten statt nur einem linken Farbstreifen.** `TimetableBlockCard.tsx` füllt jetzt den ganzen Kartenhintergrund mit der Fachfarbe. Die Textfarbe kommt aus `domain/colors.ts` (neu: `contrastForeground()`, WCAG-Kontrastformel) — bei generierten und selbst gewählten Farben berechnet, bei von der Schule gelieferten `foreColor` unverändert übernommen (siehe Test in `colors.test.ts`, das war schon vorher so und bewusst nicht angetastet). Dadurch funktioniert es automatisch in Light und Dark Mode, ohne die Fachfarbe selbst je Theme zu verändern — entspricht dem, wie die Original-App und die meisten Kalender-Apps das lösen. Entfall bleibt bewusst neutral/grau statt farbig (sonst sähe eine ausgefallene Stunde aus wie eine stattfindende); Vertretung/Raumänderung und der lstype-Badge (z. B. "Prüfung") bekommen eine halbtransparente Pille als Hintergrund, die auf jeder Fachfarbe lesbar bleibt.

**2. Elemente des Stundenplans lassen sich öffnen.** Klick auf eine Stunde (auch auf einen ganztägigen Eintrag im Banner) öffnet ein Modal (`ui/components/Modal.tsx`, neu — generisch, per ✕/Escape/Hintergrundklick schließbar) mit der vollständigen Detailansicht (`ui/components/PeriodDetail.tsx`, neu): Fach (Langname), Datum, Uhrzeit+Dauer, Lehrkraft, Raum, Klasse/Gruppe, Status, sowie `substText`/`info`/`lstext`, falls vorhanden. Eine eigene "Lehrstoff"-Angabe gibt es in der 2018er-API nicht — das nächstliegende Konzept dafür (`getClassregEvents`, Klassenbuch) ist für echte Schüler-Konten ohnehin gesperrt (siehe `mock/accounts.ts` `missingRights`), deshalb wurde hier nichts erfunden, sondern nur gezeigt, was tatsächlich vorhanden ist.

**3. Fachfarben-Einstellungen** (`ui/screens/SettingsScreen.tsx`, neuer Tab "Einstellungen"). Zeigt nur Fächer, die im eigenen Stundenplan tatsächlich vorkommen (Abgleich `getTimetable` ↔ `getSubjects`), nicht den ganzen Schulkatalog (495 Einträge laut TESTING.md). Eine kuratierte Farbpalette (18 Töne) plus ein natives `<input type="color">` für freie Wahl; "Zurücksetzen" entfernt die eigene Farbe wieder. **Wichtig:** die Übersteuerung funktioniert unabhängig davon, ob die Schule selbst `foreColor`/`backColor` liefert oder nicht — das war ursprünglich als Bedingung formuliert ("nur falls keine Schulfarbe da ist"), aber ob das bei dieser Schule zutrifft, ist laut TESTING.md nach wie vor ungeklärt. Eine Übersteuerung, die immer funktioniert, ist strikt nützlicher als eine, die nur manchmal angeboten wird — deshalb diese Entscheidung ohne Rückfrage getroffen.

**Speicherung — Antwort auf die Nutzerfrage "geht das?":** `localStorage`, nicht Cookies (`state/subjectColorStore.ts`, gleiches Muster wie `themeStore.ts`). Cookies wären hier die schlechtere Wahl: sie würden bei jeder Anfrage an den WebUntis-Proxy mitgeschickt (unnötig, die Farben betreffen nur die UI), und für strukturierte Pro-Fach-Daten bräuchte es ohnehin JSON-Kodierung. Für die spätere Capacitor-App (M9) funktioniert derselbe Code unverändert weiter: Capacitor bettet eine echte WebView ein, deren `localStorage` genauso persistiert wie im Desktop-Browser — **ja, das geht**, ganz ohne App-Store-Reinstallation oder Sonderbehandlung. Einzige Einschränkung: das lässt sich erst nach M9 (noch nicht gebaut) am echten Gerät verifizieren. Falls sich `localStorage` unter Android als nicht robust genug erweist (z. B. wenn das System die WebView-Daten unter Speicherdruck räumt), wäre `@capacitor/preferences` der nächste Schritt — für jetzt reicht derselbe Mechanismus, der schon Theme und Schulname zuverlässig merkt.

**Manuell verifiziert** (Mock-Server, Light und Dark Mode): gefüllte Karten in beiden Themes lesbar, Entfall/Vertretung/Prüfungs-Badge weiterhin klar erkennbar, Klick öffnet die Detailansicht mit allen Feldern, "Farbe anpassen"-Link führt zu Einstellungen, Farbwahl wirkt sofort auf dem Stundenplan (beide Vorkommen der Doppelstunde), Zurücksetzen stellt die generierte Farbe wieder her.

### B7 – Settings-Absturz behoben, Buchungshinweis statt erfundenem "Lehrstoff", Prüfungs-Sprung, Tages-/Wochenansicht (Nutzerwunsch 2026-09-17)

Vier zusammenhängende Nachbesserungen, alle aus demselben Feedback nach dem ersten Live-Test des Kalender-Redesigns (B6):

**1. `-8507`-Absturz beim Öffnen der Einstellungen — behoben.** `SettingsScreen.tsx` fragte den eigenen Stundenplan bisher über ein naives ±180-Tage-Fenster ab. Gegen den echten Server ergab das einen bisher unbekannten Fehlercode: `getTimetable` verlangt `startDate`/`endDate` **innerhalb eines einzigen Schuljahres** — ein Fenster, das über eine Schuljahresgrenze hinausreicht, wird abgelehnt (`-8507 startDate and endDate are not within a single school year`, neu in `api/errors.ts`, `describeError`-Text ergänzt). Behoben durch dieselbe Schuljahres-Klammerung, die Prüfungen/Abwesenheiten schon nutzen: `getCurrentSchoolyear()` statt eines festen Tage-Fensters. Mock (`mock/rpcHandler.ts`) validiert dieselbe Regel jetzt auch, bewusst nur für `getTimetable` — für `getSubstitutions`/`getExams`/`getTimetableWithAbsences` wurde das nie gemessen, dort also nicht angenommen.

**2. Kein erfundenes "Lehrstoff"-Feld — stattdessen ehrlich benannt, was die API wirklich hergibt.** Nutzerwunsch war, dass von Lehrkräften eingetragene Notizen/Lehrstoff in der Detailansicht sichtbar werden. Die 2018er-Doku hat dafür kein Feld namens "Lehrstoff". Das einzige dokumentierte, bisher ungenutzte Perioden-Feld in diese Richtung ist `bkText`/`bkRemark` (Abschnitt 15, `showBooking: true` in den `options`) — jetzt angefragt und in `PeriodDetail.tsx` als **"Buchungshinweis"/"Buchungsvermerk"** angezeigt, nicht als "Lehrstoff", weil diese Zuordnung nicht verifiziert ist (das Feld heißt im Original-Kontext eher nach Raum-/Ressourcenbuchung). Der naheliegendere Kandidat für echten Lehrstoff ist `getClassregEvents` (Klassenbuch, Abschnitt 20) — bisher nie gegen das echte Schüler-Konto gemessen (die "gesperrt"-Annahme in `mock/accounts.ts` war bloß übernommen, nicht selbst verifiziert). `scripts/smoke-test.ts` fragt das jetzt in der Rechte-Probe mit ab; Ergebnis steht noch aus.

**3. Klick auf eine Prüfung springt im Stundenplan zur passenden Woche/zum passenden Tag, mit Neon-Hervorhebung.** `ExamsScreen.tsx` verlinkt jetzt jede Prüfungskarte ("Im Stundenplan anzeigen →") auf `/timetable?highlightDate=…&highlightStart=…&highlightEnd=…`. `TimetableScreen.tsx` liest diese Parameter beim Mount, springt direkt zur richtigen Woche (statt zur aktuellen), findet den passenden Block per Zeit-Intervall-Überlappung und legt für `3,2` Sekunden einen pulsierenden roten Neon-Rahmen an (`index.css`, `@keyframes bwu-neon-pulse`, bewusst themeunabhängig fest rot, nicht an Fachfarbe gekoppelt — der Rahmen muss unabhängig von der darunterliegenden Farbe auffallen).

**4. Tages-/Wochenansicht umschaltbar.** Bisher gab es nur eine feste Wochenansicht. `TimetableScreen.tsx` hat jetzt einen Woche/Tag-Tab-Umschalter; im Tagesmodus bewegen Vor/Zurück einen einzelnen Tag statt einer Woche (auch über Wochengrenzen hinweg, da `weekStart` jetzt aus `selectedDate` abgeleitet wird, keine eigene Zustandsvariable mehr ist).

**Umgesetzt:**
- `src/ui/screens/SettingsScreen.tsx`, `src/api/errors.ts`, `src/mock/rpcHandler.ts` (Punkt 1)
- `src/domain/timetable.ts` (`bookingText`/`bookingRemark`), `src/ui/components/PeriodDetail.tsx`, `src/mock/timetable.ts` (Punkt 2)
- `src/ui/screens/ExamsScreen.tsx`, `src/ui/screens/TimetableScreen.tsx`, `src/ui/components/TimetableBlockCard.tsx`, `src/index.css` (Punkt 3)
- `src/ui/screens/TimetableScreen.tsx` (Punkt 4)

**Manuell verifiziert** (Mock-Server, `mmuster`, Light **und** Dark Mode):
- Einstellungen öffnet ohne Fehler, zeigt weiterhin nur die 7 tatsächlich eingeplanten Fächer
- BSP-Doppelstunde (Dienstag) zeigt "Halle 2 reserviert"/"Geräte bitte danach wieder wegräumen" im Modal
- Klick auf die 2. bzw. 3. Prüfung in "Prüfungen" springt zur korrekten Woche (16.11.–22.11.2026 bzw. 25.01.–31.01.2027) und zeigt den roten Neon-Rahmen auf dem richtigen Block
- Woche/Tag-Umschalter wechselt korrekt zwischen Ansichten, Tagesnavigation bewegt einzelne Tage inkl. Wochenwechsel, zeigt weiterhin Warnungen (z. B. Raumänderung) im Tagesmodus

**Bewusst nicht (noch) gemessen:**
- Ob `bkText`/`bkRemark` bei dieser Schule real jemals befüllt ist (bisher nur simuliert)
- Ob `getClassregEvents` für das echte Schüler-Konto tatsächlich gesperrt ist oder doch erreichbar — nie gemessen, nur angenommen (siehe Punkt 2, `scripts/smoke-test.ts`)

### B8 – Echtes "Lehrstoff"-Feld gefunden (undokumentierter REST-Endpunkt) + Rücksprung zu heute (Nutzerwunsch 2026-09-17)

B7 hatte offen gelassen, ob `bkText`/`bkRemark` wirklich "Lehrstoff" meint, und `getClassregEvents` als wahrscheinlicheren, aber ungemessenen Kandidaten benannt. Der Nutzer hat die Frage direkt beantwortet: mit einem Screenshot der echten WebUntis-Detailansicht ("Lehrstoff") und dem dazugehörigen Netzwerk-Request aus den Browser-DevTools — derselbe Weg wie bei B3/B3b (Prüfungen/Abwesenheiten), Nutzung wieder ausdrücklich freigegeben (siehe A1):

```
GET /WebUntis/api/rest/view/v2/calendar-entry/detail?elementId=<eigene personId>&
  elementType=5&startDateTime=2026-09-18T11:20:00&endDateTime=2026-09-18T12:10:00&
  homeworkOption=DUE

{"calendarEntries":[{"id":9059380, …, "teachingContent":"Diskussionsthemen sammeln\n
  andere überzeugen: Gurkerl Sommerferien\nReferatstermine und -themen\n
  Bekanntgabe der Beurteilungskriterien", …}]}
```

Ein eigener Endpunkt für die Detailansicht EINES aufgeklappten Stundenplan-Eintrags, identifiziert über die exakte Start-/Endzeit (ISO-Format, lokale Zeit, kein Offset) statt über eine Perioden-Id — passt architektonisch nicht zu den Datumsbereich-Endpunkten aus B3/B3b, deshalb ein eigener Mock-Handler statt Wiederverwendung von `handleDateRangeRest`. `elementType=5` bestätigt nebenbei, dass `PersonType.STUDENT` und `ElementType.STUDENT` tatsächlich denselben Wert (5) verwenden.

**Umgesetzt:**
- `src/api/calendarEntryRest.ts` — neues `restApi`-Modul, nur `teachingContent` übernommen (das reale Objekt enthält deutlich mehr, siehe Datei-Kommentar); `api/format.ts` bekam einen Schreiber (`wuDateTimeToIsoLocal`) für das ISO-Zeitformat.
- `ui/components/PeriodDetail.tsx` zeigt "Lehrstoff" (mehrzeilig, `whitespace-pre-line`, da `teachingContent` echte Zeilenumbrüche enthält) zwischen den bestehenden Status-Feldern und dem Buchungshinweis.
- `TimetableScreen.tsx` fragt das erst ab, wenn eine Periode tatsächlich geöffnet wird (eigener `useQuery`, `retry: false` wegen ungemessenem Fehlerformat) — nicht für die ganze Woche vorab, genau wie die Original-Oberfläche das pro Klick lädt. Nur für den eigenen Plan (nicht bei "Anderen Plan ansehen") — für ein fremdes Element ist das nie gemessen worden.
- Mock: `mock/calendarEntryRestMock.ts`, Fixture auf dem Montags-Deutsch-Slot (`mock/timetable.ts`, `hasTeachingContent`) — bewusst eine EINZELNE Stunde, keine Doppelstunde (siehe Einschränkung unten).

**Bewusst nicht (noch) gemessen/übernommen:**
- Doppelstunden: der Endpunkt identifiziert einen Eintrag über die exakte Einzelstunden-Zeitspanne, eine im Stundenplan zusammengefasste Doppelstunde hat aber nur die äußeren Grenzen als `TimetableBlock.startTime/endTime` (siehe `domain/timetable.ts`). Eine Anfrage mit den zusammengefassten Grenzen wird deshalb vermutlich keinen Treffer liefern — nicht als Sonderfall behandelt, degradiert einfach zu "kein Lehrstoff sichtbar", kein Absturz.
- `notesAll`/`notesStaff` (Notizfelder, in der gemessenen Antwort beide `null`) und `homeworks` — nicht übernommen, da nie mit Inhalt gemessen und nicht angefragt.
- Fehlerformat bei abgelaufener Session/fehlendem Recht — wie bei B3/B3b ungemessen.

**Zweiter Teil derselben Nachricht — Rücksprung zu "heute" über die Hauptnavigation:** Klickt man auf "Stundenplan" in der Navigation, während man auf einen anderen Tag/eine andere Woche vorgeblättert hat, sprang bisher nichts zurück — React Router remountet `TimetableScreen` nur bei einem echten Pfadwechsel, ein Klick auf einen Link, der schon aktiv ist, ändert nichts. Gelöst über einen `?resetToToday=1`-Marker im Link-Ziel (`AppShell.tsx`), den `TimetableScreen.tsx` per Effekt konsumiert (Datum auf heute, aktiven Highlight beenden) und sofort wieder aus der URL entfernt — dadurch bleibt der Link beim nächsten Klick erneut wirksam. `viewMode` (Tag/Woche) bleibt bewusst unverändert, wie ausdrücklich gewünscht ("je nachdem was eingestellt ist").

**Manuell verifiziert** (Mock-Server, `mmuster`, Light **und** Dark Mode):
- Lehrstoff erscheint mehrzeilig, mit erhaltenen Zeilenumbrüchen, im Detail-Modal des Montags-Deutsch-Slots
- Drei Wochen vorblättern, dann auf "Stundenplan" in der Navigation klicken: springt zur aktuellen Woche zurück
- Dasselbe in der Tagesansicht: vier Tage vorblättern, "Stundenplan" klicken → zurück zum heutigen Tag, Tagesansicht bleibt aktiv (kein Zurückfallen auf Wochenansicht)

**Fortsetzung 2026-09-22 — Notizen/Hausaufgaben (`notesAll`/`notesStaff`/`homeworks`): Bearer-Token-Hypothese bestätigt und eingebaut.**
Nutzerwunsch war, dieselben "Zusatzinformationen" auch für die noch nicht übernommenen Felder
aus derselben gemessenen Antwort zu zeigen (siehe oben: "Das reale Objekt enthält zusätzlich …
`notesAll`/`notesStaff` … `homeworks`"). Dabei zeigte sich zuerst ein Rückschlag: alle 34
Perioden der laufenden Woche lieferten HTTP 404 — nicht nur "kein Treffer" (das wäre HTTP 200
mit leerem `calendarEntries`), sondern der Endpunkt insgesamt, für jede Periode gleich. Eine
echte Abweichung vom bisher gemessenen Verhalten (2026-09-17 funktionierte derselbe Endpunkt
für dieselbe Art Anfrage noch).

**Ursache gefunden und bestätigt (Rohdaten: TESTING.md):** die neuere `api/rest/**`-Fläche von
WebUntis (auf die auch `calendar-entry/detail` fällt, erkennbar am `/view/v2/`-Pfadsegment)
braucht einen separaten Bearer-Token, den `GET /WebUntis/api/token/new` mit der bestehenden
`JSESSIONID`-Session liefert (rohes JWT, kein JSON) — anders als die älteren REST-Endpunkte aus
B3/B3b (`api/exams`, `api/classreg/absences/students`), die mit dem Cookie allein auskommen.
Ohne den Token: HTTP 404 mit `{"errorCode":"NOT_FOUND",…}` — sieht wie "Route existiert nicht"
aus, ist aber "kein gültiger Token". Mit `Authorization: Bearer <token>`: HTTP 200, echte Daten.
Das war zunächst nur aus öffentlich bekannten WebUntis-Reverse-Engineering-Projekten
übernommenes Hintergrundwissen (keine Messung an dieser Schule) — jetzt für `htlstp.webuntis.com`
selbst bestätigt.

**Umgesetzt:**
- `WebUntisClient.getRestRaw()` (`api/client.ts`) — roh: kein `JSON.parse`, wirft nicht bei
  Fehlerstatus, erlaubt zusätzliche Header. Blieb als generelles Diagnose-Werkzeug für künftige
  unklare Endpunkte erhalten (nutzt es z. B. `scripts/smoke-test.ts` weiterhin für `getExams`-
  artige Erkundungen). 3 Tests.
- `WebUntisClient.getRestBearer()` (`api/client.ts`) — die eigentliche Lösung: holt den Token
  selbst über `getRestRaw()`, cached ihn pro Client-Instanz (Single-Flight gegen parallele
  Erstanfragen), holt ihn bei HTTP 401/403 einmal neu und wiederholt den Aufruf, verwirft ihn
  bei jedem Sessionwechsel (`setSession()`/`clearSession()`). Teilt sich Warteschlange/
  Drosselung mit `call()`/`getRest()`. 6 Tests, inkl. Retry- und Cache-Verhalten.
- `api/calendarEntryRest.ts` nutzt jetzt `getRestBearer()` statt `getRest()` — der
  "Lehrstoff"-Fund aus B8 war dadurch bisher gegen den echten Server faktisch tot (jeder
  Aufruf schlug fehl), funktioniert jetzt tatsächlich.
- Mocks (`mock/calendarEntryRestMock.ts`, `mock/msw/handlers.ts`, `mock/server.ts`) simulieren
  `/api/token/new` und prüfen den `Authorization`-Header auf `calendar-entry/detail` genauso
  streng wie der echte Server — ein versehentlicher Rückfall auf `getRest()` würde sofort im
  Test aussehen wie beim echten Server (404), statt einfach durchzulaufen.

**Bewusst nicht getan:** nicht geprüft, ob `examsRest.ts`/`absencesRest.ts` (B3/B3b) *auch*
einen Bearer-Token bräuchten — die liefen laut B3/B3b bisher nur einmal über eine DevTools-Kopie
des Nutzers, nie über unseren eigenen `getRest()`-Code gegen den echten Server (offener Punkt
in TESTING.md). Ihr Pfad (`api/exams`, `api/classreg/…`) hat kein `/rest/view/v2/`-Segment, ist
also vermutlich die ältere, Cookie-only-Fläche — aber "vermutlich" ist keine Messung.

**Dritter Lauf, ganze Woche, mit funktionierendem Bearer-Token — `teachingContent` verifiziert,
Notizen weiterhin leer (2026-09-22):** 9 von 34 Perioden hatten echten `teachingContent`, quer
durch verschiedene Fächer (Details: TESTING.md). Der "Lehrstoff"-Fund aus B8 ist damit zum
ersten Mal wirklich mit echten Serverdaten bestätigt, nicht nur mit einem einzelnen
DevTools-Beispiel. `notesAll`/`notesStaff`/`homeworks` blieben dagegen bei **0 von 34** —
auch bei genau den 9 Perioden mit `teachingContent`. Eine echte Stichprobe über eine ganze
Woche spricht eher dafür, dass diese drei Felder an dieser Schule ungenutzt sind, als dass es
noch an der Technik liegt — aber das ist eine Vermutung, keine Messung; ebenso denkbar, dass
"Notizen" in der echten Oberfläche etwas anderes meint, das wir noch nicht identifiziert haben.

**Entscheidung des Nutzers (2026-09-22): abgeschlossen, `notesAll`/`notesStaff`/`homeworks`
bewusst NICHT übernommen.** Begründung des Nutzers: diese Felder werden real selten befüllt,
sind dadurch kaum sinnvoll zu testen. Wichtig sind stattdessen zwei Dinge, die beide bereits
funktionieren:
1. **`teachingContent`** ("Lehrstoff") — siehe oben, über eine ganze Woche verifiziert.
2. **Das dokumentierte `Period.info`-Feld** ("Zusatzinfo" in `PeriodDetail.tsx`) — genau dort
   tragen Lehrkräfte an dieser Schule offenbar kurze Hinweise wie "Test" oder "MÜ" ein (echtes
   Beispiel schon gemessen: `info: "SMÜ Nomenklatur"` bei der NW2-Prüfung, siehe TESTING.md
   Abschnitt 3, "Prüfungen ohne getExams"). Das ist **kein undokumentierter REST-Kram**,
   sondern ganz normal Teil von `getTimetable` (Doku Abschnitt 15, `showInfo: true`) und war
   schon vor B8 da.

**Konsequenz:** `RestCalendarEntryDetail` (`api/calendarEntryRest.ts`) bleibt bei `id` +
`teachingContent` — `notesAll`/`notesStaff`/`homeworks` werden nicht in den Typ übernommen
(Projektregel: keine vermutlich leeren Felder in die UI bauen).

**Direkter Anschluss, 2026-09-22 — Info-Badge auf der Kalender-Karte.** Nutzerwunsch: wenn eine
Periode ein `info` hat (das dokumentierte Feld, das "Test"/"MÜ"-Hinweise trägt, siehe oben), soll
ein Icon direkt auf der Karte sichtbar sein — nicht nur im Hover-Tooltip (der auf Touch-Geräten
ohnehin unerreichbar ist) und nicht erst nach dem Öffnen. Klick/Aufklappen zeigt weiterhin den
vollen Text (bereits vorhanden: "Zusatzinfo" in `PeriodDetail.tsx`).

Umgesetzt in `ui/components/TimetableBlockCard.tsx`: ein kleiner Kreis-Badge ("i") oben rechts
neben dem lstype-Badge, sichtbar, sobald `block.info` nicht leer ist — mit `role="img"
aria-label="Zusatzinfo vorhanden"` (nicht `aria-hidden`, damit Screenreader-Nutzer dieselbe
Information bekommen wie sehende Nutzer, nicht nur über den unzuverlässigen `title`-Hover). Kein
eigener Klick-Handler nötig, die ganze Karte öffnet ohnehin schon die Detailansicht. 6 neue Tests
(`ui/components/__tests__/TimetableBlockCard.test.tsx`, bisher gab es für diese Komponente noch
keine eigene Testdatei).

**Manuell verifiziert** (Mock-Server, `mmuster`, Light **und** Dark Mode, über die
Accessibility-Tree-Ausgabe des Browsers gegengeprüft, nicht nur per Screenshot): genau die drei
Perioden mit `info` (Mittwoch Entfall, Montag Vertretung, Freitag Raumänderung) zeigen den
Badge, alle anderen nicht; Badge und ⚠-Pille (Vertretung/Raumänderung) stehen nebeneinander ohne
sich zu überlappen; Klick auf die Raumänderungs-Karte öffnet die Detailansicht mit "ZUSATZINFO:
K201 wegen Sanierung gesperrt".

Dieser Reverse-Engineering-Strang (B8, "Zusatzinformationen beim Öffnen einer Stunde") ist damit
fertig.

### B9 — Öffentliches README + erster GitHub-Release, ohne APK (Nutzerwunsch 2026-09-22)

Nutzerwunsch: README für Besucher des öffentlichen GitHub-Repos umbauen (Features,
Installationsweg statt internem Meilenstein-Log) und einen Release "am besten mit einer
APK". README.md komplett neu geschrieben (Pitch, Feature-Liste, Schnellstart inkl.
Mock-Server-Weg, ehrlicher "Bekannte Einschränkungen"-Abschnitt) — die bisherige
Meilenstein-Tabelle bleibt vollständig in PLAN.md/TESTING.md, dort ist sie besser
aufgehoben als auf der ersten Seite, die ein Fremder sieht.

**APK zurückgestellt, mit Begründung.** Ein Android-Build ist M9 (PLAN.md) — noch nie
gemacht, braucht JDK + Android SDK (mehrere GB, nicht installiert) und eine
Signierentscheidung. Dem Nutzer die reale Größe des Vorhabens genannt und zur Wahl
gestellt (voller Android-Setup jetzt / nur Source-Release / gar kein Release) —
Entscheidung: **nur Source-Release jetzt**, M9 bleibt ein eigener, späterer Schritt.

**Umgesetzt:** `v0.1.0` als GitHub-Pre-Release (`gh release create`, `--prerelease`,
Ziel `main`), Release Notes decken sich inhaltlich mit der neuen README (Features,
Installation, dieselben Einschränkungen, explizit vermerkt: "Dieser Release enthält kein
Android/iOS-Paket"). Kein Anhang, rein Source-über-Tag.

### B10 — Bug: Info verschwand bei Doppelstunden; neues "L"-Badge für Lehrstoff (Nutzerwunsch 2026-09-24)

**Gemeldeter Bug: Info-Badge ("i") erschien nicht, obwohl `info` gesetzt war.** Ursache in
`domain/timetable.ts` `mergeConsecutive()` gefunden: beim Zusammenfassen zweier Perioden zu
einer Doppelstunde wurden von der ZWEITEN Periode nur `endTime`/`periodIds` übernommen —
`info`/`substText`/`lstext`/`bkText`/`bkRemark` der zweiten Hälfte gingen komplett verloren,
sobald die erste Hälfte sie nicht auch hatte. Betraf nicht nur das neue Badge, sondern auch
die Detailansicht selbst — war vorher nur nie aufgefallen, weil kaum jemand für jede Stunde
in die Detailansicht schaute. **Fix:** neue `mergeTextField()`-Hilfsfunktion — fehlt ein Wert,
wird der andere genommen; unterscheiden sich beide, werden sie sichtbar zusammengeführt
(`"A / B"`) statt einen stillschweigend zu verwerfen. 5 neue Tests in `timetable.test.ts`,
inkl. exakt des gemeldeten Falls (nur zweite Hälfte trägt `info`).

**Neu: "L"-Badge für Lehrstoff, analog zum Info-Badge.** Im selben Zug gewünscht: ein
sichtbares "L" auf der Karte, wenn eine Stunde Lehrstoff (`teachingContent`, B8) hat — bisher
gab es dafür gar keine Anzeige vor dem Öffnen. Technisch anspruchsvoller als das Info-Badge,
weil `teachingContent` KEIN Feld von `TimetableBlock`/`getTimetable` ist, sondern ein
separater REST-Aufruf pro Periode (`calendarEntryRest.ts`), der laut B8 bewusst nur beim
Öffnen einer Periode lief ("wie die Original-App, nur pro Klick"), nicht vorab für die ganze
Woche.

**Bewusste Abkehr von dieser B8-Entscheidung:** `TimetableScreen.tsx` lädt `teachingContent`
jetzt über `useQueries` (TanStack Query) für ALLE Perioden der sichtbaren Woche vorab, nicht
mehr nur für die geöffnete. Vertretbar, weil der seit der Bearer-Token-Lösung (B8 Fortsetzung)
zuverlässige Endpunkt für eine ganze Woche nachweislich schnell genug ist (Smoke-Test: 34
Perioden in wenigen Sekunden). Dieselbe `queryKey`-Form wie der bestehende Einzel-Query
(`calendarDetailQuery`) — ein Cache-Hit beim tatsächlichen Öffnen, keine doppelte Anfrage. Nur
für den eigenen Plan (wie B8), Ganztagesblöcke ausgenommen.

**Nebenfund beim Live-Test (Mock-Server): React-Query-Fehler "Query data cannot be
undefined".** `getCalendarEntryDetailRest()` liefert bei keinem Treffer `undefined` — genau
das verbietet React Query als Query-Ergebnis. Bestand vermutlich schon vorher beim
Einzel-Query (jeder geöffneten Periode ohne Treffer), fiel aber nie auf, weil nur eine Anfrage
gleichzeitig lief; durch die Vorabladung (bis zu ~30 gleichzeitige Anfragen ohne Treffer pro
Woche) wurde es sofort sichtbar. Fix: beide Aufrufstellen wandeln `undefined` in `null` um
(`result ?? null`), `teachingContent` bleibt darüber weiterhin über Optional-Chaining
`undefined`, keine Leseseite musste sich ändern.

**Zweite Fehlermeldung, direkt im Anschluss: "L"-Badge ohne Lehrstoff, leere
"LEHRSTOFF"-Zeile in der Detailansicht (Screenshot des Nutzers, BESP/3BHIF, Mittwoch,
Entfall).** Ursache gefunden: der Server sendet bei einem TREFFER ohne Lehrstoff
offenbar `teachingContent: null` (nicht weggelassen, nicht leerer String) — dasselbe Muster,
das B8 schon bei den Nachbarfeldern `notesAll`/`notesStaff` gemessen hatte. Eine simple
`!== undefined`-Prüfung lässt `null` durch (`null !== undefined` ist `true` in JS), also
wurde es fälschlich als "vorhanden" gewertet. Nicht direkt neu gemessen (der Nutzer hat kein
Rohdaten-Beispiel geliefert), sondern aus dem Symptom rekonstruiert — passt aber exakt: eine
leere Detail-Zeile UND ein falsches Badge sind genau das erwartete Verhalten, wenn `null`
ungeprüft durchrutscht.

**Fix:** `RestCalendarEntryDetail.teachingContent` ehrlich auf `string | null` typisiert
(TypeScript hätte das vorher nicht angemeckert, weil der Typ `string | undefined` lag). Neue,
exportierte `hasRestText()`-Hilfsfunktion (`api/calendarEntryRest.ts`) prüft explizit auf
`undefined`, `null` UND `''` — beide Aufrufstellen in `TimetableScreen.tsx` (Badge-Berechnung
und Detailansicht) nutzen sie jetzt statt einer eigenen `!== undefined`-Prüfung. Mock
(`mock/calendarEntryRestMock.ts`) sendet bei einem Treffer ohne Lehrstoff jetzt ebenfalls
bewusst `null` statt das Feld wegzulassen — vorher hätte der Mock diese Fehlerklasse nie über
einen Test gefangen. 9 neue Tests: `hasRestText()` isoliert, `getCalendarEntryDetailRest()`
reicht `null` unverändert durch (eigene Testdatei `calendarEntryRest.test.ts`), und ein
Integrationstest gegen genau den gemeldeten Fall (Dienstag-BSP-Slot: Treffer, aber kein
Lehrstoff → kein Badge, keine leere Zeile).

**"Beide Badges gleichzeitig, wenn beides vorhanden ist"** war schon vorher der Fall — Info-
und Lehrstoff-Badge sind zwei unabhängige, gleichrangige Geschwister-Elemente im Markup, kein
Entweder-Oder. Kein aktueller Mock-Fixtermin kombiniert beides, aber ein Komponententest
(`TimetableBlockCard.test.tsx`, aus der vorigen Runde) belegt es mit synthetischen Props.
Vermutlich sah es beim Nutzer nur so aus, als würde sich das ausschließen, weil so viele
Karten fälschlich "L" zeigten (derselbe Bug wie oben).

**Manuell verifiziert** (Mock-Server, `mmuster`, Light **und** Dark Mode, frischer Browser-Tab
gegen einen aufsummierten Konsolen-Puffer aus einem vorherigen Tab abgesichert): Montags-
Deutsch-Karte zeigt "L" weiterhin korrekt schon vor dem Öffnen; Dienstags-BSP-Karte (Treffer,
aber kein Lehrstoff) zeigt jetzt korrekt GAR KEIN Badge mehr, vorher fälschlich "L"; Klick
öffnet weiterhin korrekt die Detailansicht mit vollem Lehrstoff-Text bzw. ohne
"Lehrstoff"-Zeile; Info-Badges (Mittwoch/Montag-Vertretung/Freitag) weiterhin korrekt; keine
Konsolenfehler im frischen Tab.

**Fortsetzung, direkt im Anschluss (2026-09-24, zweite Runde) — Vorabladung wieder
verworfen.** Nutzer-Feedback anhand eines Screenshots vom echten Konto (NW2, 18.09.2026,
mit sowohl Zusatzinfo als auch Lehrstoff): die Vorabladung der ganzen Woche soll wieder raus
— `teachingContent` soll wie ursprünglich in B8 vorgesehen NUR beim tatsächlichen Öffnen
geladen werden, nicht mehr im Voraus für alle ~30 Perioden der Woche. Damit fällt der in
dieser Runde zuerst genannte Netzwerk-Mehraufwand (bis zu ~30 zusätzliche Aufrufe pro
Wochenansicht) wieder komplett weg — zurück auf exakt das B8-Aufrufvolumen (ein Aufruf je
tatsächlich geöffneter Periode, nicht mehr).

**Umgesetzt:** `TimetableScreen.tsx` — `useQueries`/`teachingContentBlocks`/
`teachingContentResults` komplett entfernt. Stattdessen ein simpler `useState<Set<string>>`
(`blocksWithTeachingContent`), den ein `useEffect` befüllt, sobald `calendarDetailQuery`
(die ohnehin schon vorhandene Einzel-Abfrage fürs Öffnen) mit echtem Lehrstoff antwortet.
Ergebnis: das "L"-Badge erscheint jetzt frühestens nach dem ersten Öffnen einer Periode,
bleibt danach aber für den Rest der Sitzung sichtbar (kein erneutes Nachladen beim
Wiederanschauen) — spiegelbildlich zum Info-Badge, das weiterhin sofort aus den ohnehin
schon geladenen Stundenplan-Daten kommt, ohne eigenen Ladezustand.

Zwei Tests entsprechend umgeschrieben (Badge-Test prüft jetzt "vorher nicht da, nach
Öffnen+Schließen schon"; der BSP-Regressionstest prüft zusätzlich, dass das Badge auch NACH
dem Öffnen nicht fälschlich auftaucht — genau dort hätte ein Wiederauftreten des `null`-Bugs
in der neuen, schlankeren Fassung sichtbar werden müssen). Live gegen den Mock-Server erneut
nachvollzogen (Light/Dark): Badge fehlt vor dem Öffnen, erscheint sogar schon während das
Modal noch offen ist (React-Re-Render, kein Schließen nötig), bleibt danach bestehen; BSP
bleibt nach dem Öffnen weiterhin ohne Badge.

**Dritte Runde, direkt im Anschluss (2026-09-24) — Rückabwicklung war ein Missverständnis,
Vorabladung wieder eingebaut.** Der Nutzer hatte in der vorigen Runde tatsächlich das
Gegenteil gemeint: die Vorabladung soll BLEIBEN, nicht raus — sie hatte sich real (Screenshot
vom echten Konto) so verhalten, ALS würde sie nicht vor dem Öffnen laden. Klargestellt: "es
soll vorher schon sichtbar sein, ohne dass man es öffnen muss — das war ja der Fehler
vorher."

**Wahrscheinliche Ursache des "wirkt wie nur-pro-Klick"-Eindrucks:** kein Bug im engeren Sinn,
sondern Geschwindigkeit. Der Mock antwortet lokal quasi sofort, unabhängig von der
Aufrufreihenfolge — das verschleiert, dass gegen den ECHTEN Server alle ~30
`calendar-entry-detail`-Aufrufe einer Woche sich dieselbe Drosselung teilen (`api/client.ts`,
`minRequestGapMs`, geteilt mit allen anderen API-Aufrufen) und dadurch NACHEINANDER laufen.
Bei einer festen "Montag zuerst"-Reihenfolge kann der gerade interessante Tag (z. B. ein über
"Prüfungen" angesprungener Freitag) weit hinten in der Warteschlange stehen — bis dessen
Karte ihr Badge bekommt, vergehen u. U. mehrere Sekunden, in denen es aussieht, als würde
gar nichts vorab laden. Nicht direkt gemessen (kein Zugriff auf den echten Server), aber
die einzige Erklärung, die zum gemeldeten Symptom UND zum vorher tatsächlich funktionierenden
Mock-Verhalten passt.

**Umgesetzt:** Vorabladung (`useQueries` über die ganze sichtbare Woche) wieder eingebaut,
`hasRestText()`-Fix bleibt selbstverständlich erhalten. Neu dazu: `domain/timetable.ts`
`prioritizeByDate()` — reine, isoliert getestete Sortierfunktion, die den gerade sichtbaren
Tag (`selectedDate`) an den Anfang der Abfrage-Reihenfolge stellt, den Rest der Woche
unverändert dahinter. Dadurch bekommt der relevante Tag sein Badge zuerst, unabhängig davon,
auf welchem Wochentag er liegt. 4 neue Tests für `prioritizeByDate` (isoliert), die beiden
TimetableScreen-Tests wieder auf "Badge vor dem Öffnen sichtbar" zurückgesetzt.

**Bewusst NICHT gemacht:** echte Nebenläufigkeit (mehrere `calendar-entry-detail`-Aufrufe
gleichzeitig statt nacheinander) — hätte die Gesamtzeit für eine ganze Woche zusätzlich
verkürzt, aber ist gegen den echten, undokumentierten Endpunkt ungemessen, ob das ohne
Rate-Limit-Probleme funktioniert. Die Priorisierung allein verbessert nur, WELCHER Tag zuerst
fertig ist, nicht wie lange die ganze Woche insgesamt braucht. Falls das Priorisieren allein
gegen den echten Server nicht ausreicht (weiterhin spürbar langsam für den relevanten Tag),
wäre kontrollierte Nebenläufigkeit (z. B. 3–4 Aufrufe gleichzeitig) der nächste Schritt — aber
erst nach einem erneuten Test gegen den echten Server, nicht auf Verdacht.

## C) Feature-Ideen (Backlog, nicht beauftragt)

- **Stundenplan-Diff**: Änderungen seit dem letzten Besuch hervorheben, basierend auf `getLatestImportTime`.
- **Offline-Modus**: letzter Stundenplan aus IndexedDB, sichtbarer „Stand von …"-Hinweis.
- **Freistunden-/Lückenanzeige** und „nächste Stunde in X Minuten"-Widget.
- **Raum-Suche**: über `getTimetable` (type 4) freie Räume zu einer Stunde finden.
- **Wochen-Heatmap** der Abwesenheiten aus `getTimetableWithAbsences`.
- **Fachfarben manuell überschreibbar**, Wahl persistent pro Gerät.
- **Notenschnitt-/Prüfungsdichte-Ansicht**: Prüfungen pro Woche visualisieren, Häufungen warnen.
- **Klassenbuch-Einträge** (`getClassregEvents`) anzeigen, falls das Recht vorhanden ist.
- **Prüfungsstunden im Stundenplan wieder optisch markieren**: seit B3 kommt die Prüfungs-
  Information nicht mehr über `lstype` (das Feld ist für Prüfungsstunden leer), sondern über
  den separaten REST-Workaround. Die Kalender-Ansicht (`TimetableScreen.tsx`) könnte die
  geladenen Prüfungen mit den Stundenplan-Perioden nach Datum/Uhrzeit/Fach kreuzreferenzieren,
  um dort wieder einen Badge zu zeigen.
- **Feiertage/Ferien** (`getHolidays`) im Stundenplan als Ganztagsblöcke.
- **Export des ganzen Stundenplans** als ICS, nicht nur der Prüfungen.
- **Mehrere Profile** (z. B. eigener Plan + Lieblingsklasse) mit schnellem Wechsel.
- **Session über Reload hinweg merken** (M4): aktuell rein im Speicher, ein Reload meldet ab
  (sicherste Grundeinstellung, siehe TESTING.md M4). Eine Wiederherstellung über
  `sessionStorage` (tab-gebunden, beim Schließen weg) wäre ein vertretbarer Kompromiss
  zwischen Komfort und Sicherheit — nur nach expliziter Freigabe umsetzen.
- **PWA-Installation + Push** für Vertretungen (Push braucht wieder einen Server → siehe B2).
