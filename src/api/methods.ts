/**
 * Die dokumentierten Methoden der WebUntis JSON-RPC API — je Methode genau eine Funktion.
 *
 * Es gibt hier **nur** Methoden, die in `2018-09-20-WebUntis_JSON_RPC_API.pdf` stehen.
 * Die Abschnittsnummer der Doku steht jeweils im Kommentar. Nichts erfunden, nichts ergänzt.
 *
 * Abschnitt 16 der Doku ist als "no longer supported" markiert und fehlt deshalb bewusst.
 */

import type { WebUntisClient } from './client';
import type {
  AuthenticateParams,
  AuthenticateResult,
  ClassregCategory,
  ClassregCategoryGroup,
  ClassregEvent,
  ClassregEventsForElementOptions,
  ClassregEventsParams,
  Department,
  Exam,
  ExamType,
  ExamsParams,
  Holiday,
  Klasse,
  Period,
  PersonIdParams,
  Room,
  Schoolyear,
  SimpleTimetableParams,
  StatusData,
  Student,
  Subject,
  Substitution,
  SubstitutionsParams,
  Teacher,
  TimegridDay,
  TimetableOptions,
  TimetableWithAbsencesOptions,
  TimetableWithAbsencesResult,
  WuDate,
} from './types';

// ---------------------------------------------------------------------------
// 1) Authentication  /  2) Logout
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 1. Meldet den Benutzer an und startet eine Session.
 * Die Session-Id wird im Client hinterlegt und danach als `JSESSIONID`-Cookie mitgeschickt.
 */
export async function authenticate(
  client: WebUntisClient,
  credentials: Omit<AuthenticateParams, 'client'>,
): Promise<AuthenticateResult> {
  const result = await client.call<AuthenticateResult>('authenticate', {
    user: credentials.user,
    password: credentials.password,
    client: client.clientId,
  });
  client.rememberAuthentication(result);
  return result;
}

/**
 * Doku Abschnitt 2. Beendet die Session.
 * "An application should always logout as soon as possible to free system resources on the server."
 * Die lokale Session wird auch dann verworfen, wenn der Server-Aufruf fehlschlägt.
 */
export async function logout(client: WebUntisClient): Promise<void> {
  try {
    await client.call<unknown>('logout', {});
  } finally {
    client.clearSession();
  }
}

// ---------------------------------------------------------------------------
// 3–8) Stammdaten
// ---------------------------------------------------------------------------

/** Doku Abschnitt 3. Recht: masterdata teachers read for all. */
export function getTeachers(client: WebUntisClient): Promise<Teacher[]> {
  return client.call<Teacher[]>('getTeachers', {});
}

/** Doku Abschnitt 4. Recht: masterdata students read for all. */
export function getStudents(client: WebUntisClient): Promise<Student[]> {
  return client.call<Student[]>('getStudents', {});
}

/** Doku Abschnitt 5. Recht: masterdata Klassen read for all. Ohne `schoolyearId` das aktuelle Schuljahr. */
export function getKlassen(client: WebUntisClient, schoolyearId?: number): Promise<Klasse[]> {
  return client.call<Klasse[]>('getKlassen', schoolyearId === undefined ? {} : { schoolyearId });
}

/** Doku Abschnitt 6. */
export function getSubjects(client: WebUntisClient): Promise<Subject[]> {
  return client.call<Subject[]>('getSubjects', {});
}

/** Doku Abschnitt 7. */
export function getRooms(client: WebUntisClient): Promise<Room[]> {
  return client.call<Room[]>('getRooms', {});
}

/** Doku Abschnitt 8. */
export function getDepartments(client: WebUntisClient): Promise<Department[]> {
  return client.call<Department[]>('getDepartments', {});
}

// ---------------------------------------------------------------------------
// 9–13) Kalender, Raster, Status, Schuljahre
// ---------------------------------------------------------------------------

/** Doku Abschnitt 9. */
export function getHolidays(client: WebUntisClient): Promise<Holiday[]> {
  return client.call<Holiday[]>('getHolidays', {});
}

