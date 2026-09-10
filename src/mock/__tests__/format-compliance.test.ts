/**
 * "Kein Erfinden von Testdaten außerhalb der API-Struktur" (Projektauftrag Abschnitt 1):
 * jedes Datum, jede Zeit und jede Farbe in den Fake-Daten muss dem Doku-Format
 * entsprechen (YYYYMMDD, HHMM, RRGGBB) — geprüft mit denselben Validatoren, die auch
 * echte Server-Antworten validieren würden.
 */
import { describe, expect, it } from 'vitest';
import { isValidWuColor, isValidWuDate, isValidWuTime } from '../../api/format';
import {
  CLASSREG_CATEGORIES,
  CLASSREG_CATEGORY_GROUPS,
  CURRENT_SCHOOLYEAR,
  DEPARTMENTS,
  EXAM_TYPES,
  HOLIDAYS,
  KLASSEN,
  ROOMS,
  SCHOOLYEARS,
  STATUS_DATA,
  STUDENTS,
  SUBJECTS,
  TEACHERS,
  TIMEGRID,
} from '../schoolData';
import { mockAbsences } from '../absences';
import { mockClassregEvents } from '../classreg';
import { mockExams, mockSubstitutions, rawPeriodsForElement, toCustomPeriod, toSimplePeriod } from '../timetable';
import { ElementType } from '../../api/types';

const RANGE_START = 20260907; // Montag
const RANGE_END = 20260918; // zwei Wochen

