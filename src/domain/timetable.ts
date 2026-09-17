/**
 * Fachlogik für die Stundenplan-Ansicht: Perioden zu einem Wochenraster gruppieren,
 * benachbarte identische Perioden zu Doppelstunden-Blöcken zusammenfassen, und
 * Vertretungsinformationen aus `getSubstitutions` in die Perioden mergen.
 *
 * Bewusst reine Funktionen ohne Netzzugriff (PLAN.md: "ui/ und domain/ reden nie
 * direkt mit dem Netz, nur über api/methods.ts").
 */

import { addWuDays, wuTimeToMinutes } from '../api/format';
import type { LessonType, Period, PeriodCode, PeriodElementRef, Substitution, WuDate, WuTime } from '../api/types';

// ---------------------------------------------------------------------------
// Vertretungen in Perioden mergen
// ---------------------------------------------------------------------------

/**
 * Welcher Substitution-Typ (Doku Abschnitt 19) welchen Perioden-Code (Doku Abschnitt 15)
 * ergibt — nur für die Typen, bei denen die Zuordnung eindeutig ist. Für alle anderen
 * (bs/oh/sb/add/shift/…) wird kein Code geraten, nur der Text übernommen, falls vorhanden.
 */
const CODE_BY_SUBSTITUTION_TYPE: Partial<Record<Substitution['type'], PeriodCode>> = {
  cancel: 'cancelled',
  subst: 'irregular',
  rmchg: 'irregular',
};

/**
 * Reichert Perioden mit Informationen aus `getSubstitutions` an, ohne bereits vorhandene
 * Felder zu überschreiben — `getTimetable` mit `showSubstText`/`showInfo` liefert oft
 * schon dieselbe Information direkt an der Periode; der Merge deckt den Fall ab, dass
 * diese Felder fehlen oder eine zusätzliche Quelle herangezogen werden soll.
 */
export function mergeSubstitutions(periods: readonly Period[], substitutions: readonly Substitution[]): Period[] {
  const byLsid = new Map<number, Substitution>();
  for (const sub of substitutions) byLsid.set(sub.lsid, sub);

  return periods.map((period) => {
    const sub = byLsid.get(period.id);
    if (sub === undefined) return period;

    const merged: Period = { ...period };
    const inferredCode = CODE_BY_SUBSTITUTION_TYPE[sub.type];
    if (merged.code === undefined && inferredCode !== undefined) merged.code = inferredCode;
    if (merged.substText === undefined && sub.txt !== undefined) merged.substText = sub.txt;
    return merged;
  });
}

// ---------------------------------------------------------------------------
// Wochenraster
// ---------------------------------------------------------------------------

export interface TimetableBlock {
  /** Ids aller zusammengefassten Perioden — mehr als eine bei einer Doppelstunde. */
  periodIds: number[];
  date: WuDate;
  startTime: WuTime;
  endTime: WuTime;
  subject?: PeriodElementRef;
  teacher?: PeriodElementRef;
  room?: PeriodElementRef;
  klasse?: PeriodElementRef;
  lstype?: LessonType;
  code?: PeriodCode;
  info?: string;
  substText?: string;
  lstext?: string;
  studentGroup?: string;
}

export interface TimetableDay {
  date: WuDate;
  /** Reguläre, zeitlich begrenzte Perioden (siehe `ALL_DAY_THRESHOLD_MINUTES`). */
  blocks: TimetableBlock[];
  /**
   * Perioden, die (fast) den ganzen Tag überspannen — kommen real vor (z. B. schulweite
   * Ereignisse), sind in der Doku aber nicht als eigener Typ beschrieben. Getrennt von
   * `blocks`, damit sie die Zeitachse des Rasters nicht auf 24 Stunden aufblähen und
   * normale Stunden dadurch winzig würden. Gefunden beim Smoke-Test gegen den echten
   * Server (M10): ein Eintrag "00:00–23:59, kein Fach, kein Raum, code irregular".
   */
  allDayBlocks: TimetableBlock[];
}

/**
 * Ab dieser Dauer gilt eine Periode als "ganztägig" statt als reguläre Unterrichtsstunde.
 * Keine Doku-Vorgabe — eine reale Schulstunde dauert nie annähernd einen ganzen Tag,
 * 10 Stunden liegt sicher über jeder denkbaren Doppel-/Mehrfachstunde.
 */
const ALL_DAY_THRESHOLD_MINUTES = 10 * 60;

function isAllDayBlock(block: Pick<TimetableBlock, 'startTime' | 'endTime'>): boolean {
  return wuTimeToMinutes(block.endTime) - wuTimeToMinutes(block.startTime) >= ALL_DAY_THRESHOLD_MINUTES;
}

function toBlock(period: Period): TimetableBlock {
  const block: TimetableBlock = {
    periodIds: [period.id],
    date: period.date,
    startTime: period.startTime,
    endTime: period.endTime,
  };
  if (period.su?.[0] !== undefined) block.subject = period.su[0];
  if (period.te?.[0] !== undefined) block.teacher = period.te[0];
  if (period.ro?.[0] !== undefined) block.room = period.ro[0];
  if (period.kl?.[0] !== undefined) block.klasse = period.kl[0];
  if (period.lstype !== undefined) block.lstype = period.lstype;
  if (period.code !== undefined) block.code = period.code;
  if (period.info !== undefined) block.info = period.info;
  if (period.substText !== undefined) block.substText = period.substText;
  if (period.lstext !== undefined) block.lstext = period.lstext;
  if (period.sg !== undefined) block.studentGroup = period.sg;
  return block;
}

