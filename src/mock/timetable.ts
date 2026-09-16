/**
 * Generiert einen mehrtägigen Fake-Stundenplan für die Klasse 3AHIF (id 101), die dort
 * eingeschriebene Testperson "Max Muster" (Student id 501) sowie die Lehrerin
 * Anna Schmidt (id 11) — inklusive der vom Auftrag geforderten Randfälle:
 *
 *   - Entfall               (Mittwoch, 1. Stunde — code "cancelled")
 *   - Vertretung             (Montag, 6./7. Stunde — code "irregular", Lehrerwechsel)
 *   - Raumänderung           (Freitag, 3. Stunde — code "irregular", Raumwechsel)
 *   - Doppelstunde            (Montag 1./2. sowie Donnerstag 6./7. Stunde)
 *   - Schularbeit (Prüfung)  (5 feste Donnerstags-Termine im Schuljahr, siehe FIXED_EXAM_DATES —
 *                            lstype "ex" + getExams-Eintrag; NICHT wöchentlich)
 *   - Sprechstunde           (Dienstag, Lehrer-Ansicht — lstype "oh", ohne Klassenbezug)
 *   - Bereitschaft           (Freitag, Lehrer-Ansicht — lstype "sb")
 *   - Ferientag               (siehe HOLIDAYS in schoolData.ts — an dem Tag keine Perioden)
 *
 * Alles ist deterministisch über den Wochentag definiert, nicht über ein festes Datum —
 * die Generierung funktioniert für jeden angefragten Zeitraum gleich.
 *
 * Feldnamen und Formate entsprechen der Doku (Abschnitt 14/15/19/21).
 */

import { addWuDays, wuDateToDate } from '../api/format';
import type {
  ElementField,
  Exam,
  LessonType,
  Period,
  PeriodCode,
  PeriodElementRef,
  Substitution,
  SubstitutionElementRef,
  WuDate,
} from '../api/types';
import { ElementType } from '../api/types';
import { HOLIDAYS, KLASSEN, ROOMS, SUBJECTS, TEACHERS } from './schoolData';

// ---------------------------------------------------------------------------
// Interne Repräsentation — datumslos, wird pro angefragtem Tag instanziiert
// ---------------------------------------------------------------------------

type Edge = 'cancelled' | 'substitution' | 'roomchange' | 'exam' | undefined;

interface WeeklySlot {
  /** JS-Wochentag: 1 = Montag ... 5 = Freitag. */
  weekday: number;
  /** Index in schoolData.TIMEGRID[*].timeUnits. */
  slotIndex: number;
  subjectId: number;
  teacherId: number;
  roomId: number;
  edge?: Edge;
}

/**
 * Wochentemplate der Klasse 3AHIF. Randfälle sind über `edge` markiert und werden
 * in `instantiateSlot()` in die passenden Doku-Felder übersetzt.
 */
