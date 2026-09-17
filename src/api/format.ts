/**
 * Konverter für die Datenformate der WebUntis JSON-RPC API.
 *
 * Doku Seite 1:
 *   date format:  YYYYMMDD
 *   time format:  HHMM
 *   color format: RRGGBB
 *
 * Alle Werte sind Zahlen (nicht Strings) — 800 bedeutet 08:00, nicht 800 Minuten.
 * Datumsangaben sind reine Kalenderdaten ohne Zeitzone; wir bilden sie auf lokale
 * Mitternacht ab, damit Tagesvergleiche nicht über UTC-Grenzen springen.
 */

import type { WuColor, WuDate, WuTime } from './types';

// ---------------------------------------------------------------------------
// Datum: YYYYMMDD
// ---------------------------------------------------------------------------

export function isValidWuDate(value: number): value is WuDate {
  if (!Number.isInteger(value) || value < 10000101 || value > 99991231) return false;
  const month = Math.floor(value / 100) % 100;
  const day = value % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Rückrechnung fängt Fälle wie 20110230 ab.
  return toWuDate(wuDateToDateUnchecked(value)) === value;
}

function wuDateToDateUnchecked(value: WuDate): Date {
  const year = Math.floor(value / 10000);
  const month = Math.floor(value / 100) % 100;
  const day = value % 100;
  return new Date(year, month - 1, day);
}

/** YYYYMMDD → Date (lokale Mitternacht). Wirft bei ungültigem Datum. */
export function wuDateToDate(value: WuDate): Date {
  if (!isValidWuDate(value)) {
    throw new RangeError(`Ungueltiges WebUntis-Datum: ${value} (erwartet YYYYMMDD)`);
  }
  return wuDateToDateUnchecked(value);
}

/** Date → YYYYMMDD, ausgewertet in lokaler Zeit. */
export function toWuDate(date: Date): WuDate {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** YYYYMMDD plus n Tage (n darf negativ sein). */
export function addWuDays(value: WuDate, days: number): WuDate {
  const date = wuDateToDate(value);
  date.setDate(date.getDate() + days);
  return toWuDate(date);
}

/** Anzahl Kalendertage von `from` bis `to` (negativ, wenn `to` davor liegt). */
export function wuDateDiffInDays(from: WuDate, to: WuDate): number {
  const ms = wuDateToDate(to).getTime() - wuDateToDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Montag..Sonntag der Woche, in der `value` liegt.
 * `weekStartsOn` folgt der JS-Konvention: 0 = Sonntag, 1 = Montag (Default).
 */
export function wuWeekRange(value: WuDate, weekStartsOn: 0 | 1 = 1): { startDate: WuDate; endDate: WuDate } {
  const date = wuDateToDate(value);
  const shift = (date.getDay() - weekStartsOn + 7) % 7;
  const start = addWuDays(value, -shift);
  return { startDate: start, endDate: addWuDays(start, 6) };
}

/** YYYYMMDD als lokalisierter String, z. B. "17.01.2011". */
export function formatWuDate(value: WuDate, locale = 'de-AT', options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: 'medium' }).format(wuDateToDate(value));
}

// ---------------------------------------------------------------------------
// Zeit: HHMM
// ---------------------------------------------------------------------------

export function isValidWuTime(value: number): value is WuTime {
  if (!Number.isInteger(value) || value < 0 || value > 2359) return false;
  return value % 100 < 60;
}

/** HHMM → Minuten seit Mitternacht. 800 → 480, 1425 → 865. */
export function wuTimeToMinutes(value: WuTime): number {
  if (!isValidWuTime(value)) {
    throw new RangeError(`Ungueltige WebUntis-Zeit: ${value} (erwartet HHMM)`);
  }
  return Math.floor(value / 100) * 60 + (value % 100);
}

/** Minuten seit Mitternacht → HHMM. 480 → 800. */
export function minutesToWuTime(minutes: number): WuTime {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new RangeError(`Minuten ausserhalb eines Tages: ${minutes}`);
  }
  return Math.floor(minutes / 60) * 100 + (minutes % 60);
}

/** HHMM → "08:00". */
export function formatWuTime(value: WuTime): string {
  const minutes = wuTimeToMinutes(value);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Dauer einer Periode in Minuten. */
export function wuDurationInMinutes(startTime: WuTime, endTime: WuTime): number {
  return wuTimeToMinutes(endTime) - wuTimeToMinutes(startTime);
}

/** YYYYMMDD + HHMM → Date in lokaler Zeit. */
export function wuDateTimeToDate(date: WuDate, time: WuTime): Date {
  const result = wuDateToDate(date);
  result.setMinutes(wuTimeToMinutes(time));
  return result;
}

/**
 * YYYYMMDD + HHMM → "YYYY-MM-DDTHH:mm:ss" in lokaler Zeit, ohne Zeitzone/Offset — das
 * Format des undokumentierten calendar-entry-detail-Endpunkts (siehe api/calendarEntryRest.ts),
 * gemessen am 2026-09-17. Nur ein Schreiber: der echte Client sendet dieses Format nur,
 * empfängt es nie als Eingabe zurück.
 */
export function wuDateTimeToIsoLocal(date: WuDate, time: WuTime): string {
  const d = wuDateTimeToDate(date, time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Farbe: RRGGBB
// ---------------------------------------------------------------------------

const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

export function isValidWuColor(value: string | undefined): value is WuColor {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/**
 * "ee7f00" → "#ee7f00". Gibt `undefined` zurück, wenn das Feld fehlt oder unbrauchbar ist —
 * laut Doku werden foreColor/backColor weggelassen, wenn nicht gesetzt.
 */
export function wuColorToCss(value: string | undefined): string | undefined {
  return isValidWuColor(value) ? `#${value.toLowerCase()}` : undefined;
}

/** "#EE7F00" oder "ee7f00" → "ee7f00". Wirft bei ungültiger Eingabe. */
export function cssToWuColor(value: string): WuColor {
  const stripped = value.startsWith('#') ? value.slice(1) : value;
  if (!HEX_COLOR.test(stripped)) {
    throw new RangeError(`Ungueltige Farbe: ${value} (erwartet RRGGBB)`);
  }
  return stripped.toLowerCase();
}

// ---------------------------------------------------------------------------
// Timegrid-Wochentage
// ---------------------------------------------------------------------------

/**
 * Doku Abschnitt 10 sagt im Fließtext "1 = sunday, 2 = monday, ..., 7 = saturday",
 * zeigt im Beispiel daneben aber `day: 0`. Wir folgen dem Fließtext und akzeptieren
 * zusätzlich die 0-basierte Variante, damit uns ein abweichender Server nicht umwirft.
 *
 * Rückgabe: JS-Wochentag (0 = Sonntag … 6 = Samstag).
 */
export function weekdayFromTimegridDay(day: number): number {
  if (day >= 1 && day <= 7) return day - 1;
  if (day === 0) return 0;
  throw new RangeError(`Unerwarteter Timegrid-Tag: ${day} (erwartet 1..7)`);
}

/** Umkehrung von `weekdayFromTimegridDay` für die dokumentierte 1..7-Variante. */
export function timegridDayFromWeekday(weekday: number): number {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new RangeError(`Unerwarteter Wochentag: ${weekday} (erwartet 0..6)`);
  }
  return weekday + 1;
}
