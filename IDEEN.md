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

### B3 – Prüfungen/Abwesenheiten für Schüler-Konten — **Nutzer-Feedback 2026-09-17, Nachmessung nötig**
*Gemessen am 2026-09-16 (echtes Schüler-Konto, siehe TESTING.md Abschnitt 3):* das Konto hat kein Recht auf `getExamTypes` und keins auf `getTimetableWithAbsences`. Der erste Schluss daraus war: Prüfungen/ICS-Export und Abwesenheiten sind für Schüler-Konten faktisch tot.

**Das ist laut Nutzer so nicht richtig.** Am 2026-09-17 hat der Nutzer Screenshots der echten, originalen WebUntis-Weboberfläche geschickt (`htlstp.webuntis.com`, eingeloggt mit genau diesem Schüler-Konto): dort werden sowohl Prüfungen (Tab "Prüfungen", mehrere Einträge mit Fach/Klasse/Lehrkraft/Raum/Datum) als auch Abwesenheiten (Tab "Abwesenheiten") klaglos angezeigt. Das Konto hat die nötigen Rechte offenbar — nur nicht über die Methoden, die wir bisher getestet haben.

**Zwei mögliche Erklärungen, beide offen:**
1. `getExamTypes` ("examtypes read") und `getExams` ("examinations read") sind laut Doku *zwei getrennte Rechte* (PLAN.md #21/#22). Der erste Smoke-Test hat nur `getExamTypes` probiert, nie `getExams` selbst — es ist möglich, dass `getExams` mit einer bekannten `examTypeId` direkt funktioniert, auch ohne das Recht, alle Typen aufzulisten. `scripts/smoke-test.ts` probiert das jetzt aktiv durch (IDs 1–10).
2. Die originale Weboberfläche nutzt seit einigen Jahren teils die neuere WebUntis-REST-API (`/WebUntis/api/...`), nicht mehr nur das 2018er JSON-RPC. Falls `getExams`/`getTimetableWithAbsences` auch direkt fehlschlagen, wäre das der wahrscheinlichere Grund — und würde bedeuten, dass diese Features mit der dokumentierten API grundsätzlich nicht für dieses Konto gehen (siehe A1, gleiche Kategorie: undokumentierte Schnittstelle, **nichts wird ohne Freigabe umgesetzt**).

**Nächster Schritt:** Der Nutzer führt `npm run smoke` mit dem verbesserten Skript erneut aus (druckt jetzt rohe Fehlercodes statt nur ja/nein, plus den direkten `getExams`-Probe-Durchlauf). Erst mit den echten Ergebnissen lässt sich entscheiden, ob (a) ein reiner Code-Fix reicht (z. B. `getExams` mit geratener/bekannter ID versuchen, wenn `getExamTypes` fehlschlägt) oder (b) eine Grundsatzentscheidung über undokumentierte Endpunkte ansteht.

**Konsequenz für M11 (Kalenderabo):** unverändert gültig — der Feed authentifiziert sich mit den Zugangsdaten des Nutzers, für den er läuft; welche Rechte/Methoden dafür nötig sind, hängt vom Ausgang der Nachmessung ab.

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
- **Feiertage/Ferien** (`getHolidays`) im Stundenplan als Ganztagsblöcke.
- **Export des ganzen Stundenplans** als ICS, nicht nur der Prüfungen.
- **Mehrere Profile** (z. B. eigener Plan + Lieblingsklasse) mit schnellem Wechsel.
- **Session über Reload hinweg merken** (M4): aktuell rein im Speicher, ein Reload meldet ab
  (sicherste Grundeinstellung, siehe TESTING.md M4). Eine Wiederherstellung über
  `sessionStorage` (tab-gebunden, beim Schließen weg) wäre ein vertretbarer Kompromiss
  zwischen Komfort und Sicherheit — nur nach expliziter Freigabe umsetzen.
- **PWA-Installation + Push** für Vertretungen (Push braucht wieder einen Server → siehe B2).