const WEEKLY_TEMPLATE: WeeklySlot[] = [
  // Montag — Doppelstunde SEW, danach Vertretung in Englisch (6./7. Stunde)
  { weekday: 1, slotIndex: 0, subjectId: 4, teacherId: 11, roomId: 1 },
  { weekday: 1, slotIndex: 1, subjectId: 4, teacherId: 11, roomId: 1 },
  { weekday: 1, slotIndex: 2, subjectId: 1, teacherId: 10, roomId: 4 },
  { weekday: 1, slotIndex: 3, subjectId: 2, teacherId: 13, roomId: 4 },
  { weekday: 1, slotIndex: 5, subjectId: 3, teacherId: 14, roomId: 4, edge: 'substitution' },
  { weekday: 1, slotIndex: 6, subjectId: 3, teacherId: 14, roomId: 4, edge: 'substitution' },

  // Dienstag
  { weekday: 2, slotIndex: 0, subjectId: 3, teacherId: 14, roomId: 4 },
  { weekday: 2, slotIndex: 1, subjectId: 5, teacherId: 10, roomId: 4 },
  { weekday: 2, slotIndex: 2, subjectId: 6, teacherId: 12, roomId: 3 },
  { weekday: 2, slotIndex: 3, subjectId: 6, teacherId: 12, roomId: 3 },
  { weekday: 2, slotIndex: 5, subjectId: 7, teacherId: 15, roomId: 4 },

  // Mittwoch — Mathematik in der 1. Stunde entfällt
  { weekday: 3, slotIndex: 0, subjectId: 1, teacherId: 10, roomId: 4, edge: 'cancelled' },
  { weekday: 3, slotIndex: 1, subjectId: 2, teacherId: 13, roomId: 4 },
  { weekday: 3, slotIndex: 2, subjectId: 4, teacherId: 11, roomId: 1 },
  { weekday: 3, slotIndex: 3, subjectId: 4, teacherId: 11, roomId: 1 },

  // Donnerstag — Schularbeit in Angewandter Mathematik (3. Stunde), Doppelstunde am Nachmittag
  { weekday: 4, slotIndex: 0, subjectId: 3, teacherId: 14, roomId: 4 },
  { weekday: 4, slotIndex: 1, subjectId: 1, teacherId: 10, roomId: 4 },
  { weekday: 4, slotIndex: 2, subjectId: 5, teacherId: 10, roomId: 4, edge: 'exam' },
  { weekday: 4, slotIndex: 5, subjectId: 4, teacherId: 11, roomId: 1 },
  { weekday: 4, slotIndex: 6, subjectId: 4, teacherId: 11, roomId: 1 },

  // Freitag — Mathematik wandert wegen Sanierung von K201 in den EDV-Saal 2
  { weekday: 5, slotIndex: 0, subjectId: 2, teacherId: 13, roomId: 4 },
  { weekday: 5, slotIndex: 1, subjectId: 3, teacherId: 14, roomId: 4 },
  { weekday: 5, slotIndex: 2, subjectId: 1, teacherId: 10, roomId: 4, edge: 'roomchange' },
];

const KLASSE_ID = 101;
/** Max Muster (Student id 501) ist in der 3AHIF — sein Plan entspricht dem der Klasse. */
const STUDENT_ID = 501;

/** Vertretungslehrerin bei der Englisch-Vertretung am Montag (statt Tobias Gruber, id 14). */
const SUBSTITUTE_TEACHER_ID = 13;
/** Ausweichraum bei der Raumänderung am Freitag (statt Klassenraum 201, id 4). */
const SUBSTITUTE_ROOM_ID = 2;
/** examTypeId für die generierte Schularbeit — siehe schoolData.EXAM_TYPES. */
const EXAM_TYPE_ID = 1;

/**
 * Feste Termine der Schularbeiten in Angewandter Mathematik (Donnerstag, 3. Stunde,
 * siehe WEEKLY_TEMPLATE) — bewusst NICHT wöchentlich wiederkehrend wie die übrigen
 * Randfälle, sondern an konkrete Donnerstage im Schuljahr 2026/2027 gebunden. Eine
 * Schularbeit pro Woche wäre unrealistisch (Rückmeldung: "gefühlt 30 AM Prüfungen"
 * bei einer Abfrage über ±180 Tage). Fünf Termine über das Schuljahr verteilt, wie
 * bei echten Schularbeiten üblich.
 */
const FIXED_EXAM_DATES: readonly WuDate[] = [20260910, 20261119, 20270128, 20270318, 20270513];

/**
 * Ein ganztägiger Eintrag ohne Fach/Raum, code "irregular" — nachgebildet nach einem
 * echten Fund beim Smoke-Test gegen htlstp.webuntis.com (M10): "00:00–23:59, kein Fach,
 * kein Raum, irregular". Die Doku kennt diesen Fall nicht; wir bilden ihn hier bewusst
 * nach, damit domain/timetable.ts (allDayBlocks-Trennung) auch gegen den Mock sichtbar
 * getestet werden kann, nicht nur gegen den echten Server.
 */
const ALL_DAY_EVENT_DATE: WuDate = 20260908;

