# BetterWebUntis

Eine modernere Alternative zur offiziellen WebUntis-App — als Web-App, Android-APK und iOS-App
aus einer gemeinsamen Codebasis.

Planung und Architektur: [PLAN.md](PLAN.md) · Offene Fragen: [IDEEN.md](IDEEN.md) · Teststand: [TESTING.md](TESTING.md)

## Stand

| Meilenstein | Status |
|---|---|
| M0 Server-Check | ✅ JSON-RPC an der HTL St. Pölten aktiv |
| M1 Scaffold & Tooling | ✅ |
| M2 API-Layer | ✅ 99 Tests |
| M3 Mock-Server & Fixtures | ✅ 135 Tests |
| M4 App-Shell & Login | ✅ 150 Tests |
| M5 Stundenplan | ✅ 170 Tests |
| M6 Elementwechsel | ✅ 178 Tests |
| M7 Abwesenheiten/Prüfungen/Termine | ✅ 186 Tests |
| M8 ICS-Export | ✅ 199 Tests |
| Kalender-Nachbesserung (Zeitraster, Theme-Toggle) | ✅ 207 Tests |
| M10 Echter Server-Test | ✅ 215 Tests, 2 Bugs gefunden+behoben |
| Nutzer-Feedback: Scope auf Schüler-Konten, "Termine"/"Profil" entfernt | ✅ 210 Tests |
| Nutzer-Feedback: Abwesenheiten-Tab entfernt | ✅ 215 Tests |
| Prüfungen: undokumentierter REST-Endpunkt (getExams/lstype funktionieren real nicht) | ✅ 222 Tests |
| Abwesenheiten: derselbe Weg, Tab wieder da | ✅ 231 Tests |
| Elementwechsel: nur noch Klassen (Lehrer/Fach/Raum entfernt) | ✅ 231 Tests |
| M9, M11 | offen |

## Befehle

```bash
npm run dev        # Dev-Server mit Proxy auf htlstp.webuntis.com
npm test           # Unit-Tests gegen die Fixtures aus der API-Doku
npm run typecheck  # TypeScript im strict-Modus
npm run build      # Produktions-Build
npm run smoke      # Rauchtest gegen den echten Server (braucht Zugangsdaten)
npm run mock        # Mock-Server auf localhost:4001 zum manuellen Testen ohne echten Server
```

Der Rauchtest liest die Zugangsdaten aus der Umgebung, nie aus einer Datei:

```bash
WEBUNTIS_USER='...' WEBUNTIS_PASSWORD='...' npm run smoke
```

Er prüft `authenticate` → `getTimetable` → `logout` und listet auf, welche Methoden
das Konto überhaupt aufrufen darf. Ergebnisse gehören nach `TESTING.md`.

## Wo was liegt

```
src/api/        JSON-RPC-Layer — Typen, Transport, Client, Methoden (nur dokumentierte!)
                Ausnahme: examsRest.ts/absencesRest.ts (undokumentierte REST-Endpunkte,
                eigener Namensraum "restApi", ausdrücklich freigegeben — siehe IDEEN.md B3)
src/domain/     Fachlogik: Wochenraster, Doppelstunden-Merge, Fachfarben, ICS (M8)
src/ui/         Komponenten, Screens, Routing, AppShell
src/state/      Zustand-Stores (Theme, Session) — kein Netzzugriff, nur über src/api
src/mock/       Mock-Server und Fake-Daten — Fake-Schule "Mock-HTL"
scripts/        Rauchtest gegen den echten Server
```

Regel: `ui/` und `domain/` sprechen nie direkt mit dem Netz, nur über `src/api`.

**Build-Output liegt außerhalb des Projektordners:** `/home/emanschi/builds/BetterWebuntis/`.
Das Projekt selbst liegt bewusst nicht in OneDrive.

## Zwei Dinge, die man wissen muss

**Die Web-Version braucht einen Proxy.** WebUntis sendet kein
`Access-Control-Allow-Credentials`, und `JSESSIONID` ist `HttpOnly` — der Browser kann die
API also nicht direkt ansprechen. Im Dev übernimmt das der Vite-Proxy. Android und iOS sind
nicht betroffen, weil Capacitor nativ requestet. Messung in [TESTING.md](TESTING.md).

**Die API kann weniger, als die Original-App zeigt.** Mitteilungen, Passwort ändern und
Kontaktdaten ändern haben in der JSON-RPC-Doku von 2018 keine Entsprechung. Was fehlt und
welche Optionen es gibt, steht in [IDEEN.md](IDEEN.md).