/** Doku Abschnitt 10. Siehe Hinweis zur Tagesnummerierung bei `TimegridDay`. */
export function getTimegridUnits(client: WebUntisClient): Promise<TimegridDay[]> {
  return client.call<TimegridDay[]>('getTimegridUnits', {});
}

/** Doku Abschnitt 11. Farben für lstypes und codes. */
export function getStatusData(client: WebUntisClient): Promise<StatusData> {
  return client.call<StatusData>('getStatusData', {});
}

/**
 * Doku Abschnitt 12.
 *
 * Die Doku zeigt als Result ein **Array** mit einem Element. In der Praxis liefern
 * manche Server direkt ein Objekt. Wir normalisieren beides auf ein Schoolyear und
 * verifizieren das beim Smoke-Test gegen den echten Server (siehe TESTING.md).
 */
export async function getCurrentSchoolyear(client: WebUntisClient): Promise<Schoolyear> {
  const result = await client.call<Schoolyear | Schoolyear[]>('getCurrentSchoolyear', {});
  if (Array.isArray(result)) {
    const first = result[0];
    if (first === undefined) {
      throw new Error('getCurrentSchoolyear lieferte ein leeres Array.');
    }
    return first;
  }
  return result;
}

/** Doku Abschnitt 13. */
export function getSchoolyears(client: WebUntisClient): Promise<Schoolyear[]> {
  return client.call<Schoolyear[]>('getSchoolyears', {});
}

// ---------------------------------------------------------------------------
// 14/15) Stundenplan
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 14 — einfache Variante.
 * Recht: timetable view für das angefragte Element.
 * Ohne startDate/endDate liefert der Server den aktuellen Tag.
 */
export function getTimetable(client: WebUntisClient, params: SimpleTimetableParams): Promise<Period[]> {
  const payload: Record<string, unknown> = { id: params.id, type: params.type };
  if (params.startDate !== undefined) payload['startDate'] = params.startDate;
  if (params.endDate !== undefined) payload['endDate'] = params.endDate;
  return client.call<Period[]>('getTimetable', payload);
}

/**
 * Doku Abschnitt 15 — customizable Variante.
 * Liefert deutlich mehr Details (info, substText, lstext, Studentgroup, benannte Elemente)
 * und ist deshalb die bevorzugte Variante für die App.
 */
export function getTimetableCustom(client: WebUntisClient, options: TimetableOptions): Promise<Period[]> {
  const element: Record<string, unknown> = {
    id: options.element.id,
    type: options.element.type,
  };
  if (options.element.keyType !== undefined) element['keyType'] = options.element.keyType;

  const payload: Record<string, unknown> = { element };
  const passthrough = [
    'startDate',
    'endDate',
    'onlyBaseTimetable',
    'showBooking',
    'showInfo',
    'showSubstText',
    'showLsText',
    'showLsNumber',
    'showStudentgroup',
    'klasseFields',
    'roomFields',
    'subjectFields',
    'teacherFields',
  ] as const;
  for (const key of passthrough) {
    const value = options[key];
    if (value !== undefined) payload[key] = value;
  }

  return client.call<Period[]>('getTimetable', { options: payload });
}

// ---------------------------------------------------------------------------
// 17/18) Import-Zeitpunkt, Personensuche
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 17. Unix-Timestamp des letzten Untis-Imports.
 *
 * Die Doku sagt nur "Unix timestamp" und nennt keine Einheit. Der Wert wird deshalb
 * unverändert durchgereicht; die Einheit (Sekunden oder Millisekunden) ist beim
 * Smoke-Test zu klären (siehe TESTING.md).
 */
export function getLatestImportTime(client: WebUntisClient): Promise<number> {
  return client.call<number>('getLatestImportTime', {});
}

/** Doku Abschnitt 18. Liefert die Id oder 0, wenn keine passende Person gefunden wurde. */
export function getPersonId(client: WebUntisClient, params: PersonIdParams): Promise<number> {
  return client.call<number>('getPersonId', {
    type: params.type,
    sn: params.sn,
    fn: params.fn,
    dob: params.dob,
  });
}

