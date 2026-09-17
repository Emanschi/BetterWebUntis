/**
 * Undokumentierte REST-Schnittstelle für Prüfungen (Schüler-Konten).
 *
 * WICHTIG: Diese Datei ist bewusst von `methods.ts` getrennt. `methods.ts` deckt
 * ausschließlich die 2018er-JSON-RPC-Doku ab ("genau eine Funktion je dokumentierter
 * Methode — nichts darüber hinaus"). Dieser Endpunkt steht in KEINER Doku.
 *
 * Hintergrund (siehe IDEEN.md B3, TESTING.md): `getExams`/`getExamTypes` sind für echte
 * Schüler-Konten gesperrt (Code -8509, gemessen 2026-09-17), UND Prüfungsstunden sind im
 * Stundenplan selbst nicht strukturiert markiert — `getTimetable` liefert für so eine
 * Stunde weder `lstype` noch `code`, nur einen freien `info`-Text. Es gibt also keinen
 * Weg über die dokumentierte API, echte Prüfungsdaten zu bekommen.
 *
 * Der Nutzer hat daraufhin selbst die Browser-DevTools der originalen WebUntis-
 * Weboberfläche geöffnet (Network-Tab, eigenes Konto, 2026-09-17) und diesen Aufruf
 * gefunden — Nutzung ausdrücklich freigegeben, siehe IDEEN.md A1 zur grundsätzlichen
 * Haltung "nichts Undokumentiertes ohne Freigabe".
 *
 * Gemessene Beispielantwort (Name/Id des Kontos hier unkenntlich gemacht):
 *
 *   GET /WebUntis/api/exams?startDate=20260901&endDate=20260930&studentId=<eigene personId>&withGrades=true&klasseId=-1
 *
 *   {"data":{"exams":[{"id":0,"examType":"SA_TE","name":"NW2","studentClass":["3BHIF"],
 *     "examDate":20260918,"startTime":1220,"endTime":1310,"subject":"NW2",
 *     "teachers":["MAYR"],"rooms":["N306"],"text":"Nomenklatur","grade":""}]}}
 *
 * (Das reale Objekt enthält zusätzlich `assignedStudents` mit Namen und Nachteilsausgleich-/
 * Notenschutz-Flags der/des Schülerin/Schülers — bewusst NICHT in unseren Typ übernommen,
 * weil wir für den eigenen Login ohnehin nur die eigenen Daten sehen und diese Felder nicht
 * brauchen.)
 *
 * Risiko: könnte sich jederzeit ohne Vorwarnung ändern, da WebUntis nichts davon dokumentiert
 * oder garantiert — anders als die stabile 2018er-JSON-RPC-API. Das Fehlerformat dieses
 * Endpunkts wurde nie gemessen; Fehler werden deshalb nur grob als HTTP-Status behandelt
 * (siehe `WebUntisClient.getRest`), nicht mit der Rechte-Feinauflösung von `errors.ts`.
 *
 * Auch ungeklärt: ob die Authentifizierung wirklich (wie angenommen) über dasselbe
 * JSESSIONID-Cookie läuft wie die JSON-RPC-Session, oder einen eigenen Mechanismus
 * braucht — das lässt sich erst beim nächsten echten Login-Test zeigen.
 */

import type { WebUntisClient } from './client';
import type { WuDate, WuTime } from './types';

export interface RestExam {
  id: number;
  examType: string;
  name: string;
  studentClass: readonly string[];
  examDate: WuDate;
  startTime: WuTime;
  endTime: WuTime;
  subject: string;
  teachers: readonly string[];
  rooms: readonly string[];
  text: string;
  grade: string;
}

interface RestExamsResponse {
  data: { exams: RestExam[] };
}

export interface RestExamsParams {
  /** personId des eingeloggten Schüler-Kontos. */
  studentId: number;
  startDate: WuDate;
  endDate: WuDate;
}

export async function getExamsRest(client: WebUntisClient, params: RestExamsParams): Promise<RestExam[]> {
  const response = await client.getRest<RestExamsResponse>('/api/exams', {
    startDate: params.startDate,
    endDate: params.endDate,
    studentId: params.studentId,
    withGrades: true,
    klasseId: -1,
  });
  return response.data.exams;
}