describe('Stammdaten entsprechen dem Doku-Format', () => {
  it('Klassen/Teacher/Rooms/Subjects: Farben sind RRGGBB ohne #', () => {
    for (const entity of [...TEACHERS, ...KLASSEN, ...SUBJECTS, ...ROOMS]) {
      if (entity.foreColor !== undefined) expect(isValidWuColor(entity.foreColor)).toBe(true);
      if (entity.backColor !== undefined) expect(isValidWuColor(entity.backColor)).toBe(true);
    }
  });

  it('Holidays: startDate/endDate sind gueltige YYYYMMDD und startDate <= endDate', () => {
    for (const h of HOLIDAYS) {
      expect(isValidWuDate(h.startDate)).toBe(true);
      expect(isValidWuDate(h.endDate)).toBe(true);
      expect(h.startDate).toBeLessThanOrEqual(h.endDate);
    }
  });

  it('Schoolyears: gueltige Daten, aktuelles Schuljahr ist Teil der Liste', () => {
    for (const y of [...SCHOOLYEARS, CURRENT_SCHOOLYEAR]) {
      expect(isValidWuDate(y.startDate)).toBe(true);
      expect(isValidWuDate(y.endDate)).toBe(true);
    }
    expect(SCHOOLYEARS).toContainEqual(CURRENT_SCHOOLYEAR);
  });

  it('Timegrid: 7 Tage, Zeiten sind gueltige HHMM, startTime < endTime', () => {
    expect(TIMEGRID).toHaveLength(7);
    for (const day of TIMEGRID) {
      expect(day.day).toBeGreaterThanOrEqual(1);
      expect(day.day).toBeLessThanOrEqual(7);
      for (const unit of day.timeUnits) {
        expect(isValidWuTime(unit.startTime)).toBe(true);
        expect(isValidWuTime(unit.endTime)).toBe(true);
        expect(unit.startTime).toBeLessThan(unit.endTime);
      }
    }
  });

  it('StatusData: nur dokumentierte lstypes/codes, gueltige Farben', () => {
    const allowedLstypes = new Set(['ls', 'oh', 'sb', 'bs', 'ex']);
    const allowedCodes = new Set(['cancelled', 'irregular']);
    for (const entry of STATUS_DATA.lstypes) {
      const [key, colors] = Object.entries(entry)[0]!;
      expect(allowedLstypes.has(key)).toBe(true);
      expect(isValidWuColor(colors.foreColor)).toBe(true);
      expect(isValidWuColor(colors.backColor)).toBe(true);
    }
    for (const entry of STATUS_DATA.codes) {
      const [key, colors] = Object.entries(entry)[0]!;
      expect(allowedCodes.has(key)).toBe(true);
      expect(isValidWuColor(colors.foreColor)).toBe(true);
      expect(isValidWuColor(colors.backColor)).toBe(true);
    }
  });

  it('IDs sind eindeutig innerhalb jeder Stammdaten-Liste', () => {
    for (const list of [TEACHERS, STUDENTS, KLASSEN, SUBJECTS, ROOMS, DEPARTMENTS, EXAM_TYPES]) {
      const ids = list.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('ClassregCategories referenzieren nur existierende Gruppen', () => {
    const groupIds = new Set(CLASSREG_CATEGORY_GROUPS.map((g) => g.id));
    for (const category of CLASSREG_CATEGORIES) {
      if (category.groupId !== undefined) expect(groupIds.has(category.groupId)).toBe(true);
    }
  });
});

describe('Generierte Stundenplandaten entsprechen dem Doku-Format', () => {
  const raw = rawPeriodsForElement({ id: 101, type: ElementType.KLASSE }, RANGE_START, RANGE_END);

  it('jede Periode hat gueltiges Datum und gueltige Zeiten, startTime < endTime', () => {
    expect(raw.length).toBeGreaterThan(0);
    for (const r of raw) {
      expect(isValidWuDate(r.date)).toBe(true);
      expect(isValidWuTime(r.startTime)).toBe(true);
      expect(isValidWuTime(r.endTime)).toBe(true);
      expect(r.startTime).toBeLessThan(r.endTime);
    }
  });

  it('gerenderte customizable Perioden referenzieren nur bekannte Stammdaten-Ids', () => {
    const teacherIds = new Set(TEACHERS.map((t) => t.id));
    const subjectIds = new Set(SUBJECTS.map((s) => s.id));
    const roomIds = new Set(ROOMS.map((r) => r.id));
    const klasseIds = new Set(KLASSEN.map((k) => k.id));

    for (const period of raw.map((r) => toCustomPeriod(r, {}))) {
      for (const te of period.te ?? []) if (te.id !== undefined) expect(teacherIds.has(te.id)).toBe(true);
      for (const su of period.su ?? []) if (su.id !== undefined) expect(subjectIds.has(su.id)).toBe(true);
      for (const ro of period.ro ?? []) if (ro.id !== undefined) expect(roomIds.has(ro.id)).toBe(true);
      for (const kl of period.kl ?? []) if (kl.id !== undefined) expect(klasseIds.has(kl.id)).toBe(true);
    }
  });

  it('lstype/code sind nur dokumentierte Werte', () => {
    const allowedLstype = new Set(['ls', 'oh', 'sb', 'bs', 'ex', undefined]);
    const allowedCode = new Set(['', 'cancelled', 'irregular', undefined]);
    for (const period of raw.map((r) => toSimplePeriod(r))) {
      expect(allowedLstype.has(period.lstype)).toBe(true);
      expect(allowedCode.has(period.code)).toBe(true);
    }
  });

  it('Wochenende und Ferientage erzeugen keine Perioden', () => {
    // 20261026 (Montag) ist ein Feiertag in HOLIDAYS
    const aroundHoliday = rawPeriodsForElement({ id: 101, type: ElementType.KLASSE }, 20261024, 20261028);
    expect(aroundHoliday.some((p) => p.date === 20261026)).toBe(false);
    // Samstag/Sonntag im selben Bereich sollten ebenfalls leer sein
    expect(aroundHoliday.some((p) => [20261024, 20261025].includes(p.date))).toBe(false);
  });

  it('Vertretungen referenzieren existierende Perioden-Ids (lsid)', () => {
    const periodIds = new Set(raw.map((r) => r.id));
    const subs = mockSubstitutions(RANGE_START, RANGE_END);
    expect(subs.length).toBeGreaterThan(0);
    for (const sub of subs) expect(periodIds.has(sub.lsid)).toBe(true);
  });

  it('Pruefungen haben gueltige Daten und referenzieren existierende Klassen/Faecher', () => {
    const exams = mockExams(1, RANGE_START, RANGE_END);
    expect(exams.length).toBeGreaterThan(0);
    const subjectIds = new Set(SUBJECTS.map((s) => s.id));
    const klasseIds = new Set(KLASSEN.map((k) => k.id));
    for (const exam of exams) {
      expect(isValidWuDate(exam.date)).toBe(true);
      expect(isValidWuTime(exam.startTime)).toBe(true);
      expect(isValidWuTime(exam.endTime)).toBe(true);
      expect(exam.classes.every((id) => klasseIds.has(id))).toBe(true);
      expect(subjectIds.has(exam.subject)).toBe(true);
      expect(exam.students.length).toBeGreaterThan(0);
    }
  });

  it('Abwesenheiten referenzieren nur externe Schluessel, keine internen Ids (Doku Abschnitt 23)', () => {
    const absences = mockAbsences(RANGE_START, RANGE_END);
    expect(absences.length).toBeGreaterThan(0);
    for (const a of absences) {
      expect(isValidWuDate(a.date)).toBe(true);
      expect(typeof a.studentId).toBe('string');
      expect(typeof a.subjectId).toBe('string');
      expect(a.teacherIds.every((id) => typeof id === 'string')).toBe(true);
      expect(Number.isNaN(Number(a.studentId))).toBe(true); // kein numerischer String, ist ein Schluessel
    }
  });

  it('Klassenbucheintraege haben gueltige Daten', () => {
    const events = mockClassregEvents(RANGE_START, RANGE_END);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(isValidWuDate(e.date)).toBe(true);
  });
});