// ---------------------------------------------------------------------------
// 19) Vertretungen
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 19. Recht: any timetable view.
 * `departmentId` ist Pflicht — 0 steht für alle Abteilungen.
 */
export function getSubstitutions(
  client: WebUntisClient,
  params: SubstitutionsParams,
): Promise<Substitution[]> {
  return client.call<Substitution[]>('getSubstitutions', {
    startDate: params.startDate,
    endDate: params.endDate,
    departmentId: params.departmentId,
  });
}

// ---------------------------------------------------------------------------
// 20/26) Klassenbucheinträge
// ---------------------------------------------------------------------------

/** Doku Abschnitt 20. Recht: classregevents read for all. */
export function getClassregEvents(
  client: WebUntisClient,
  params: ClassregEventsParams,
): Promise<ClassregEvent[]> {
  return client.call<ClassregEvent[]>('getClassregEvents', {
    startDate: params.startDate,
    endDate: params.endDate,
  });
}

/** Doku Abschnitt 26. Gleiche Methode, aber für ein einzelnes Element. Recht: classevent. */
export function getClassregEventsForElement(
  client: WebUntisClient,
  options: ClassregEventsForElementOptions,
): Promise<ClassregEvent[]> {
  const element: Record<string, unknown> = {
    id: options.element.id,
    type: options.element.type,
  };
  if (options.element.keyType !== undefined) element['keyType'] = options.element.keyType;

  return client.call<ClassregEvent[]>('getClassregEvents', {
    options: { startDate: options.startDate, endDate: options.endDate, element },
  });
}

// ---------------------------------------------------------------------------
// 21/22) Prüfungen
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 21. Recht: examinations read for all.
 * `examTypeId` ist Pflicht — es gibt keine Abfrage über alle Typen hinweg.
 * Für "alle Prüfungen des Schuljahres" muss über `getExamTypes` iteriert werden.
 */
export function getExams(client: WebUntisClient, params: ExamsParams): Promise<Exam[]> {
  return client.call<Exam[]>('getExams', {
    examTypeId: params.examTypeId,
    startDate: params.startDate,
    endDate: params.endDate,
  });
}

/** Doku Abschnitt 22. Recht: examtypes read for all. Die Doku nennt keine Felder — siehe `ExamType`. */
export function getExamTypes(client: WebUntisClient): Promise<ExamType[]> {
  return client.call<ExamType[]>('getExamTypes', {});
}

// ---------------------------------------------------------------------------
// 23) Abwesenheiten
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 23. Recht: Student absences.
 * Achtung: das Result ist ein Objekt mit `periodsWithAbsences`, kein Array,
 * und referenziert Elemente über externe Schlüssel statt über interne Ids.
 */
export async function getTimetableWithAbsences(
  client: WebUntisClient,
  options: TimetableWithAbsencesOptions,
): Promise<TimetableWithAbsencesResult> {
  return client.call<TimetableWithAbsencesResult>('getTimetableWithAbsences', {
    options: { startDate: options.startDate, endDate: options.endDate },
  });
}

// ---------------------------------------------------------------------------
// 24/25) Bemerkungskategorien
// ---------------------------------------------------------------------------

/** Doku Abschnitt 24. Recht: classregister. */
export function getClassregCategories(client: WebUntisClient): Promise<ClassregCategory[]> {
  return client.call<ClassregCategory[]>('getClassregCategories', {});
}

/** Doku Abschnitt 25. Recht: classregister. */
export function getClassregCategoryGroups(client: WebUntisClient): Promise<ClassregCategoryGroup[]> {
  return client.call<ClassregCategoryGroup[]>('getClassregCategoryGroups', {});
}

// ---------------------------------------------------------------------------

/** Datumsbereich, wie ihn mehrere Methoden erwarten. */
export interface DateRange {
  startDate: WuDate;
  endDate: WuDate;
}
