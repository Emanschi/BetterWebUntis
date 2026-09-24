/**
 * Fake-Daten für den undokumentierten REST-Endpunkt
 * `/WebUntis/api/rest/view/v2/calendar-entry/detail` (siehe `api/calendarEntryRest.ts` für
 * Hintergrund und die echte Beispielantwort). Simuliert `teachingContent` nur für EINEN
 * Fixtermin (Montag, 4. Stunde, Deutsch — `mock/timetable.ts` WEEKLY_TEMPLATE,
 * `hasTeachingContent`), analog zum Buchungshinweis-Fixture (`hasBooking`, Dienstag BSP).
 *
 * "Eine Fachlogik, zwei Transporte" wie examsRestMock.ts: dieselbe Funktion bedient
 * `mock/server.ts` (Node-HTTP) und `mock/msw/handlers.ts` (Tests).
 *
 * Simuliert auch `/api/token/new` (siehe `WebUntisClient.getRestBearer()`, gemessen
 * 2026-09-22, IDEEN.md B8 Fortsetzung): dieser Endpunkt-Zweig braucht real einen separaten
 * Bearer-Token, ohne den kam HTTP 404 statt eines leeren Treffers — die Mock-Handler prüfen
 * deshalb bewusst denselben Header, damit ein versehentlicher Wechsel zurück auf `getRest()`
 * (ohne Token) sofort im Test auffällt, statt nur real zu brechen.
 */

import { toWuDate } from '../api/format';
import type { RestCalendarEntryDetail } from '../api/calendarEntryRest';
import type { WuDate, WuTime } from '../api/types';
import { rawPeriodsForElement, type MockElement } from './timetable';

/**
 * Platzhalter, kein echtes JWT — `api/client.ts` prüft den Inhalt nirgends, nur ob der
 * `Authorization`-Header beim eigentlichen Aufruf mitkommt (siehe Datei-Kommentar oben).
 */
export const MOCK_BEARER_TOKEN = 'mock.bearer.token';

/** Erwarteter `Authorization`-Header-Wert für einen gültigen simulierten Bearer-Token. */
export const MOCK_BEARER_AUTH_HEADER = `Bearer ${MOCK_BEARER_TOKEN}`;

/**
 * "YYYY-MM-DDTHH:mm:ss" (lokale Zeit, kein Offset) → WuDate/WuTime. Gegenstück zu
 * `api/format.ts` `wuDateTimeToIsoLocal` — nur der Mock muss das zurückparsen, der echte
 * Client sendet dieses Format nur, empfängt es nie als Eingabe.
 */
export function parseIsoLocalDateTime(iso: string): { date: WuDate; time: WuTime } {
  const d = new Date(iso);
  return { date: toWuDate(d), time: d.getHours() * 100 + d.getMinutes() };
}

/**
 * Findet die Rohperiode, die exakt auf die angefragte Zeitspanne passt — wie beim echten
 * Endpunkt (siehe api/calendarEntryRest.ts) gibt es bei keinem Treffer `undefined`, keinen
 * Fehler (z. B. bei einer im Stundenplan zusammengefassten Doppelstunde, deren UI-Grenzen
 * von der echten Einzelstunden-Zeitspanne abweichen).
 *
 * Bei einem TREFFER ohne Lehrstoff liefert der Mock jetzt bewusst `teachingContent: null`
 * statt das Feld wegzulassen — genau das Verhalten, das den Bug vom 2026-09-24 verursacht
 * hat (der Server sendet real `null`, nicht "fehlt"). Vorher ließ der Mock das Feld einfach
 * weg und hätte diese Fehlerklasse nie über einen Test gefangen.
 */
export function mockCalendarEntryDetail(
  element: MockElement,
  date: WuDate,
  startTime: WuTime,
  endTime: WuTime,
): RestCalendarEntryDetail | undefined {
  const raw = rawPeriodsForElement(element, date, date).find((p) => p.startTime === startTime && p.endTime === endTime);
  if (raw === undefined) return undefined;
  return { id: raw.id, teachingContent: raw.teachingContent ?? null };
}
