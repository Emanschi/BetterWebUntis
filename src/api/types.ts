/**
 * TypeScript-Typen für die WebUntis JSON-RPC API.
 *
 * Quelle: `2018-09-20-WebUntis_JSON_RPC_API.pdf`. Jeder Typ trägt die Abschnittsnummer
 * der Doku. Es werden ausschließlich dort dokumentierte Felder abgebildet — nichts erfunden.
 *
 * Globale Konventionen (Doku, Seite 1):
 *   - Zeichensatz: UTF-8
 *   - Datum:  YYYYMMDD als Zahl, z. B. 20110117
 *   - Zeit:   HHMM     als Zahl, z. B. 800 = 08:00, 1425 = 14:25
 *   - Farbe:  RRGGBB   als String ohne '#'
 *   - "fields in the result may be omitted if empty" — deshalb ist praktisch jedes
 *     nicht zwingende Feld hier optional.
 */

/** Datum im Format YYYYMMDD, z. B. 20110117. */
export type WuDate = number;
/** Uhrzeit im Format HHMM, z. B. 800 (08:00) oder 1425 (14:25). */
export type WuTime = number;
/** Farbe im Format RRGGBB ohne führendes '#', z. B. "ee7f00". */
export type WuColor = string;

// ---------------------------------------------------------------------------
// Enums / Konstanten
// ---------------------------------------------------------------------------

/** Doku Abschnitt 1: personType im authenticate-Result. */
export const PersonType = {
  TEACHER: 2,
  STUDENT: 5,
} as const;
export type PersonType = (typeof PersonType)[keyof typeof PersonType];

/** Doku Abschnitt 14/15: Elementtyp für getTimetable. */
export const ElementType = {
  KLASSE: 1,
  TEACHER: 2,
  SUBJECT: 3,
  ROOM: 4,
  STUDENT: 5,
} as const;
export type ElementType = (typeof ElementType)[keyof typeof ElementType];

/** Doku Abschnitt 15: keyType im element-Objekt. */
export type KeyType = 'id' | 'name' | 'externalkey';

/** Doku Abschnitt 15: erlaubte Werte in klasseFields/roomFields/subjectFields/teacherFields. */
export type ElementField = 'id' | 'name' | 'longname' | 'externalkey';

/**
 * Doku Abschnitt 14/15: lstype einer Periode.
 * Wird weggelassen, wenn es sich um eine normale Unterrichtsstunde ("ls") handelt.
 */
export type LessonType = 'ls' | 'oh' | 'sb' | 'bs' | 'ex';

/** Doku Abschnitt 14/15: code einer Periode. Wird weggelassen, wenn leer. */
export type PeriodCode = '' | 'cancelled' | 'irregular';

/** Doku Abschnitt 19: type eines Substitution-Objekts. */
export type SubstitutionType =
  | 'cancel' // cancellation
  | 'subst' // teacher substitution
  | 'add' // additional period
  | 'shift' // shifted period
  | 'rmchg' // room change
  | 'rmlk' // locked period
  | 'bs' // break supervision
  | 'oh' // office hour
  | 'sb' // standby
  | 'other' // foreign substitutions
  | 'free' // free period
  | 'exam' // exam
  | 'ac' // activity
  | 'holi' // holiday
  | 'stxt'; // substitution text

// ---------------------------------------------------------------------------
// 1) authenticate
// ---------------------------------------------------------------------------

export interface AuthenticateParams {
  user: string;
  password: string;
  /** Eindeutiger Bezeichner der Client-App. Laut Doku künftig verpflichtend. */
  client: string;
}

export interface AuthenticateResult {
  sessionId: string;
  personType: PersonType;
  personId: number;
}

// ---------------------------------------------------------------------------
// 3) getTeachers  /  4) getStudents  /  5) getKlassen
// 6) getSubjects  /  7) getRooms     /  8) getDepartments
// ---------------------------------------------------------------------------

