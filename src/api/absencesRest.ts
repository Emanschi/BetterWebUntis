/**
 * Undokumentierte REST-Schnittstelle für Abwesenheiten (Schüler-Konten).
 *
 * Gleiches Muster wie `api/examsRest.ts`: `getTimetableWithAbsences` (Doku Abschnitt 23)
 * ist für echte Schüler-Konten gesperrt (Code -8509, siehe TESTING.md), und im Gegensatz
 * zu Prüfungen gibt es dafür auch kein Feld im Stundenplan zum Umgehen. Der Nutzer hat den
 * Endpunkt, den die originale WebUntis-Oberfläche für die "Abwesenheiten"-Seite nutzt,
 * selbst aus den Browser-DevTools kopiert (2026-09-17) und dessen Nutzung freigegeben.
 *
 * Gemessene Beispielantwort (Name unkenntlich gemacht, sonst wörtlich):
 *
 *   GET /WebUntis/api/classreg/absences/students?startDate=20260907&endDate=20270704&studentId=<eigene personId>&excuseStatusId=-1
 *
 *   {"data":{"absences":[{"id":1350715,"startDate":20260911,"endDate":20260911,
 *     "startTime":750,"endTime":915,"reasonId":0,"reason":"","text":"",
 *     "isExcused":false,"excuseStatus":null,
 *     "excuse":{"id":-1,"text":"","excuseDate":0,"excuseStatus":"","isExcused":false,
 *       "userId":-1,"username":""}}],
 *     "absenceReasons":[],"excuseStatuses":null,
 *     "showAbsenceReasonChange":false,"showCreateAbsence":false}}
 *
 * (Das reale Objekt enthält zusätzlich `createDate`/`lastUpdate` (Unix-Millisekunden),
 * `createdUser`/`updatedUser` (Kürzel der Schulverwaltung), `canEdit`, `interruptions`,
 * `studentName` und ein verschachteltes `excuse`-Objekt — bewusst NICHT übernommen, aus
 * demselben Grund wie in `examsRest.ts`: für den eigenen Login reicht das Nötigste.)
 *
 * Einschränkung: bisher nur EIN Beispiel gemessen, und zwar eine noch unbearbeitete
 * Abwesenheit (`isExcused: false`, `excuseStatus: null`). Wie eine bereits entschuldigte
 * Abwesenheit aussieht (z. B. ob `excuseStatus` dann ein String ist, welche Werte er
 * annehmen kann), ist unklar. Die UI verlässt sich deshalb nur auf das zuverlässige Feld
 * (`isExcused`, ein Boolean) und zeigt `excuseStatus`/`reason`/`text` als Rohtext dazu,
 * ohne deren mögliche Werte zu deuten.
 *
 * Risiko und Fehlerbehandlung: siehe `examsRest.ts`, hier identisch (ungemessenes
 * Fehlerformat, nur grober HTTP-Status; Produktions-Proxy deckt den Pfad noch nicht ab).
 */

import type { WebUntisClient } from './client';
import type { WuDate, WuTime } from './types';

export interface RestAbsence {
  id: number;
  startDate: WuDate;
  endDate: WuDate;
  startTime: WuTime;
  endTime: WuTime;
  reason: string;
  text: string;
  isExcused: boolean;
  excuseStatus: string | null;
}

interface RestAbsencesResponse {
  data: { absences: RestAbsence[] };
}

export interface RestAbsencesParams {
  /** personId des eingeloggten Schüler-Kontos. */
  studentId: number;
  startDate: WuDate;
  endDate: WuDate;
}

export async function getAbsencesRest(client: WebUntisClient, params: RestAbsencesParams): Promise<RestAbsence[]> {
  const response = await client.getRest<RestAbsencesResponse>('/api/classreg/absences/students', {
    startDate: params.startDate,
    endDate: params.endDate,
    studentId: params.studentId,
    excuseStatusId: -1,
  });
  return response.data.absences;
}
