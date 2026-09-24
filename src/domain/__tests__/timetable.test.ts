import { describe, expect, it } from 'vitest';
import { buildWeekGrid, computeTimeBounds, DEFAULT_TIME_BOUNDS, mergeSubstitutions, prioritizeByDate, timeBoundsHourMarks } from '../timetable';
import type { Period, Substitution } from '../../api/types';

function period(overrides: Partial<Period> & Pick<Period, 'id' | 'date' | 'startTime' | 'endTime'>): Period {
  return { su: [{ id: 1, name: 'M' }], te: [{ id: 10, name: 'MUS' }], ro: [{ id: 4, name: 'K201' }], ...overrides };
}

describe('mergeSubstitutions', () => {
  it('laesst Perioden ohne passende Vertretung unveraendert', () => {
    const periods = [period({ id: 1, date: 20260907, startTime: 800, endTime: 850 })];
    const result = mergeSubstitutions(periods, []);
    expect(result).toEqual(periods);
  });

  it('setzt code "cancelled" bei type cancel', () => {
    const periods = [period({ id: 1, date: 20260909, startTime: 800, endTime: 850 })];
    const subs: Substitution[] = [{ type: 'cancel', lsid: 1, date: 20260909, startTime: 800, endTime: 850 }];
    const result = mergeSubstitutions(periods, subs);
    expect(result[0]?.code).toBe('cancelled');
  });

  it('setzt code "irregular" bei subst und rmchg', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850 }),
      period({ id: 2, date: 20260911, startTime: 1000, endTime: 1050 }),
    ];
    const subs: Substitution[] = [
      { type: 'subst', lsid: 1, date: 20260907, startTime: 800, endTime: 850 },
      { type: 'rmchg', lsid: 2, date: 20260911, startTime: 1000, endTime: 1050 },
    ];
    const result = mergeSubstitutions(periods, subs);
    expect(result[0]?.code).toBe('irregular');
    expect(result[1]?.code).toBe('irregular');
  });

  it('ueberschreibt vorhandenen code/substText nicht', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, code: 'irregular', substText: 'schon da' }),
    ];
    const subs: Substitution[] = [
      { type: 'cancel', lsid: 1, date: 20260907, startTime: 800, endTime: 850, txt: 'anderer Text' },
    ];
    const result = mergeSubstitutions(periods, subs);
    expect(result[0]?.code).toBe('irregular');
    expect(result[0]?.substText).toBe('schon da');
  });

  it('rät keinen Code fuer Typen ohne eindeutige Zuordnung (z. B. bs/oh)', () => {
    const periods = [period({ id: 1, date: 20260907, startTime: 800, endTime: 850 })];
    const subs: Substitution[] = [{ type: 'bs', lsid: 1, date: 20260907, startTime: 800, endTime: 850 }];
    const result = mergeSubstitutions(periods, subs);
    expect(result[0]?.code).toBeUndefined();
  });

  it('uebernimmt txt als substText, wenn noch keiner gesetzt ist', () => {
    const periods = [period({ id: 1, date: 20260907, startTime: 800, endTime: 850 })];
    const subs: Substitution[] = [
      { type: 'rmchg', lsid: 1, date: 20260907, startTime: 800, endTime: 850, txt: 'Raumänderung' },
    ];
    const result = mergeSubstitutions(periods, subs);
    expect(result[0]?.substText).toBe('Raumänderung');
  });
});

