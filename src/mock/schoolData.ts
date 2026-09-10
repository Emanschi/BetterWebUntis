/**
 * Stammdaten der Fake-Schule "Mock-HTL".
 *
 * Feldnamen und Formate folgen strikt der Doku (`2018-09-20-WebUntis_JSON_RPC_API.pdf`):
 * YYYYMMDD, HHMM, RRGGBB ohne '#'. Es werden nur Felder verwendet, die die jeweilige
 * Doku-Sektion auch tatsächlich nennt.
 *
 * Diese Daten sind rein synthetisch (keine echten Personen) und dienen ausschließlich
 * dazu, UI und Domain-Logik ohne echten Server testen zu können (PLAN.md M3).
 */

import type {
  ClassregCategory,
  ClassregCategoryGroup,
  Department,
  ExamType,
  Holiday,
  Klasse,
  Room,
  Schoolyear,
  StatusData,
  Student,
  Subject,
  Teacher,
  TimegridDay,
} from '../api/types';

// ---------------------------------------------------------------------------
// 12/13) Schuljahr
// ---------------------------------------------------------------------------

/** Aktuelles Schuljahr der Fake-Schule. */
export const CURRENT_SCHOOLYEAR: Schoolyear = {
  id: 1,
  name: '2026/2027',
  startDate: 20260907,
  endDate: 20270708,
};

export const SCHOOLYEARS: Schoolyear[] = [
  { id: 0, name: '2025/2026', startDate: 20250908, endDate: 20260709 },
  CURRENT_SCHOOLYEAR,
];

// ---------------------------------------------------------------------------
// 3) Lehrer
// ---------------------------------------------------------------------------

export const TEACHERS: Teacher[] = [
  { id: 10, name: 'MUS', foreName: 'Max', longName: 'Mustermann', foreColor: 'ffffff', backColor: '2b6cb0' },
  { id: 11, name: 'SCH', foreName: 'Anna', longName: 'Schmidt', foreColor: 'ffffff', backColor: '9f1239' },
  { id: 12, name: 'WEB', foreName: 'Peter', longName: 'Weber', foreColor: 'ffffff', backColor: '166534' },
  { id: 13, name: 'HUB', foreName: 'Lena', longName: 'Huber', foreColor: 'ffffff', backColor: 'a16207' },
  { id: 14, name: 'GRU', foreName: 'Tobias', longName: 'Gruber', foreColor: '000000', backColor: 'e2e8f0' },
  { id: 15, name: 'BAU', foreName: 'Sophie', longName: 'Bauer', foreColor: 'ffffff', backColor: '6b21a8' },
];

// ---------------------------------------------------------------------------
// 4) Schüler — die Testperson "Max Muster" ist unser eingeloggter Nutzer
// ---------------------------------------------------------------------------

export const STUDENTS: Student[] = [
  { id: 501, key: '5010001', name: 'MusterMax', foreName: 'Max', longName: 'Muster', gender: 'male' },
  { id: 502, key: '5010002', name: 'BeispielEva', foreName: 'Eva', longName: 'Beispiel', gender: 'female' },
  { id: 503, key: '5010003', name: 'TestNoah', foreName: 'Noah', longName: 'Test', gender: 'male' },
  { id: 504, key: '5010004', name: 'ProbeLea', foreName: 'Lea', longName: 'Probe', gender: 'female' },
];

// ---------------------------------------------------------------------------
// 5) Klassen
// ---------------------------------------------------------------------------

export const KLASSEN: Klasse[] = [
  {
    id: 101,
    name: '3AHIF',
    longName: 'Klasse 3AHIF',
    foreColor: 'ffffff',
    backColor: '1d4ed8',
    did: 1,
    teacher1: 10,
    teacher2: 11,
  },
  {
    id: 102,
    name: '2BHIF',
    longName: 'Klasse 2BHIF',
    foreColor: 'ffffff',
    backColor: 'be185d',
    did: 1,
    teacher1: 12,
  },
];

// ---------------------------------------------------------------------------
// 6) Fächer
// ---------------------------------------------------------------------------

export const SUBJECTS: Subject[] = [
  { id: 1, name: 'M', longName: 'Mathematik', foreColor: '000000', backColor: 'fca5a5' },
  { id: 2, name: 'D', longName: 'Deutsch', foreColor: '000000', backColor: 'fdba74' },
  { id: 3, name: 'E', longName: 'Englisch', foreColor: '000000', backColor: 'fde047' },
  { id: 4, name: 'SEW', longName: 'Software Engineering', foreColor: '000000', backColor: '86efac' },
  { id: 5, name: 'AM', longName: 'Angewandte Mathematik', foreColor: '000000', backColor: '7dd3fc' },
  { id: 6, name: 'BSP', longName: 'Bewegung und Sport', foreColor: '000000', backColor: 'c4b5fd' },
  { id: 7, name: 'REL', longName: 'Religion', foreColor: '000000', backColor: 'f0abfc' },
];

// ---------------------------------------------------------------------------
// 7) Räume
// ---------------------------------------------------------------------------

