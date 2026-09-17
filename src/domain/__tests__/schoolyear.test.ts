import { describe, expect, it } from 'vitest';
import { defaultSchoolyearId } from '../schoolyear';
import type { Schoolyear } from '../../api/types';

const YEARS: Schoolyear[] = [
  { id: 0, name: '2025/2026', startDate: 20250908, endDate: 20260709 },
  { id: 1, name: '2026/2027', startDate: 20260907, endDate: 20270708 },
];

describe('defaultSchoolyearId', () => {
  it('waehlt das Schuljahr, das das Datum enthaelt', () => {
    expect(defaultSchoolyearId(YEARS, 20260909)).toBe(1);
    expect(defaultSchoolyearId(YEARS, 20251001)).toBe(0);
  });

  it('waehlt das Schuljahr mit dem spaetesten Startdatum, wenn keins das Datum enthaelt (z. B. Sommerferien)', () => {
    // 01.08.2026 liegt zwischen den beiden Schuljahren (2025/2026 endete 09.07., 2026/2027
    // beginnt erst 07.09.) — 2026/2027 hat das spaetere Startdatum und gewinnt.
    expect(defaultSchoolyearId(YEARS, 20260801)).toBe(1);
  });

  it('liefert undefined bei einer leeren Liste', () => {
    expect(defaultSchoolyearId([], 20260909)).toBeUndefined();
  });

  it('ist unabhaengig von der Reihenfolge der Eingabe', () => {
    const reversed = [...YEARS].reverse();
    expect(defaultSchoolyearId(reversed, 20260801)).toBe(1);
  });
});