describe('buildWeekGrid', () => {
  it('liefert 7 Tage, auch wenn manche leer sind', () => {
    const grid = buildWeekGrid([], 20260907);
    expect(grid).toHaveLength(7);
    expect(grid.every((d) => d.blocks.length === 0)).toBe(true);
    expect(grid[0]?.date).toBe(20260907);
    expect(grid[6]?.date).toBe(20260913);
  });

  it('ordnet Perioden dem richtigen Wochentag zu', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850 }),
      period({ id: 2, date: 20260909, startTime: 1000, endTime: 1050 }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks).toHaveLength(1); // Montag
    expect(grid[2]?.blocks).toHaveLength(1); // Mittwoch
    expect(grid[1]?.blocks).toHaveLength(0); // Dienstag
  });

  it('sortiert Bloecke eines Tages nach Startzeit', () => {
    const periods = [
      period({ id: 2, date: 20260907, startTime: 1000, endTime: 1050, su: [{ id: 2, name: 'D' }] }),
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, su: [{ id: 1, name: 'M' }] }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks.map((b) => b.subject?.name)).toEqual(['M', 'D']);
  });

  it('fasst direkt aufeinanderfolgende identische Perioden zur Doppelstunde zusammen', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850 }),
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945 }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks).toHaveLength(1);
    expect(grid[0]?.blocks[0]).toMatchObject({ periodIds: [1, 2], startTime: 800, endTime: 945 });
  });

  it('fasst NICHT zusammen, wenn eine Luecke zwischen den Perioden liegt', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850 }),
      period({ id: 2, date: 20260907, startTime: 1000, endTime: 1050 }), // Luecke (Pause)
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks).toHaveLength(2);
  });

  it('fasst NICHT zusammen, wenn Fach oder Lehrer wechselt', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, su: [{ id: 1, name: 'M' }] }),
      period({ id: 2, date: 20260907, startTime: 850, endTime: 940, su: [{ id: 2, name: 'D' }] }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks).toHaveLength(2);
  });

  it('fasst NICHT zusammen, wenn der Code unterschiedlich ist (z. B. normal + entfallen)', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850 }),
      period({ id: 2, date: 20260907, startTime: 850, endTime: 940, code: 'cancelled' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks).toHaveLength(2);
  });

  it('behaelt info/substText/lstext/lstype bei einer einzelnen Periode', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, code: 'cancelled', info: 'Grund', substText: 'Entfall' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks[0]).toMatchObject({ code: 'cancelled', info: 'Grund', substText: 'Entfall' });
  });

  it('BUG (gemeldet 2026-09-24): behaelt info, wenn nur die ZWEITE Haelfte einer Doppelstunde es traegt', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850 }), // kein info
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945, info: 'SMÜ Nomenklatur' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks).toHaveLength(1);
    expect(grid[0]?.blocks[0]).toMatchObject({ periodIds: [1, 2], info: 'SMÜ Nomenklatur' });
  });

  it('behaelt info, wenn nur die ERSTE Haelfte einer Doppelstunde es traegt', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, info: 'Raumaenderung' }),
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945 }), // kein info
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks[0]).toMatchObject({ info: 'Raumaenderung' });
  });

  it('fuehrt unterschiedliche info-Texte beider Haelften sichtbar zusammen statt eine zu verwerfen', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, info: 'Halle 2 reserviert' }),
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945, info: 'Geraete mitbringen' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks[0]?.info).toBe('Halle 2 reserviert / Geraete mitbringen');
  });

  it('verdoppelt info nicht, wenn beide Haelften denselben Text tragen', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, info: 'Dieselbe Info' }),
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945, info: 'Dieselbe Info' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks[0]?.info).toBe('Dieselbe Info');
  });

  it('gilt genauso fuer substText/lstext/bkText/bkRemark, nicht nur info', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, lstext: 'Hinweis 1', bkText: 'Buchung 1' }),
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945, substText: 'Vertretungstext', bkRemark: 'Vermerk' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks[0]).toMatchObject({
      lstext: 'Hinweis 1',
      bookingText: 'Buchung 1',
      substText: 'Vertretungstext',
      bookingRemark: 'Vermerk',
    });
  });

  it('sortiert ganztaegige Eintraege (>=10h) in allDayBlocks aus, nicht in blocks', () => {
    // Realer Fund beim Smoke-Test gegen den echten Server (M10): ein Eintrag
    // "00:00–23:59, kein Fach, kein Raum, code irregular" ohne Entsprechung in der Doku.
    const periods = [
      period({ id: 1, date: 20260907, startTime: 0, endTime: 2359, code: 'irregular', su: [], te: [], ro: [] }),
      period({ id: 2, date: 20260907, startTime: 800, endTime: 850 }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.allDayBlocks).toHaveLength(1);
    expect(grid[0]?.allDayBlocks[0]?.periodIds).toEqual([1]);
    expect(grid[0]?.blocks).toHaveLength(1);
    expect(grid[0]?.blocks[0]?.periodIds).toEqual([2]);
  });

  it('verzerrt computeTimeBounds nicht, wenn ein ganztaegiger Eintrag dabei ist', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 0, endTime: 2359, code: 'irregular' }),
      period({ id: 2, date: 20260907, startTime: 855, endTime: 945 }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(computeTimeBounds(grid)).toEqual({ startMinutes: 8 * 60, endMinutes: 9 * 60 + 60 }); // 08:00–10:00 (aufgerundet)
  });
});


