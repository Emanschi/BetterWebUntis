/**
 * Fake-Daten und Fachlogik für den undokumentierten REST-Endpunkt `/WebUntis/api/exams`
 * (siehe `api/examsRest.ts` für Hintergrund und die echte Beispielantwort, auf der dieser
 * Mock beruht). Dieselben fünf Termine wie die "Schularbeit"-Randfälle im Stundenplan-Mock
 * (`FIXED_EXAM_DATES` aus `mock/timetable.ts`), damit Stundenplan und Prüfungen-Seite im
 * Mock zueinander passen, so wie es beim echten Server auch der Fall ist (dieselbe Stunde
 * taucht an beiden Stellen auf — einmal als Stundenplan-Periode mit freiem info-Text, einmal
 * als eigener Prüfungs-Eintrag).
 *
 * "Eine Fachlogik, zwei Transporte": dieselbe `mockExamsRest()`-Funktion wird von
 * `mock/server.ts` (Node-HTTP) und `mock/msw/handlers.ts` (Tests) verwendet.
 */

import type { RestExam } from '../api/examsRest';
import type { WuDate } from '../api/types';
import { FIXED_EXAM_DATES } from './timetable';

const STUDENT_EXAMS: readonly RestExam[] = FIXED_EXAM_DATES.map((examDate, index) => ({
  id: index + 1,
  examType: 'SA_TE',
  name: 'AM',
  studentClass: ['3AHIF'],
  examDate,
  startTime: 1000,
  endTime: 1050,
  subject: 'AM',
  teachers: ['MUS'],
  rooms: ['K201'],
  text: `${index + 1}. Schularbeit`,
  // Nur der erste Termin testweise benotet — zeigt, dass die UI eine Note anzeigen kann,
  // ohne dass alle Fixture-Einträge künstlich "in der Vergangenheit" liegen müssen.
  grade: index === 0 ? '2 Gut' : '',
}));

/** Filtert wie der echte Endpunkt (gemessen: unterschiedliche Zeiträume liefern unterschiedlich viele Treffer). */
export function mockExamsRest(startDate: WuDate, endDate: WuDate): RestExam[] {
  return STUDENT_EXAMS.filter((exam) => exam.examDate >= startDate && exam.examDate <= endDate);
}