export interface Teacher {
  id: number;
  name: string;
  foreName: string;
  longName: string;
  foreColor?: WuColor;
  backColor?: WuColor;
}

export interface Student {
  id: number;
  /** Externer Schlüssel des Schülers. */
  key: string;
  name: string;
  foreName: string;
  longName: string;
  gender: string;
}

export interface Klasse {
  id: number;
  name: string;
  longName: string;
  foreColor?: WuColor;
  backColor?: WuColor;
  /** Abteilungs-Id (department id). */
  did?: number;
  teacher1?: number;
  teacher2?: number;
}

export interface Subject {
  id: number;
  name: string;
  longName: string;
  foreColor?: WuColor;
  backColor?: WuColor;
}

export interface Room {
  id: number;
  name: string;
  longName: string;
  foreColor?: WuColor;
  backColor?: WuColor;
}

export interface Department {
  id: number;
  name: string;
  longName: string;
}

// ---------------------------------------------------------------------------
// 9) getHolidays
// ---------------------------------------------------------------------------

export interface Holiday {
  id: number;
  name: string;
  longName: string;
  startDate: WuDate;
  endDate: WuDate;
}

// ---------------------------------------------------------------------------
// 10) getTimegridUnits
// ---------------------------------------------------------------------------

export interface TimeUnit {
  startTime: WuTime;
  endTime: WuTime;
}

/**
 * Doku Abschnitt 10.
 *
 * ACHTUNG — Widerspruch in der Doku: der Fließtext sagt "1 = sunday, 2 = monday, ..., 7 = saturday",
 * das Beispiel-Response daneben zeigt aber `{"day":0}` und `{"day":1}`. Wir halten uns an den
 * Fließtext (1..7) und behandeln das Beispiel als Tippfehler. `weekdayFromTimegridDay()` in
 * `format.ts` ist gegenüber beiden Varianten tolerant. Gegen den echten Server verifizieren
 * (siehe TESTING.md).
 */
export interface TimegridDay {
  day: number;
  timeUnits: TimeUnit[];
}

// ---------------------------------------------------------------------------
// 11) getStatusData
// ---------------------------------------------------------------------------

export interface StatusColors {
  foreColor: WuColor;
  backColor: WuColor;
}

/**
 * Doku Abschnitt 11. Die API liefert Arrays von Ein-Schlüssel-Objekten, z. B.
 * `[{"ls":{...}}, {"oh":{...}}]` — nicht ein einzelnes Objekt.
 */
export interface StatusData {
  lstypes: Array<Record<string, StatusColors>>;
  codes: Array<Record<string, StatusColors>>;
}

// ---------------------------------------------------------------------------
// 12) getCurrentSchoolyear  /  13) getSchoolyears
// ---------------------------------------------------------------------------

export interface Schoolyear {
  id: number;
  name: string;
  startDate: WuDate;
  endDate: WuDate;
}

// ---------------------------------------------------------------------------
// 14) getTimetable (simple)  /  15) getTimetable (customizable)
// ---------------------------------------------------------------------------

/**
 * Referenz auf ein Element innerhalb einer Periode.
 * Welche Felder befüllt sind, steuern die *Fields-Parameter (Doku Abschnitt 15).
 * Ohne *Fields liefert die API nur `id`.
 */
export interface PeriodElementRef {
  id?: number;
  name?: string;
  longname?: string;
  externalkey?: string;
}

/**
 * Periode aus getTimetable. Deckt die einfache (Abschnitt 14) und die
 * customizable Variante (Abschnitt 15) ab; die Zusatzfelder der customizable
 * Variante sind optional und erscheinen nur, wenn die passende Option gesetzt war.
 */
