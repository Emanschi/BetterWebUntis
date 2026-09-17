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
