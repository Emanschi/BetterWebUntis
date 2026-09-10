/**
 * Fake-Daten für getTimetableWithAbsences (Doku Abschnitt 23).
 *
 * Besonderheit laut Doku: Dieser Endpunkt referenziert Elemente über **externe
 * Schlüssel** (Strings), nicht über die internen Ids wie der Rest der API — siehe
 * PLAN.md R6. Die Fake-externalkeys hier existieren ausschließlich für diesen Zweck;
 * die übrigen Stammdaten (schoolData.ts) führen bewusst keine externalkeys, weil die
 * Doku sie nirgends sonst voraussetzt.
 */

import { addWuDays, wuDateToDate } from '../api/format';
import type { PeriodWithAbsence, WuDate } from '../api/types';

/** Externe Schlüssel für die Fake-Stammdaten, nur für diesen Endpunkt relevant. */
export const EXTERNAL_KEYS = {
  student501: 'stud-501-muster',
  student503: 'stud-503-test',
  subjectAM: 'subj-5-am',
  teacher10: 'teach-10-mustermann',
  userAdmin: 'user-admin',
} as const;

const SLOT_TIMES = { startTime: 800, endTime: 850 };

/**
 * Zwei wiederkehrende Abwesenheits-Randfälle pro Woche im angefragten Zeitraum:
 *   - Montag: kontrollierte, entschuldigte Abwesenheit (Krankheit)
 *   - Donnerstag (Prüfungstag, siehe timetable.ts): noch nicht kontrollierte,
 *     unentschuldigte Abwesenheit — bildet den Randfall "checked: false" ab
 */
export function mockAbsences(startDate: WuDate, endDate: WuDate): PeriodWithAbsence[] {
  const result: PeriodWithAbsence[] = [];
  let cursor = startDate;
  for (let i = 0; i < 3660 && cursor <= endDate; i++, cursor = addWuDays(cursor, 1)) {
    const weekday = wuDateToDate(cursor).getDay();

    if (weekday === 1) {
      result.push({
        date: cursor,
        startTime: SLOT_TIMES.startTime,
        endTime: SLOT_TIMES.endTime,
        studentId: EXTERNAL_KEYS.student501,
        subjectId: EXTERNAL_KEYS.subjectAM,
        teacherIds: [EXTERNAL_KEYS.teacher10],
        studentGroup: '3AHIF',
        absenceReason: 'Krankheit',
        absentTime: 50,
        excuseStatus: 'entschuldigt',
        user: EXTERNAL_KEYS.userAdmin,
        checked: true,
      });
    }

    if (weekday === 4) {
      result.push({
        date: cursor,
        startTime: SLOT_TIMES.startTime,
        endTime: SLOT_TIMES.endTime,
        studentId: EXTERNAL_KEYS.student503,
        subjectId: EXTERNAL_KEYS.subjectAM,
        teacherIds: [EXTERNAL_KEYS.teacher10],
        studentGroup: '3AHIF',
        status: 'irregular',
        user: EXTERNAL_KEYS.userAdmin,
        checked: false,
      });
    }
  }
  return result;
}
