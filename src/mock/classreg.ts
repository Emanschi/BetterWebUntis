/**
 * Fake-Daten für getClassregEvents (Doku Abschnitt 20/26).
 * Ein wiederkehrender Eintrag genügt hier als Beispiel — die Methode ist im
 * Projektauftrag kein Kernfeature, sondern nur "sinnvoll, falls Recht vorhanden".
 */

import { addWuDays, wuDateToDate } from '../api/format';
import type { ClassregEvent, WuDate } from '../api/types';
import { CLASSREG_CATEGORIES } from './schoolData';

const HOMEWORK_MISSING_ID = CLASSREG_CATEGORIES.find((c) => c.name === 'homework_missing')?.id ?? 2;

/** Jeden Dienstag im Zeitraum: ein Eintrag "Hausübung vergessen" für Eva Beispiel (Student id 502). */
export function mockClassregEvents(startDate: WuDate, endDate: WuDate): ClassregEvent[] {
  const result: ClassregEvent[] = [];
  let cursor = startDate;
  for (let i = 0; i < 3660 && cursor <= endDate; i++, cursor = addWuDays(cursor, 1)) {
    if (wuDateToDate(cursor).getDay() === 2) {
      result.push({
        studentid: '502',
        surname: 'Beispiel',
        forname: 'Eva',
        date: cursor,
        subject: 'M',
        reason: '',
        text: 'Hausübung vergessen',
        categoryId: HOMEWORK_MISSING_ID,
      });
    }
  }
  return result;
}
