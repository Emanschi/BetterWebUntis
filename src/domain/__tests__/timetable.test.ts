import { describe, expect, it } from 'vitest';
import { appointmentPeriods, buildWeekGrid, mergeSubstitutions } from '../timetable';
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

  it('behaelt info/substText/lstext/lstype im gemergten Block', () => {
    const periods = [
      period({ id: 1, date: 20260907, startTime: 800, endTime: 850, code: 'cancelled', info: 'Grund', substText: 'Entfall' }),
    ];
    const grid = buildWeekGrid(periods, 20260907);
    expect(grid[0]?.blocks[0]).toMatchObject({ code: 'cancelled', info: 'Grund', substText: 'Entfall' });
  });
});

describe('appointmentPeriods', () => {
  it('filtert auf oh/sb/bs und laesst normalen Unterricht weg', () => {
    const periods = [
      period({ id: 1, date: 20260908, startTime: 1150, endTime: 1240, lstype: 'oh', te: [{ id: 11 }] }),
      period({ id: 2, date: 20260907, startTime: 800, endTime: 850 }), // normale Stunde, kein lstype
      period({ id: 3, date: 20260911, startTime: 1150, endTime: 1240, lstype: 'sb' }),
      period({ id: 4, date: 20260910, startTime: 1000, endTime: 1050, lstype: 'ex' }), // Pruefung zaehlt nicht
    ];
    const result = appointmentPeriods(periods);
    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });

  it('sortiert chronologisch, unabhaengig von der Eingabereihenfolge', () => {
    const periods = [
      period({ id: 10, date: 20260918, startTime: 1150, endTime: 1240, lstype: 'oh' }),
      period({ id: 11, date: 20260908, startTime: 1150, endTime: 1240, lstype: 'oh' }),
      period({ id: 12, date: 20260908, startTime: 800, endTime: 850, lstype: 'sb' }),
    ];
    const result = appointmentPeriods(periods);
    expect(result.map((p) => p.id)).toEqual([12, 11, 10]);
  });

  it('liefert eine leere Liste, wenn nichts passt', () => {
    const periods = [period({ id: 1, date: 20260907, startTime: 800, endTime: 850 })];
    expect(appointmentPeriods(periods)).toEqual([]);
  });
});