export interface Period {
  id: number;
  date: WuDate;
  startTime: WuTime;
  endTime: WuTime;
  kl?: PeriodElementRef[];
  te?: PeriodElementRef[];
  su?: PeriodElementRef[];
  ro?: PeriodElementRef[];
  /** Weggelassen, wenn die Periode eine normale Unterrichtsstunde ist. */
  lstype?: LessonType;
  /** Weggelassen, wenn leer. */
  code?: PeriodCode;
  /** Nur mit showInfo: true. */
  info?: string;
  /** Untis-Vertretungstext, nur mit showSubstText: true. */
  substText?: string;
  /** Nur mit showLsText: true. */
  lstext?: string;
  /** Nur mit showLsNumber: true. */
  lsnumber?: number;
  /** Statistik-Kennzeichen, weggelassen wenn leer. */
  statflags?: string;
  /** Weggelassen wenn leer. */
  activityType?: string;
  /** Name der Schülergruppe, nur mit showStudentgroup: true. */
  sg?: string;
  /** Nur mit showBooking: true. */
  bkRemark?: string;
  /** Nur mit showBooking: true. */
  bkText?: string;
}

/** Doku Abschnitt 14: Parameter der einfachen Variante. */
export interface SimpleTimetableParams {
  id: number;
  type: ElementType;
  startDate?: WuDate | undefined;
  endDate?: WuDate | undefined;
}

/** Doku Abschnitt 15: element-Objekt innerhalb von options. */
export interface TimetableElement {
  /** Interne Id, Name oder externer Schlüssel — je nach keyType. */
  id: number | string;
  type: ElementType;
  keyType?: KeyType | undefined;
}

/** Doku Abschnitt 15: das options-Objekt der customizable Variante. */
export interface TimetableOptions {
  element: TimetableElement;
  startDate?: WuDate | undefined;
  endDate?: WuDate | undefined;
  onlyBaseTimetable?: boolean | undefined;
  showBooking?: boolean | undefined;
  showInfo?: boolean | undefined;
  showSubstText?: boolean | undefined;
  showLsText?: boolean | undefined;
  showLsNumber?: boolean | undefined;
  showStudentgroup?: boolean | undefined;
  klasseFields?: ElementField[] | undefined;
  roomFields?: ElementField[] | undefined;
  subjectFields?: ElementField[] | undefined;
  teacherFields?: ElementField[] | undefined;
}

// ---------------------------------------------------------------------------
// 18) getPersonId
// ---------------------------------------------------------------------------

export interface PersonIdParams {
  /** 2 = teacher oder 5 = student. */
  type: PersonType;
  /** Nachname. */
  sn: string;
  /** Vorname. */
  fn: string;
  /** Geburtsdatum, 0 wenn unbekannt. */
  dob: WuDate | 0;
}

// ---------------------------------------------------------------------------
// 19) getSubstitutions
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 19, "id object". Enthält zusätzlich die org*-Felder, die das
 * ursprüngliche (ersetzte) Element beschreiben.
 */
export interface SubstitutionElementRef {
  id: number;
  name?: string;
  externalkey?: string;
  /** Id des ursprünglichen Elements, das hier ersetzt wird. */
  orgid?: number;
  orgname?: string;
  orgexternalkey?: string;
}

/** Doku Abschnitt 19, "reschedule object". */
export interface Reschedule {
  date: WuDate;
  startTime: WuTime;
  endTime: WuTime;
}

export interface Substitution {
  type: SubstitutionType;
  /** Id der betroffenen Lesson. */
  lsid: number;
  date: WuDate;
  startTime: WuTime;
  endTime: WuTime;
  kl?: SubstitutionElementRef[];
  te?: SubstitutionElementRef[];
  su?: SubstitutionElementRef[];
  ro?: SubstitutionElementRef[];
  /** Vertretungstext. */
  txt?: string;
  /**
   * Nur bei type "cancel" und "shift":
   *   shift  — Datum/Zeit der ursprünglichen, verschobenen Periode
   *   cancel — Datum/Zeit der neuen Periode
   */
  reschedule?: Reschedule;
}

