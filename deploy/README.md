# Deployment auf World4You (oder jedem anderen Apache+PHP-Webspace)

Zwei Teile gehören auf den Server: die gebaute Web-App (statische Dateien) und ein kleiner
PHP-Proxy (Hintergrund: [PLAN.md](../PLAN.md) R1 — WebUntis erlaubt keine direkten
Browser-Zugriffe). Beides landet **im selben Ordner**, im Web-Root der Subdomain.

Der Proxy ist **nicht auf eine bestimmte Schule festgelegt** — welche Schule gemeint ist,
kommt aus der Schulsuche im Login (siehe IDEEN.md B11). Ein Deployment bedient damit jede
WebUntis-Schule, nicht nur die eigene; an der Datei `webuntis-proxy.php` selbst gibt es
nichts anzupassen.

## 1. Bauen

```bash
npm run build
```

Landet unter `/home/emanschi/builds/BetterWebuntis/web/` (siehe `vite.config.ts`):

```
web/
  index.html
  assets/
    index-XXXXXXXX.css
    index-XXXXXXXX.js
    index-XXXXXXXX.js.map   ← optional, kann weggelassen werden (nur für Debugging)
```

Die Hash-Namen (`XXXXXXXX`) ändern sich bei jedem Build — einfach den ganzen Ordnerinhalt
nehmen, nicht die Namen von Hand eintragen.

## 2. Hochladen — diese Dateien in den Web-Root der Subdomain (z. B. per FTP/SFTP,
Zugangsdaten aus dem World4You-Kundenmenü):

| Datei/Ordner (Quelle) | Ziel im Web-Root |
|---|---|
| `builds/BetterWebuntis/web/index.html` | `index.html` |
| `builds/BetterWebuntis/web/assets/` (ganzer Ordner) | `assets/` |
| `deploy/webuntis-proxy.php` | `webuntis-proxy.php` |
| `deploy/.htaccess` | `.htaccess` |

Am Ende sieht der Web-Root so aus:

```
/ (Web-Root der Subdomain)
├── index.html
├── assets/
│   ├── index-XXXXXXXX.css
│   └── index-XXXXXXXX.js
├── webuntis-proxy.php
└── .htaccess
```

Kein `node_modules`, kein Quellcode, keine `.env` — nur diese vier/fünf Dateien.

## 3. Testen

1. Subdomain im Browser öffnen (mit **https://**, nicht http).
2. Im Feld "Schule" den eigenen Schulnamen oder Ort eintippen und aus der Liste auswählen.
3. Mit echten WebUntis-Zugangsdaten einloggen.
4. Klappt der Login und zeigt der Stundenplan Daten → fertig.

## Bekannte Stolpersteine

- **HTTPS aktivieren.** World4You bietet kostenlose Let's-Encrypt-Zertifikate im
  Kundenmenü — vor dem ersten echten Login aktivieren, da Zugangsdaten durchlaufen.
- **`.htaccess` wird ignoriert:** manche Hosting-Panels brauchen `AllowOverride All` bzw.
  eine explizite Freigabe für `.htaccess`/`mod_rewrite` in der Subdomain-Konfiguration —
  im World4You-Kundenmenü bei den Domain-/Subdomain-Einstellungen nachsehen, sonst landet
  jede Anfrage an `/WebUntis/...` als 404 (Datei nicht gefunden), statt beim Proxy.
- **Login schlägt fehl / "Sitzung abgelaufen" direkt nach dem Login:** fast immer ein
  Cookie-Pfad-Problem. `/WebUntis` muss **exakt so großgeschrieben** in der URL stehen (das
  ist hier schon so eingebaut) — siehe [TESTING.md](../TESTING.md), das ist derselbe Bug,
  der beim allerersten echten Login-Test auftrat.
- **PHP-Version:** der Proxy nutzt `str_starts_with()`, das braucht **PHP 8.0 oder neuer**.
  Im World4You-Kundenmenü lässt sich die PHP-Version pro Subdomain einstellen.
- **`curl`-Erweiterung fehlt:** sehr unüblich bei Standard-Hosting, der Proxy meldet das
  dann selbst mit einer klaren Fehlermeldung statt eines kryptischen 500ers.
- **Schulsuche findet nichts / hängt:** der Proxy braucht dafür ausgehende HTTPS-Verbindungen
  zu `mobile.webuntis.com` (WebUntis' eigener Suchdienst, siehe oben) — bei den meisten
  Hosting-Paketen uneingeschränkt möglich, bei sehr restriktiven Setups ggf. beim Support
  nachfragen.

## Was das NICHT abdeckt

Dieser Proxy ist **zustandslos** — er speichert nichts, merkt sich nichts zwischen zwei
Anfragen. Für das automatisch aktualisierte Kalender-Abo (statt des schon eingebauten
manuellen ICS-Exports) bräuchte es einen zweiten, komplett getrennten Dienst mit
serverseitig gespeicherten (verschlüsselten) Zugangsdaten — siehe
[IDEEN.md](../IDEEN.md) B2. Das ist hier bewusst nicht enthalten.