export const ROOMS: Room[] = [
  { id: 1, name: 'EDV1', longName: 'EDV-Saal 1', foreColor: '000000', backColor: 'e2e8f0' },
  { id: 2, name: 'EDV2', longName: 'EDV-Saal 2', foreColor: '000000', backColor: 'e2e8f0' },
  { id: 3, name: 'TURN1', longName: 'Turnsaal 1', foreColor: '000000', backColor: 'e2e8f0' },
  { id: 4, name: 'K201', longName: 'Klassenraum 201', foreColor: '000000', backColor: 'e2e8f0' },
  { id: 5, name: 'K105', longName: 'Klassenraum 105 (Ausweichraum)', foreColor: '000000', backColor: 'e2e8f0' },
];

// ---------------------------------------------------------------------------
// 8) Abteilungen
// ---------------------------------------------------------------------------

export const DEPARTMENTS: Department[] = [{ id: 1, name: 'HIF', longName: 'Höhere Informatik' }];

// ---------------------------------------------------------------------------
// 9) Feiertage / Ferien
//
// Ein Eintrag deckt bewusst einen Tag innerhalb des Generierungszeitraums der
// Testdaten ab, um den Randfall "Ferientag ohne Stunden" abzudecken.
// Siehe `timetable.ts`, MOCK_TODAY.
// ---------------------------------------------------------------------------

export const HOLIDAYS: Holiday[] = [
  { id: 1, name: 'Nationalfeiertag', longName: 'Nationalfeiertag', startDate: 20261026, endDate: 20261026 },
  { id: 2, name: 'Herbstferien', longName: 'Herbstferien', startDate: 20261102, endDate: 20261106 },
];

// ---------------------------------------------------------------------------
// 10) Timegrid — Montag bis Freitag, 7 Einheiten inkl. Mittagspause
//
// Doku Abschnitt 10: "1 = sunday, 2 = monday, ..., 7 = saturday" (Fliesstext).
// Samstag/Sonntag bleiben ohne timeUnits (leerer Tag).
// ---------------------------------------------------------------------------

const WEEKDAY_UNITS = [
  { startTime: 800, endTime: 850 },
  { startTime: 855, endTime: 945 },
  { startTime: 1000, endTime: 1050 },
  { startTime: 1055, endTime: 1145 },
  { startTime: 1150, endTime: 1240 },
  { startTime: 1310, endTime: 1400 },
  { startTime: 1405, endTime: 1455 },
];

export const TIMEGRID: TimegridDay[] = [
  { day: 1, timeUnits: [] }, // Sonntag
  { day: 2, timeUnits: WEEKDAY_UNITS }, // Montag
  { day: 3, timeUnits: WEEKDAY_UNITS }, // Dienstag
  { day: 4, timeUnits: WEEKDAY_UNITS }, // Mittwoch
  { day: 5, timeUnits: WEEKDAY_UNITS }, // Donnerstag
  { day: 6, timeUnits: WEEKDAY_UNITS }, // Freitag
  { day: 7, timeUnits: [] }, // Samstag
];

// ---------------------------------------------------------------------------
// 11) Status-Farben für lstype/code
// ---------------------------------------------------------------------------

export const STATUS_DATA: StatusData = {
  lstypes: [
    { ls: { foreColor: '000000', backColor: 'ee7f00' } },
    { oh: { foreColor: 'e6e3e1', backColor: '250eee' } },
    { sb: { foreColor: '000000', backColor: '1feee7' } },
    { bs: { foreColor: '000000', backColor: 'c03b6e' } },
    { ex: { foreColor: '000000', backColor: 'fdc400' } },
  ],
  codes: [
    { cancelled: { foreColor: '000000', backColor: 'b1b3b4' } },
    { irregular: { foreColor: 'e3e33b', backColor: '77649a' } },
  ],
};

// ---------------------------------------------------------------------------
// 21/22) Prüfungstypen
//
// Die Doku nennt für ExamType keine Felder (siehe types.ts). Hier wird nur
// das gesichert benötigte Feld `id` verwendet.
// ---------------------------------------------------------------------------

export const EXAM_TYPES: ExamType[] = [{ id: 1 }, { id: 2 }];

// ---------------------------------------------------------------------------
// 24/25) Bemerkungskategorien
// ---------------------------------------------------------------------------

export const CLASSREG_CATEGORIES: ClassregCategory[] = [
  { id: 1, name: 'disturbs', longName: 'stört den Unterricht' },
  { id: 2, name: 'homework_missing', longName: 'Hausübung vergessen', groupId: 1 },
  { id: 3, name: 'late', longName: 'zu spät gekommen', groupId: 2 },
];

export const CLASSREG_CATEGORY_GROUPS: ClassregCategoryGroup[] = [
  { id: 1, name: 'Unterrichtsverhalten' },
  { id: 2, name: 'Pünktlichkeit' },
];

/** Unix-Timestamp (Sekunden, siehe Hinweis in methods.ts) des letzten Fake-Imports. */
export const LATEST_IMPORT_TIME = 1_768_000_000;
