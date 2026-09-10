import { describe, expect, it } from 'vitest';
import {
  addWuDays,
  cssToWuColor,
  formatWuTime,
  isValidWuColor,
  isValidWuDate,
  isValidWuTime,
  minutesToWuTime,
  timegridDayFromWeekday,
  toWuDate,
  weekdayFromTimegridDay,
  wuColorToCss,
  wuDateDiffInDays,
  wuDateTimeToDate,
  wuDateToDate,
  wuDurationInMinutes,
  wuTimeToMinutes,
  wuWeekRange,
} from '../format';

describe('Datum (YYYYMMDD)', () => {
  it('erkennt gueltige Doku-Datumsangaben', () => {
    // Werte aus den Beispielen der Doku
    for (const value of [20110117, 20101026, 20150515, 20140729, 20111116]) {
      expect(isValidWuDate(value)).toBe(true);
    }
  });

  it('weist unmoegliche Datumsangaben zurueck', () => {
    expect(isValidWuDate(20110230)).toBe(false); // 30. Februar
    expect(isValidWuDate(20111301)).toBe(false); // Monat 13
    expect(isValidWuDate(20110100)).toBe(false); // Tag 0
    expect(isValidWuDate(0)).toBe(false); // dob "unbekannt" ist kein Datum
    expect(isValidWuDate(2011011)).toBe(false); // zu kurz
    expect(isValidWuDate(20110117.5)).toBe(false);
  });

  it('wandelt in beide Richtungen verlustfrei um', () => {
    const date = wuDateToDate(20110117);
    expect(date.getFullYear()).toBe(2011);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(17);
    expect(date.getHours()).toBe(0);
    expect(toWuDate(date)).toBe(20110117);
  });

  it('wirft bei ungueltigem Datum, statt still etwas Falsches zu liefern', () => {
    expect(() => wuDateToDate(20110230)).toThrow(RangeError);
  });

  it('rechnet ueber Monats- und Jahresgrenzen', () => {
    expect(addWuDays(20110131, 1)).toBe(20110201);
    expect(addWuDays(20111231, 1)).toBe(20120101);
    expect(addWuDays(20120101, -1)).toBe(20111231);
    expect(addWuDays(20200228, 1)).toBe(20200229); // Schaltjahr
    expect(addWuDays(20210228, 1)).toBe(20210301);
  });

  it('zaehlt Kalendertage', () => {
    expect(wuDateDiffInDays(20111107, 20111116)).toBe(9); // Doku-Beispiel getSubstitutions
    expect(wuDateDiffInDays(20111116, 20111107)).toBe(-9);
    expect(wuDateDiffInDays(20110117, 20110117)).toBe(0);
  });

  it('liefert die Woche von Montag bis Sonntag', () => {
    // 20150515 ist ein Freitag (Doku-Beispiel getTimetable customizable)
    expect(wuWeekRange(20150515)).toEqual({ startDate: 20150511, endDate: 20150517 });
    // Ein Montag bleibt Wochenstart
    expect(wuWeekRange(20150511)).toEqual({ startDate: 20150511, endDate: 20150517 });
    // Ein Sonntag gehoert noch zur vorigen Woche
    expect(wuWeekRange(20150517)).toEqual({ startDate: 20150511, endDate: 20150517 });
    // Mit Sonntag als Wochenstart verschiebt sich alles
    expect(wuWeekRange(20150515, 0)).toEqual({ startDate: 20150510, endDate: 20150516 });
  });
});

