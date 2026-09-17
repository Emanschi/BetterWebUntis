/**
 * Fake-Daten und Fachlogik für den undokumentierten REST-Endpunkt
 * `/WebUntis/api/classreg/absences/students` (siehe `api/absencesRest.ts` für Hintergrund
 * und die echte Beispielantwort, auf der dieser Mock beruht).
 *
 * "Eine Fachlogik, zwei Transporte": dieselbe `mockAbsencesRest()`-Funktion wird von
 * `mock/server.ts` (Node-HTTP) und `mock/msw/handlers.ts` (Tests) verwendet.
 */

import type { RestAbsence } from '../api/absencesRest';
import type { WuDate } from '../api/types';

const STUDENT_ABSENCES: readonly RestAbsence[] = [
  {
    id: 1,
    startDate: 20260911,
    endDate: 20260911,
    startTime: 750,
    endTime: 915,
    reason: '',
    text: '',
    isExcused: false,
    excuseStatus: null,
  },
];

/** Filtert wie der echte Endpunkt (Zeitraum über startDate/endDate). */
export function mockAbsencesRest(startDate: WuDate, endDate: WuDate): RestAbsence[] {
  return STUDENT_ABSENCES.filter((absence) => absence.startDate >= startDate && absence.startDate <= endDate);
}
