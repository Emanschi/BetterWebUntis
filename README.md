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
| M3 Mock-Server & Fixtures | offen |
| M4–M11 | offen |

## Befehle

```bash
npm run dev        # Dev-Server mit Proxy auf htlstp.webuntis.com
npm test           # Unit-Tests gegen die Fixtures aus der API-Doku
npm run typecheck  # TypeScript im strict-Modus
npm run build      # Produktions-Build
npm run smoke      # Rauchtest gegen den echten Server (braucht Zugangsdaten)
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
src/domain/     Fachlogik: Stundenplan-Merge, Farben, ICS      (ab M5)
src/ui/         Komponenten und Screens                        (ab M4)
src/mock/       Mock-Server und Fake-Daten                     (ab M3)
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