describe('Zeit (HHMM)', () => {
  it('erkennt gueltige Doku-Zeiten', () => {
    for (const value of [800, 850, 855, 945, 1000, 1050, 1055, 1145, 1425, 1510, 1800, 1900]) {
      expect(isValidWuTime(value)).toBe(true);
    }
  });

  it('weist Zeiten mit unmoeglichen Minuten zurueck', () => {
    expect(isValidWuTime(860)).toBe(false); // Minute 60
    expect(isValidWuTime(2400)).toBe(false);
    expect(isValidWuTime(-100)).toBe(false);
  });

  it('rechnet HHMM in Minuten um — 800 ist 08:00, nicht 800 Minuten', () => {
    expect(wuTimeToMinutes(800)).toBe(480);
    expect(wuTimeToMinutes(1425)).toBe(865);
    expect(wuTimeToMinutes(0)).toBe(0);
    expect(wuTimeToMinutes(2359)).toBe(1439);
  });

  it('rechnet zurueck', () => {
    expect(minutesToWuTime(480)).toBe(800);
    expect(minutesToWuTime(865)).toBe(1425);
    expect(minutesToWuTime(0)).toBe(0);
  });

  it('formatiert fuer die Anzeige', () => {
    expect(formatWuTime(800)).toBe('08:00');
    expect(formatWuTime(1425)).toBe('14:25');
    expect(formatWuTime(0)).toBe('00:00');
  });

  it('berechnet die Dauer einer Periode', () => {
    expect(wuDurationInMinutes(800, 850)).toBe(50); // Doku-Beispiel
    expect(wuDurationInMinutes(855, 940)).toBe(45);
    expect(wuDurationInMinutes(1425, 1510)).toBe(45);
  });

  it('kombiniert Datum und Zeit', () => {
    const date = wuDateTimeToDate(20110117, 1055);
    expect(date.getDate()).toBe(17);
    expect(date.getHours()).toBe(10);
    expect(date.getMinutes()).toBe(55);
  });
});

describe('Farbe (RRGGBB)', () => {
  it('akzeptiert die Farben aus getStatusData', () => {
    for (const value of ['000000', 'ee7f00', 'e6e3e1', '250eee', 'b1b3b4', 'fdc400']) {
      expect(isValidWuColor(value)).toBe(true);
    }
  });

  it('lehnt fehlende oder falsch formatierte Farben ab', () => {
    expect(isValidWuColor(undefined)).toBe(false);
    expect(isValidWuColor('')).toBe(false);
    expect(isValidWuColor('#ee7f00')).toBe(false); // die API liefert kein '#'
    expect(isValidWuColor('ee7f0')).toBe(false);
    expect(isValidWuColor('gg7f00')).toBe(false);
  });

  it('macht CSS-Farben daraus', () => {
    expect(wuColorToCss('ee7f00')).toBe('#ee7f00');
    expect(wuColorToCss('EE7F00')).toBe('#ee7f00');
  });

  it('gibt undefined zurueck, wenn das Feld weggelassen wurde', () => {
    // Doku Seite 1: "foreColor and backColor will be omitted if not set"
    expect(wuColorToCss(undefined)).toBeUndefined();
    expect(wuColorToCss('')).toBeUndefined();
  });

  it('rechnet CSS zurueck ins API-Format', () => {
    expect(cssToWuColor('#EE7F00')).toBe('ee7f00');
    expect(cssToWuColor('ee7f00')).toBe('ee7f00');
    expect(() => cssToWuColor('#abc')).toThrow(RangeError);
  });
});

describe('Timegrid-Wochentage', () => {
  it('folgt dem Fliesstext der Doku: 1 = Sonntag ... 7 = Samstag', () => {
    expect(weekdayFromTimegridDay(1)).toBe(0); // Sonntag
    expect(weekdayFromTimegridDay(2)).toBe(1); // Montag
    expect(weekdayFromTimegridDay(7)).toBe(6); // Samstag
  });

  it('vertraegt auch die 0 aus dem Doku-Beispiel', () => {
    expect(weekdayFromTimegridDay(0)).toBe(0);
  });

  it('wirft bei Werten, die keine der beiden Varianten erklaert', () => {
    expect(() => weekdayFromTimegridDay(8)).toThrow(RangeError);
    expect(() => weekdayFromTimegridDay(-1)).toThrow(RangeError);
  });

  it('rechnet zurueck', () => {
    expect(timegridDayFromWeekday(0)).toBe(1);
    expect(timegridDayFromWeekday(6)).toBe(7);
    expect(() => timegridDayFromWeekday(7)).toThrow(RangeError);
  });
});
