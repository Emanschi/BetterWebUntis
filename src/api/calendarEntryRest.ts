/**
 * Undokumentierte REST-Schnittstelle für die Detailansicht eines einzelnen
 * Stundenplan-Eintrags — insbesondere `teachingContent` ("Lehrstoff", Schüler-Konten).
 *
 * Hintergrund (Nutzerwunsch 2026-09-17, siehe IDEEN.md B8): Lehrkräfte können pro Stunde
 * Lehrstoff/Notizen eintragen. Die 2018er-JSON-RPC-Doku kennt dafür kein Feld auf `Period`
 * — das nächstliegende, `bkText`/`bkRemark` aus Abschnitt 15, ist tatsächlich etwas anderes,
 * ein Buchungshinweis (siehe IDEEN.md B7). Der Nutzer hat aus den Browser-DevTools der
 * originalen WebUntis-Oberfläche den Aufruf kopiert, den die Detailansicht eines
 * aufgeklappten Stundenplan-Eintrags dort tatsächlich macht — Nutzung ausdrücklich
 * freigegeben, siehe IDEEN.md A1 zur grundsätzlichen Haltung "nichts Undokumentiertes ohne
 * Freigabe".
 *
 * Gemessene Beispielantwort (Name/Ids unkenntlich gemacht, sonst wörtlich — nur die
 * tatsächlich genutzten Felder hier übernommen, das reale Objekt enthält deutlich mehr):
 *
 *   GET /WebUntis/api/rest/view/v2/calendar-entry/detail?elementId=<eigene personId>&
 *     elementType=5&startDateTime=2026-09-18T11:20:00&endDateTime=2026-09-18T12:10:00&
 *     homeworkOption=DUE
 *
 *   {"calendarEntries":[{"id":9059380, …,
 *     "teachingContent":"Diskussionsthemen sammeln\nandere überzeugen: Gurkerl Sommerferien\n
 *       Referatstermine und -themen\nBekanntgabe der Beurteilungskriterien", …}]}
 *
 * (Das reale Objekt enthält zusätzlich u. a. `subject`/`teachers`/`rooms`/`klasses` — bereits
 * aus dem Stundenplan bekannt, hier redundant —, `notesAll`/`notesStaff` (Notizfelder mit
 * unklarem Sichtbarkeits-Anspruch, in der gemessenen Antwort beide `null` — bewusst NICHT
 * übernommen, da nie mit befülltem Inhalt gemessen), `homeworks`, `booking`, `exam`,
 * `status`, `permissions` u. a. — bewusst NICHT in unseren Typ übernommen, da nur
 * `teachingContent` angezeigt wird, siehe `ui/components/PeriodDetail.tsx`.)
 *
 * Identifiziert einen Eintrag über die exakte Start-/Endzeit, nicht über eine Perioden-Id.
 * Bei einer im Stundenplan zusammengefassten Doppelstunde (siehe `domain/timetable.ts`
 * `mergeSubstitutions`) weichen die UI-Blockgrenzen von der echten Einzelstunden-Zeitspanne
 * ab — ein Treffer ist dafür nicht gemessen und nicht zu erwarten. Das ist kein Fehlerfall:
 * die Anfrage liefert dann einfach keinen Treffer (leeres `calendarEntries`), siehe
 * TESTING.md.
 *
 * Risiko und Fehlerbehandlung: wie `examsRest.ts` — ungemessenes Fehlerformat, nur grober
 * HTTP-Status (siehe `WebUntisClient.getRest`). Kein Retry bei Fehlschlag (siehe
 * `TimetableScreen.tsx`), um bei einem unbekannten Fehler (z. B. Rate-Limit) nicht
 * automatisch nachzuhaken.
 */

import type { WebUntisClient } from './client';
import type { PersonType } from './types';

export interface RestCalendarEntryDetail {
  id: number;
  teachingContent?: string;
}

interface RestCalendarEntryDetailResponse {
  calendarEntries: RestCalendarEntryDetail[];
}

export interface RestCalendarEntryDetailParams {
  /** personId des eingeloggten Kontos — siehe api/types.ts PersonType. */
  elementId: number;
  elementType: PersonType;
  /** "YYYY-MM-DDTHH:mm:ss", siehe api/format.ts wuDateTimeToIsoLocal. */
  startDateTime: string;
  endDateTime: string;
}

/** Liefert `undefined`, wenn kein Eintrag exakt auf die angefragte Zeitspanne passt. */
export async function getCalendarEntryDetailRest(
  client: WebUntisClient,
  params: RestCalendarEntryDetailParams,
): Promise<RestCalendarEntryDetail | undefined> {
  const response = await client.getRest<RestCalendarEntryDetailResponse>('/api/rest/view/v2/calendar-entry/detail', {
    elementId: params.elementId,
    elementType: params.elementType,
    startDateTime: params.startDateTime,
    endDateTime: params.endDateTime,
    homeworkOption: 'DUE',
  });
  return response.calendarEntries[0];
}