const SLOT_TIMES: Record<number, { startTime: number; endTime: number }> = {
  0: { startTime: 800, endTime: 850 },
  1: { startTime: 855, endTime: 945 },
  2: { startTime: 1000, endTime: 1050 },
  3: { startTime: 1055, endTime: 1145 },
  4: { startTime: 1150, endTime: 1240 },
  5: { startTime: 1310, endTime: 1400 },
  6: { startTime: 1405, endTime: 1455 },
};

/** Deterministische, kollisionsfreie Perioden-Id aus Datum und Slot-Index. */
function periodId(date: WuDate, slotIndex: number): number {
  return date * 10 + slotIndex;
}

function isHoliday(date: WuDate): boolean {
  return HOLIDAYS.some((h) => date >= h.startDate && date <= h.endDate);
}

/** Alle Kalendertage im Bereich [startDate, endDate], inklusive. */
function eachDate(startDate: WuDate, endDate: WuDate): WuDate[] {
  const dates: WuDate[] = [];
  let cursor = startDate;
  // Obergrenze als Sicherheitsnetz gegen falsch herum vertauschte Parameter.
  for (let i = 0; i < 3660 && cursor <= endDate; i++) {
    dates.push(cursor);
    cursor = addWuDays(cursor, 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Ein konkreter Tag im generierten Plan
// ---------------------------------------------------------------------------

interface RawPeriod {
  id: number;
  date: WuDate;
  startTime: number;
  endTime: number;
  klasseId?: number;
  teacherId: number;
  subjectId?: number;
  roomId?: number;
  lstype?: LessonType;
  code?: PeriodCode;
  substText?: string;
  info?: string;
  lstext?: string;
  studentGroup?: string;
  /** Nur gesetzt bei Vertretung/Raumänderung — Id des ursprünglichen Elements. */
  orgTeacherId?: number;
  orgRoomId?: number;
}

function instantiateSlot(slot: WeeklySlot, date: WuDate): RawPeriod {
  const times = SLOT_TIMES[slot.slotIndex];
  if (times === undefined) throw new Error(`Unbekannter Slot-Index: ${slot.slotIndex}`);

  const base: RawPeriod = {
    id: periodId(date, slot.slotIndex),
    date,
    startTime: times.startTime,
    endTime: times.endTime,
    klasseId: KLASSE_ID,
    teacherId: slot.teacherId,
    subjectId: slot.subjectId,
    roomId: slot.roomId,
    studentGroup: '3AHIF',
  };

  switch (slot.edge) {
    case 'cancelled':
      return { ...base, code: 'cancelled', substText: 'Entfall', info: 'Lehrkraft erkrankt' };
    case 'substitution':
      return {
        ...base,
        teacherId: SUBSTITUTE_TEACHER_ID,
        orgTeacherId: slot.teacherId,
        code: 'irregular',
        substText: 'Vertretung',
        info: 'Fachfremde Vertretung wegen Fortbildung',
      };
    case 'roomchange':
      return {
        ...base,
        roomId: SUBSTITUTE_ROOM_ID,
        orgRoomId: slot.roomId,
        code: 'irregular',
        substText: 'Raumänderung',
        info: 'K201 wegen Sanierung gesperrt',
      };
    case 'exam': {
      const ordinal = FIXED_EXAM_DATES.indexOf(date) + 1; // 1-basiert, nur fuer feste Termine aufgerufen
      return {
        ...base,
        lstype: 'ex',
        lstext: 'Schularbeit',
        info: `Angewandte Mathematik — ${ordinal}. Schularbeit`,
      };
    }
    default:
      return base;
  }
}

/**
 * Alle Perioden der Klasse 3AHIF im angefragten Zeitraum, inkl. der eingebauten Randfälle.
 *
 * Der wöchentliche Donnerstag-Slot mit `edge: 'exam'` im Template wird nur an den Terminen
 * aus `FIXED_EXAM_DATES` tatsächlich als Schularbeit gerendert — an allen anderen
 * Donnerstagen findet stattdessen die normale Angewandte-Mathematik-Stunde statt.
 */
function classPeriodsInRange(startDate: WuDate, endDate: WuDate): RawPeriod[] {
  const result: RawPeriod[] = [];
  for (const date of eachDate(startDate, endDate)) {
    if (isHoliday(date)) continue; // Ferientag: keine Perioden (siehe getHolidays)
    const weekday = wuDateToDate(date).getDay();
    if (weekday === 0 || weekday === 6) continue; // Wochenende
    for (const slot of WEEKLY_TEMPLATE) {
      if (slot.weekday !== weekday) continue;
      const isExamSlot = slot.edge === 'exam';
      const appliesToday = !isExamSlot || FIXED_EXAM_DATES.includes(date);
      result.push(instantiateSlot(appliesToday ? slot : { ...slot, edge: undefined }, date));
    }
    if (date === ALL_DAY_EVENT_DATE) {
      result.push({
        id: periodId(date, 9), // 9: außerhalb des Slot-Index-Bereichs (0–6), kollisionsfrei
        date,
        startTime: 0,
        endTime: 2359,
        klasseId: KLASSE_ID,
        teacherId: 10,
        code: 'irregular',
        substText: 'Schulveranstaltung (ganztägig)',
      });
    }
  }
  return result;
}

/**
 * Persönliche Zusatztermine einer Lehrperson ohne Klassenbezug — Annäherung an
 * "Meine Termine / Sprechstunden" (IDEEN.md A4, da die API keine eigene Methode dafür hat).
 */
function personalPeriodsInRange(teacherId: number, startDate: WuDate, endDate: WuDate): RawPeriod[] {
  const result: RawPeriod[] = [];
  for (const date of eachDate(startDate, endDate)) {
    if (isHoliday(date)) continue;
    const weekday = wuDateToDate(date).getDay();
    // Sprechstunde: Anna Schmidt (11), Dienstag, freier Slot 4
    if (teacherId === 11 && weekday === 2) {
      const times = SLOT_TIMES[4];
      if (times !== undefined) {
        result.push({
          id: periodId(date, 4),
          date,
          startTime: times.startTime,
          endTime: times.endTime,
          teacherId,
          roomId: 4,
          lstype: 'oh',
        });
      }
    }
    // Bereitschaft: Peter Weber (12), Freitag, freier Slot 4
    if (teacherId === 12 && weekday === 5) {
      const times = SLOT_TIMES[4];
      if (times !== undefined) {
        result.push({
          id: periodId(date, 4) + 1, // +1, um Kollision mit evtl. anderer Sprechstunde am selben Slot zu vermeiden
          date,
          startTime: times.startTime,
          endTime: times.endTime,
          teacherId,
          roomId: 3,
          lstype: 'sb',
        });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rendering ins Doku-Format
// ---------------------------------------------------------------------------

function pickFields(
  id: number,
  named: { name?: string; longname?: string } | undefined,
  fields: readonly ElementField[] | undefined,
): PeriodElementRef {
  if (fields === undefined) return { id };
  const ref: PeriodElementRef = { id };
  if (fields.includes('name') && named?.name !== undefined) ref.name = named.name;
  if (fields.includes('longname') && named?.longname !== undefined) ref.longname = named.longname;
  // externalkey: unsere Fake-Stammdaten pflegen bewusst keine externen Schluessel fuer
  // Stundenplan-Elemente (nur getTimetableWithAbsences tut das, siehe absences.ts) —
  // ein angefordertes 'externalkey' bleibt damit korrekt weg (Doku: "omitted if empty").
  return ref;
}

function teacherRef(id: number, fields?: readonly ElementField[]): PeriodElementRef {
  const t = TEACHERS.find((x) => x.id === id);
  return pickFields(id, t === undefined ? undefined : { name: t.name, longname: t.longName }, fields);
}
function subjectRef(id: number, fields?: readonly ElementField[]): PeriodElementRef {
  const s = SUBJECTS.find((x) => x.id === id);
  return pickFields(id, s === undefined ? undefined : { name: s.name, longname: s.longName }, fields);
}
function roomRef(id: number, fields?: readonly ElementField[]): PeriodElementRef {
  const r = ROOMS.find((x) => x.id === id);
  return pickFields(id, r === undefined ? undefined : { name: r.name, longname: r.longName }, fields);
}
function klasseRef(id: number, fields?: readonly ElementField[]): PeriodElementRef {
  const k = KLASSEN.find((x) => x.id === id);
  return pickFields(id, k === undefined ? undefined : { name: k.name, longname: k.longName }, fields);
}

export interface RenderOptions {
  showInfo?: boolean | undefined;
  showSubstText?: boolean | undefined;
  showLsText?: boolean | undefined;
  showLsNumber?: boolean | undefined;
  showStudentgroup?: boolean | undefined;
  klasseFields?: readonly ElementField[] | undefined;
  roomFields?: readonly ElementField[] | undefined;
  subjectFields?: readonly ElementField[] | undefined;
  teacherFields?: readonly ElementField[] | undefined;
}

/** Doku Abschnitt 15 — customizable Variante: *Fields und show*-Flags steuern den Umfang. */
export function toCustomPeriod(raw: RawPeriod, options: RenderOptions): Period {
  const period: Period = { id: raw.id, date: raw.date, startTime: raw.startTime, endTime: raw.endTime };
  if (raw.klasseId !== undefined) period.kl = [klasseRef(raw.klasseId, options.klasseFields)];
  period.te = [teacherRef(raw.teacherId, options.teacherFields)];
  if (raw.subjectId !== undefined) period.su = [subjectRef(raw.subjectId, options.subjectFields)];
  if (raw.roomId !== undefined) period.ro = [roomRef(raw.roomId, options.roomFields)];
  if (raw.lstype !== undefined) period.lstype = raw.lstype;
  if (raw.code !== undefined) period.code = raw.code;
  if (options.showInfo === true && raw.info !== undefined) period.info = raw.info;
  if (options.showSubstText === true && raw.substText !== undefined) period.substText = raw.substText;
  if (options.showLsText === true && raw.lstext !== undefined) period.lstext = raw.lstext;
  if (options.showLsNumber === true) period.lsnumber = raw.id;
  if (options.showStudentgroup === true && raw.studentGroup !== undefined) period.sg = raw.studentGroup;
  return period;
}

/** Doku Abschnitt 14 — einfache Variante: nur Ids, keine *Fields, aber lstext/statflags/activityType erlaubt. */
export function toSimplePeriod(raw: RawPeriod): Period {
  const period: Period = { id: raw.id, date: raw.date, startTime: raw.startTime, endTime: raw.endTime };
  if (raw.klasseId !== undefined) period.kl = [{ id: raw.klasseId }];
  period.te = [{ id: raw.teacherId }];
  if (raw.subjectId !== undefined) period.su = [{ id: raw.subjectId }];
  if (raw.roomId !== undefined) period.ro = [{ id: raw.roomId }];
  if (raw.lstype !== undefined) period.lstype = raw.lstype;
  if (raw.code !== undefined) period.code = raw.code;
  if (raw.lstext !== undefined) period.lstext = raw.lstext;
  return period;
}

function toSubstitutionElementRef(id: number, orgId: number | undefined): SubstitutionElementRef {
  return orgId === undefined ? { id } : { id, orgid: orgId };
}

/** Doku Abschnitt 19. Nur Perioden mit einem der drei abgebildeten Randfaelle liefern einen Eintrag. */
export function toSubstitution(raw: RawPeriod): Substitution | undefined {
  if (raw.code === 'cancelled') {
    return {
      type: 'cancel',
      lsid: raw.id,
      date: raw.date,
      startTime: raw.startTime,
      endTime: raw.endTime,
      ...(raw.klasseId === undefined ? {} : { kl: [{ id: raw.klasseId }] }),
      te: [{ id: raw.teacherId }],
      ...(raw.subjectId === undefined ? {} : { su: [{ id: raw.subjectId }] }),
      ...(raw.roomId === undefined ? {} : { ro: [{ id: raw.roomId }] }),
      ...(raw.substText === undefined ? {} : { txt: raw.substText }),
    };
  }
  if (raw.orgTeacherId !== undefined) {
    return {
      type: 'subst',
      lsid: raw.id,
      date: raw.date,
      startTime: raw.startTime,
      endTime: raw.endTime,
      ...(raw.klasseId === undefined ? {} : { kl: [{ id: raw.klasseId }] }),
      te: [toSubstitutionElementRef(raw.teacherId, raw.orgTeacherId)],
      ...(raw.subjectId === undefined ? {} : { su: [{ id: raw.subjectId }] }),
      ...(raw.roomId === undefined ? {} : { ro: [{ id: raw.roomId }] }),
      ...(raw.substText === undefined ? {} : { txt: raw.substText }),
    };
  }
  if (raw.orgRoomId !== undefined) {
    return {
      type: 'rmchg',
      lsid: raw.id,
      date: raw.date,
      startTime: raw.startTime,
      endTime: raw.endTime,
      ...(raw.klasseId === undefined ? {} : { kl: [{ id: raw.klasseId }] }),
      te: [{ id: raw.teacherId }],
      ...(raw.subjectId === undefined ? {} : { su: [{ id: raw.subjectId }] }),
      ...(raw.roomId === undefined ? {} : { ro: [toSubstitutionElementRef(raw.roomId, raw.orgRoomId)] }),
      ...(raw.substText === undefined ? {} : { txt: raw.substText }),
    };
  }
  return undefined;
}

/** Doku Abschnitt 21. Eine Schularbeit je Woche (Donnerstag) mit examTypeId 1. */
export function toExam(raw: RawPeriod): Exam | undefined {
  if (raw.lstype !== 'ex' || raw.klasseId === undefined || raw.subjectId === undefined) return undefined;
  return {
    id: raw.id,
    classes: [raw.klasseId],
    teachers: [raw.teacherId],
    students: [STUDENT_ID, 502, 503, 504],
    subject: raw.subjectId,
    date: raw.date,
    startTime: raw.startTime,
    endTime: raw.endTime,
  };
}

// ---------------------------------------------------------------------------
// Öffentliche Abfragefunktionen für den rpcHandler
// ---------------------------------------------------------------------------

export interface MockElement {
  id: number | string;
  type: (typeof ElementType)[keyof typeof ElementType];
}

/**
 * Liefert die Roh-Perioden für ein angefragtes Element. Unbekannte Elemente liefern ein
 * leeres Ergebnis statt eines Fehlers — ein Element ohne Unterricht ist ein gültiger
 * Zustand (z. B. ein Fach, das diese Woche nicht unterrichtet wird).
 */
export function rawPeriodsForElement(element: MockElement, startDate: WuDate, endDate: WuDate): RawPeriod[] {
  const id = typeof element.id === 'string' ? Number(element.id) : element.id;

  if (element.type === ElementType.KLASSE && id === KLASSE_ID) {
    return classPeriodsInRange(startDate, endDate);
  }
  if (element.type === ElementType.STUDENT && id === STUDENT_ID) {
    return classPeriodsInRange(startDate, endDate);
  }
  if (element.type === ElementType.TEACHER) {
    const own = classPeriodsInRange(startDate, endDate).filter((p) => p.teacherId === id);
    return [...own, ...personalPeriodsInRange(id, startDate, endDate)];
  }
  if (element.type === ElementType.SUBJECT) {
    return classPeriodsInRange(startDate, endDate).filter((p) => p.subjectId === id);
  }
  if (element.type === ElementType.ROOM) {
    return classPeriodsInRange(startDate, endDate).filter((p) => p.roomId === id);
  }
  return [];
}

export function mockSubstitutions(startDate: WuDate, endDate: WuDate): Substitution[] {
  return classPeriodsInRange(startDate, endDate)
    .map(toSubstitution)
    .filter((s): s is Substitution => s !== undefined);
}

export function mockExams(examTypeId: number, startDate: WuDate, endDate: WuDate): Exam[] {
  if (examTypeId !== EXAM_TYPE_ID) return [];
  return classPeriodsInRange(startDate, endDate)
    .map(toExam)
    .filter((e): e is Exam => e !== undefined);
}

export { KLASSE_ID, STUDENT_ID };
