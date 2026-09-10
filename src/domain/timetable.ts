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
  blocks: TimetableBlock[];
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
    days.push({ date, blocks: mergeConsecutive(byDate.get(date) ?? []) });
  }
  return days;
}

// ---------------------------------------------------------------------------
// "Meine Termine" — Annäherung an Sprechstunden/Bereitschaft (IDEEN.md A4)
//
// Die Doku kennt dafür keine eigene Methode. lstype "oh" (office hour) und "sb"
// (standby) sind die einzigen Felder, die inhaltlich in diese Richtung gehen.
// ---------------------------------------------------------------------------

const APPOINTMENT_LSTYPES: readonly LessonType[] = ['oh', 'sb', 'bs'];

/** Filtert Perioden auf Sprechstunde/Bereitschaft/Pausenaufsicht, chronologisch sortiert. */
export function appointmentPeriods(periods: readonly Period[]): Period[] {
  return periods
    .filter((p) => p.lstype !== undefined && APPOINTMENT_LSTYPES.includes(p.lstype))
    .toSorted((a, b) => a.date - b.date || a.startTime - b.startTime);
}
