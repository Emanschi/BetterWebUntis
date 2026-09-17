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