export interface SubstitutionsParams {
  startDate: WuDate;
  endDate: WuDate;
  /** Pflicht. 0 für alle Abteilungen bzw. wenn nicht zutreffend. */
  departmentId: number;
}

// ---------------------------------------------------------------------------
// 20) / 26) getClassregEvents
// ---------------------------------------------------------------------------

export interface ClassregEvent {
  studentid: string;
  surname: string;
  forname: string;
  date: WuDate;
  subject: string;
  reason: string;
  text: string;
  /** Id der Bemerkungskategorie. */
  categoryId: number;
}

/** Doku Abschnitt 20: globale Variante. */
export interface ClassregEventsParams {
  startDate: WuDate;
  endDate: WuDate;
}

/** Doku Abschnitt 26: Variante für ein einzelnes Element. */
export interface ClassregEventsForElementOptions {
  startDate: WuDate;
  endDate: WuDate;
  element: {
    id: number | string;
    /** Laut Doku nur 1 = klasse oder 5 = student. */
    type: typeof ElementType.KLASSE | typeof ElementType.STUDENT;
    keyType?: KeyType | undefined;
  };
}

// ---------------------------------------------------------------------------
// 21) getExams  /  22) getExamTypes
// ---------------------------------------------------------------------------

export interface Exam {
  id: number;
  classes: number[];
  teachers: number[];
  students: number[];
  subject: number;
  date: WuDate;
  startTime: WuTime;
  endTime: WuTime;
}

export interface ExamsParams {
  /** Pflichtparameter laut Doku — es gibt keine Abfrage über alle Typen hinweg. */
  examTypeId: number;
  startDate: WuDate;
  endDate: WuDate;
}

/**
 * Doku Abschnitt 22 nennt für ExamType KEINE Felder und zeigt kein Beispiel-Response.
 * Gesichert ist nur, dass getExams eine `examTypeId` benötigt — also muss es eine Id geben.
 * Alles Weitere ist gegen den echten Server zu verifizieren (siehe TESTING.md), deshalb hier
 * bewusst offen gehalten statt Felder zu erfinden.
 */
export interface ExamType {
  id: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 23) getTimetableWithAbsences
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 23.
 * ACHTUNG: Dieses Objekt referenziert Elemente über **externe Schlüssel** (Strings),
 * nicht über die internen Ids wie der Rest der API.
 */
export interface PeriodWithAbsence {
  date: WuDate;
  startTime: WuTime;
  endTime: WuTime;
  /** Externer Schlüssel des Schülers. */
  studentId: string;
  /** Externer Schlüssel des Fachs. */
  subjectId: string;
  /** Externe Schlüssel der Lehrer. */
  teacherIds: string[];
  studentGroup: string;
  /** Nur gesetzt, wenn die Periode keine reguläre Periode ist. */
  status?: 'irregular';
  absenceReason?: string;
  /** Anzahl der Minuten, die der Schüler abwesend war. */
  absentTime?: number;
  excuseStatus?: string;
  /** Externer Schlüssel des Benutzers, der die Abwesenheiten kontrolliert hat. */
  user: string;
  checked: boolean;
  /** Laut Doku derzeit nur für Norwegen und Schweden verfügbar. */
  invalid?: boolean;
}

export interface TimetableWithAbsencesOptions {
  startDate: WuDate;
  endDate: WuDate;
}

/** Doku Abschnitt 23: das Result ist ein Objekt, kein Array. */
export interface TimetableWithAbsencesResult {
  periodsWithAbsences: PeriodWithAbsence[];
}

// ---------------------------------------------------------------------------
// 24) getClassregCategories  /  25) getClassregCategoryGroups
// ---------------------------------------------------------------------------

export interface ClassregCategory {
  id: number;
  name: string;
  longName: string;
  groupId?: number;
}

export interface ClassregCategoryGroup {
  id: number;
  name: string;
}