/**
 * Zwischen echten "Doppelstunden" liegt in der Praxis meist trotzdem die normale
 * kurze Pause aus dem Timegrid (in unseren Mock-Daten z. B. 5 Minuten, siehe
 * schoolData.ts) — die Perioden sind im API-Sinn nie wirklich nahtlos. Eine feste
 * Nulltoleranz würde also keine einzige reale Doppelstunde erkennen. 15 Minuten
 * deckt die kurzen Zwischenpausen ab, bleibt aber deutlich unter der Mittagspause
 * (in unseren Mock-Daten 30 Minuten) — eine bewusste Heuristik, kein Wert aus der Doku.
 */
const MAX_GAP_MINUTES_FOR_DOUBLE_PERIOD = 15;

/** Zwei Blöcke gelten als "dieselbe Stunde" (Doppelstunde), wenn nur eine kurze Pause dazwischen liegt. */
function isSameLesson(a: TimetableBlock, b: TimetableBlock): boolean {
  const gapMinutes = wuTimeToMinutes(b.startTime) - wuTimeToMinutes(a.endTime);
  return (
    gapMinutes >= 0 &&
    gapMinutes <= MAX_GAP_MINUTES_FOR_DOUBLE_PERIOD &&
    a.subject?.id === b.subject?.id &&
    a.teacher?.id === b.teacher?.id &&
    a.room?.id === b.room?.id &&
    a.code === b.code &&
    a.lstype === b.lstype
  );
}

/** Fasst direkt aufeinanderfolgende, inhaltlich identische Perioden zu einem Block zusammen. */
function mergeConsecutive(periods: readonly Period[]): TimetableBlock[] {
  const sorted = [...periods].sort((a, b) => a.startTime - b.startTime);
  const blocks: TimetableBlock[] = [];
  for (const period of sorted) {
    const block = toBlock(period);
    const previous = blocks.at(-1);
    if (previous !== undefined && isSameLesson(previous, block)) {
      previous.endTime = block.endTime;
      previous.periodIds.push(...block.periodIds);
    } else {
      blocks.push(block);
    }
  }
  return blocks;
}

/**
 * Baut ein 7-Tage-Raster ab `weekStart` (siehe `wuWeekRange` in api/format.ts für den
 * passenden Wochenanfang). Tage ohne Perioden erscheinen mit leerem `blocks`-Array,
 * nicht als fehlender Eintrag — die UI kann jeden Wochentag gleich behandeln.
 */
export function buildWeekGrid(periods: readonly Period[], weekStart: WuDate): TimetableDay[] {
  const byDate = new Map<WuDate, Period[]>();
  for (const period of periods) {
    const list = byDate.get(period.date) ?? [];
    list.push(period);
    byDate.set(period.date, list);
  }

  const days: TimetableDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addWuDays(weekStart, i);
    const merged = mergeConsecutive(byDate.get(date) ?? []);
    const blocks: TimetableBlock[] = [];
    const allDayBlocks: TimetableBlock[] = [];
    for (const block of merged) (isAllDayBlock(block) ? allDayBlocks : blocks).push(block);
    days.push({ date, blocks, allDayBlocks });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Zeitraster (Kalender-Ansicht, M5-Nachbesserung): wie hoch/weit ist die Achse,
// die ein TimeAxis-/DayGridColumn-Paar in der UI zeichnet. Reine Mathematik ohne
// React, damit sie unabhängig von der Komponente testbar ist.
// ---------------------------------------------------------------------------

export interface TimeBounds {
  /** Minuten seit Mitternacht, an denen die Achse beginnt (auf volle Stunde abgerundet). */
  startMinutes: number;
  /** Minuten seit Mitternacht, an denen die Achse endet (auf volle Stunde aufgerundet). */
  endMinutes: number;
}

/** Fallback-Rahmen, wenn eine Woche keine einzige Periode hat (sonst gäbe es keine Achse). */
export const DEFAULT_TIME_BOUNDS: TimeBounds = { startMinutes: 8 * 60, endMinutes: 16 * 60 };

/** Spannt die Zeitachse über die früheste/späteste Periode der übergebenen Tage, auf volle Stunde gerundet. */
export function computeTimeBounds(days: readonly TimetableDay[]): TimeBounds {
  let min = Infinity;
  let max = -Infinity;
  for (const day of days) {
    for (const block of day.blocks) {
      min = Math.min(min, wuTimeToMinutes(block.startTime));
      max = Math.max(max, wuTimeToMinutes(block.endTime));
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return DEFAULT_TIME_BOUNDS;
  return { startMinutes: Math.floor(min / 60) * 60, endMinutes: Math.ceil(max / 60) * 60 };
}

/** Volle-Stunden-Markierungen innerhalb der Achse, inklusive der Randwerte. */
export function timeBoundsHourMarks(bounds: TimeBounds): number[] {
  const marks: number[] = [];
  for (let m = bounds.startMinutes; m <= bounds.endMinutes; m += 60) marks.push(m);
  return marks;
}
