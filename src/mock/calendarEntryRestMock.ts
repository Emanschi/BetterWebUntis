/**
 * Fake-Daten für den undokumentierten REST-Endpunkt
 * `/WebUntis/api/rest/view/v2/calendar-entry/detail` (siehe `api/calendarEntryRest.ts` für
 * Hintergrund und die echte Beispielantwort). Simuliert `teachingContent` nur für EINEN
 * Fixtermin (Montag, 4. Stunde, Deutsch — `mock/timetable.ts` WEEKLY_TEMPLATE,
 * `hasTeachingContent`), analog zum Buchungshinweis-Fixture (`hasBooking`, Dienstag BSP).
 *
 * "Eine Fachlogik, zwei Transporte" wie examsRestMock.ts: dieselbe Funktion bedient
 * `mock/server.ts` (Node-HTTP) und `mock/msw/handlers.ts` (Tests).
 */

import { toWuDate } from '../api/format';
import type { RestCalendarEntryDetail } from '../api/calendarEntryRest';
import type { WuDate, WuTime } from '../api/types';
import { rawPeriodsForElement, type MockElement } from './timetable';

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
 */
export function mockCalendarEntryDetail(
  element: MockElement,
  date: WuDate,
  startTime: WuTime,
  endTime: WuTime,
): RestCalendarEntryDetail | undefined {
  const raw = rawPeriodsForElement(element, date, date).find((p) => p.startTime === startTime && p.endTime === endTime);
  if (raw === undefined) return undefined;
  return { id: raw.id, ...(raw.teachingContent === undefined ? {} : { teachingContent: raw.teachingContent }) };
}
