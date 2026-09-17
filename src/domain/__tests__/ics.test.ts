import { describe, expect, it } from 'vitest';
import { buildExamsIcs, examUid, type ExamIcsEntry } from '../ics';
import type { Period } from '../../api/types';

function period(overrides: Partial<Period> & Pick<Period, 'id' | 'date' | 'startTime' | 'endTime'>): Period {
  return { lstype: 'ex', ...overrides };
}

const FIXED_NOW = new Date(Date.UTC(2026, 8, 10, 12, 0, 0));

describe('buildExamsIcs — Rahmen', () => {
  it('erzeugt gueltiges BEGIN/END:VCALENDAR mit Pflichtfeldern', () => {
    const ics = buildExamsIcs([], FIXED_NOW);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('PRODID:');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.endsWith('\r\n')).toBe(true); // Datei endet mit CRLF
  });

  it('ohne Pruefungen: keine VEVENT-Bloecke', () => {
    const ics = buildExamsIcs([], FIXED_NOW);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});

describe('buildExamsIcs — ein Ereignis', () => {
  const entries: ExamIcsEntry[] = [
    {
      period: period({ id: 1, date: 20260910, startTime: 1425, endTime: 1510, lstext: 'Schularbeit' }),
      subjectName: 'Angewandte Mathematik',
      klasseNames: ['3AHIF'],
    },
  ];
  const ics = buildExamsIcs(entries, FIXED_NOW);

  it('enthaelt genau einen VEVENT-Block', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1);
  });

  it('UID ist stabil und enthaelt die Perioden-Id', () => {
    expect(ics).toContain(`UID:${examUid(entries[0]!.period)}`);
    expect(examUid(entries[0]!.period)).toBe('exam-period-1@betterwebuntis.local');
  });

  it('DTSTART/DTEND als floating time ohne Z-Suffix und ohne TZID (Doku liefert keine Zeitzone)', () => {
    // 1425 = 14:25, 1510 = 15:10 (siehe format.ts wuTimeToMinutes)
    expect(ics).toContain('DTSTART:20260910T142500');
    expect(ics).toContain('DTEND:20260910T151000');
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).not.toContain('TZID');
  });

  it('DTSTAMP ist UTC (Z-Suffix) und aus dem injizierten "now"', () => {
    expect(ics).toContain('DTSTAMP:20260910T120000Z');
  });

  it('SUMMARY enthaelt den Fachnamen', () => {
    expect(ics).toContain('SUMMARY:Angewandte Mathematik — Prüfung');
  });

  it('DESCRIPTION enthaelt Klasse und den Lehrer-Zusatztext', () => {
    expect(ics).toContain('Klasse: 3AHIF');
    expect(ics).toContain('Schularbeit');
  });
});

describe('buildExamsIcs — mehrere Ereignisse', () => {
  it('erzeugt einen Block je Pruefung, in derselben Reihenfolge wie uebergeben', () => {
    const entries: ExamIcsEntry[] = [
      { period: period({ id: 1, date: 20260910, startTime: 1000, endTime: 1050 }), subjectName: 'Deutsch' },
      { period: period({ id: 2, date: 20260917, startTime: 1000, endTime: 1050 }), subjectName: 'Englisch' },
    ];
    const ics = buildExamsIcs(entries, FIXED_NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.indexOf('Deutsch')).toBeLessThan(ics.indexOf('Englisch'));
  });
});

describe('buildExamsIcs — Escaping (RFC 5545 §3.3.11)', () => {
  it('escaped Kommas, Semikolons und Backslashes im Fachnamen', () => {
    const entries: ExamIcsEntry[] = [
      {
        period: period({ id: 1, date: 20260910, startTime: 800, endTime: 850 }),
        subjectName: 'Fach; mit, Komma\\Backslash',
      },
    ];
    const ics = buildExamsIcs(entries, FIXED_NOW);
    expect(ics).toContain('SUMMARY:Fach\\; mit\\, Komma\\\\Backslash — Prüfung');
  });

  it('ohne Klasse und ohne Zusatztext: keine DESCRIPTION-Zeile', () => {
    const entries: ExamIcsEntry[] = [{ period: period({ id: 1, date: 20260910, startTime: 800, endTime: 850 }), subjectName: 'M' }];
    const ics = buildExamsIcs(entries, FIXED_NOW);
    expect(ics).not.toContain('DESCRIPTION:');
  });

  it('mehrere Zusatztext-Felder werden dedupliziert (z. B. lstext == info)', () => {
    const entries: ExamIcsEntry[] = [
      {
        period: period({ id: 1, date: 20260910, startTime: 800, endTime: 850, lstext: 'Schularbeit', info: 'Schularbeit' }),
        subjectName: 'M',
      },
    ];
    const ics = buildExamsIcs(entries, FIXED_NOW);
    expect(ics.match(/Schularbeit/g)).toHaveLength(1);
  });
});

describe('buildExamsIcs — Zeilenfaltung (RFC 5545 §3.1)', () => {
  it('faltet Zeilen ueber 75 Oktette; jede physische Zeile bleibt darunter', () => {
    const longSubject = 'X'.repeat(120);
    const entries: ExamIcsEntry[] = [
      { period: period({ id: 1, date: 20260910, startTime: 800, endTime: 850 }), subjectName: longSubject },
    ];
    const ics = buildExamsIcs(entries, FIXED_NOW);

    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // Die Fortsetzungszeile(n) der langen SUMMARY beginnen mit einem Leerzeichen (RFC 5545 "folding").
    expect(ics).toMatch(/SUMMARY:X+\r\n {1,74}X+/);
  });
});