describe('computeTimeBounds', () => {
  it('liefert den Fallback, wenn keine Woche Perioden hat', () => {
    const bounds = computeTimeBounds([{ date: 20260907, blocks: [], allDayBlocks: [] }]);
    expect(bounds).toEqual(DEFAULT_TIME_BOUNDS);
  });

  it('rundet auf volle Stunden, ausgehend von der fruehesten/spaetesten Periode', () => {
    const days = [
      {
        date: 20260907,
        blocks: [
          { periodIds: [1], date: 20260907, startTime: 855, endTime: 945 }, // 08:55–09:45
          { periodIds: [2], date: 20260907, startTime: 1310, endTime: 1455 }, // 13:10–14:55
        ],
        allDayBlocks: [],
      },
    ];
    expect(computeTimeBounds(days)).toEqual({ startMinutes: 8 * 60, endMinutes: 15 * 60 });
  });

  it('spannt ueber mehrere Tage hinweg', () => {
    const days = [
      { date: 1, blocks: [{ periodIds: [1], date: 1, startTime: 1000, endTime: 1050 }], allDayBlocks: [] },
      { date: 2, blocks: [{ periodIds: [2], date: 2, startTime: 700, endTime: 750 }], allDayBlocks: [] },
    ];
    expect(computeTimeBounds(days).startMinutes).toBe(7 * 60);
  });
});

describe('timeBoundsHourMarks', () => {
  it('erzeugt eine Markierung je volle Stunde, inklusive beider Randwerte', () => {
    const marks = timeBoundsHourMarks({ startMinutes: 8 * 60, endMinutes: 11 * 60 });
    expect(marks).toEqual([480, 540, 600, 660]); // 08:00, 09:00, 10:00, 11:00
  });

  it('liefert genau eine Markierung, wenn Start und Ende gleich sind', () => {
    expect(timeBoundsHourMarks({ startMinutes: 480, endMinutes: 480 })).toEqual([480]);
  });
});

describe('prioritizeByDate', () => {
  it('stellt Elemente mit dem priorisierten Datum an den Anfang', () => {
    const items = [{ date: 1 }, { date: 2 }, { date: 3 }];
    expect(prioritizeByDate(items, 3)).toEqual([{ date: 3 }, { date: 1 }, { date: 2 }]);
  });

  it('behält die relative Reihenfolge innerhalb von priorisiert/Rest bei (stabil)', () => {
    const items = [{ date: 1, id: 'a' }, { date: 2, id: 'b' }, { date: 1, id: 'c' }, { date: 2, id: 'd' }];
    expect(prioritizeByDate(items, 2).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('lässt die Reihenfolge unverändert, wenn kein Element passt', () => {
    const items = [{ date: 1 }, { date: 2 }];
    expect(prioritizeByDate(items, 99)).toEqual(items);
  });

  it('lässt eine leere Liste unverändert', () => {
    expect(prioritizeByDate([], 1)).toEqual([]);
  });
});
