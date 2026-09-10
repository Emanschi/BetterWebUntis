# Fixtures

Alle Dateien hier sind **wörtlich aus den Beispiel-Responses der Doku**
`2018-09-20-WebUntis_JSON_RPC_API.pdf` übernommen. Feldnamen, Werte und Formate
(`YYYYMMDD`, `HHMM`, `RRGGBB`) sind unverändert. Wo die Doku `...` schreibt, endet
das Fixture nach den dort tatsächlich abgedruckten Einträgen.

Zwei Dateien stammen **nicht** aus der Doku, sondern aus einer echten Messung gegen
`htlstp.webuntis.com` am 2026-09-10 (siehe `TESTING.md`):
`error-bad-credentials.json` und `error-not-authenticated.json`.

## Korrekturen an offensichtlichen Satzfehlern der Doku

Die Doku ist an einigen Stellen kein valides JSON. Korrigiert wurde ausschließlich
die Syntax, nie der Inhalt:

| Datei | Doku schreibt | korrigiert zu | Grund |
|---|---|---|---|
| `authenticate.json` | `"personType"=2,"personId"=17` sowie fehlende schließende Klammer | `"personType":2,"personId":17` | `=` statt `:` ist in JSON syntaktisch unmöglich |
| `getKlassen.json` | `did:2` | `"did":2` | unquotierter Schlüssel |
| `getTimetable-custom.json` | `"result" [` | `"result":[` | fehlender Doppelpunkt |
| `getSubjects.json` | Zeilenumbruch mitten in `"Evang.\nReligion"` | `"Evang. Religion"` | Umbruch im PDF-Satz, kein Datenbestandteil |
| `getKlassen.json` | Zeilenumbruch in `"Klasse\n1A"` | `"Klasse 1A"` | dito |

## Inhaltliche Abweichung, die eine Entscheidung erforderte

**`getSubstitutions.json`** — die Doku druckt die Einträge mit `type: "shift"` und
`type: "cancel"` als *drei nebeneinanderstehende Objekte* ab:

```
{"type":"shift","lsid":3087,...},{"reschedule":{...}},{"kl":[...],"te":[...]}
```

Das kann nicht stimmen: die Feldbeschreibung darüber führt `reschedule`, `kl`, `te`,
`su` und `ro` ausdrücklich als Felder **eines** Substitution-Objekts. Die Aufteilung
ist ein Satzfehler. Im Fixture stehen sie deshalb als je ein Objekt.
**Beim Smoke-Test gegen den echten Server gegenprüfen** (siehe `TESTING.md`).

## Bewusst nicht korrigiert

**`getTimegridUnits.json`** — der Fließtext der Doku sagt `1 = sunday … 7 = saturday`,
das Beispiel daneben zeigt aber `day: 0`. Das Fixture folgt dem Fließtext (1..7),
weil eine Beschreibung schwerer wiegt als ein Beispiel. `weekdayFromTimegridDay()`
ist gegenüber beiden Varianten tolerant. Ebenfalls gegen den echten Server zu prüfen.
