import { describe, expect, it } from 'vitest';
import { buildExamsIcs, examUid } from '../ics';
import type { RestExam } from '../../api/examsRest';

function exam(overrides: Partial<RestExam> & Pick<RestExam, 'id' | 'examDate' | 'startTime' | 'endTime'>): RestExam {
  return {
    examType: 'SA_TE',
    name: 'AM',
    subject: 'AM',
    studentClass: [],
    teachers: [],
    rooms: [],
    text: '',
    grade: '',
    ...overrides,
  };
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
  const exams: RestExam[] = [
    exam({
      id: 0, // echte Beispielantwort hatte id:0 fuer jede Pruefung — bewusst NICHT fuer die UID verwendet
      subject: 'NW2',
      examDate: 20260918,
      startTime: 1220,
      endTime: 1310,
      studentClass: ['3BHIF'],
      teachers: ['MAYR'],
      rooms: ['N306'],
      text: 'Nomenklatur',
    }),
  ];
  const ics = buildExamsIcs(exams, FIXED_NOW);

  it('enthaelt genau einen VEVENT-Block', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(1);
  });

  it('UID ist stabil, aus Datum/Uhrzeit/Fach gebaut, nicht aus der unzuverlaessigen exam.id', () => {
    expect(ics).toContain(`UID:${examUid(exams[0]!)}`);
    expect(examUid(exams[0]!)).toBe('exam-20260918-1220-nw2@betterwebuntis.local');
  });

  it('DTSTART/DTEND als floating time ohne Z-Suffix und ohne TZID (Doku liefert keine Zeitzone)', () => {
    expect(ics).toContain('DTSTART:20260918T122000');
    expect(ics).toContain('DTEND:20260918T131000');
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).not.toContain('TZID');
  });

  it('DTSTAMP ist UTC (Z-Suffix) und aus dem injizierten "now"', () => {
    expect(ics).toContain('DTSTAMP:20260910T120000Z');
  });

  it('SUMMARY enthaelt den Fachnamen', () => {
    expect(ics).toContain('SUMMARY:NW2 — Prüfung');
  });

  it('LOCATION enthaelt den Raum', () => {
    expect(ics).toContain('LOCATION:N306');
  });

  it('DESCRIPTION enthaelt Klasse, Lehrkraft und den Pruefungstext', () => {
    expect(ics).toContain('Klasse: 3BHIF');
    expect(ics).toContain('Lehrkraft: MAYR');
    expect(ics).toContain('Nomenklatur');
  });
});

describe('buildExamsIcs — Note', () => {
  it('zeigt die Note in der Beschreibung, wenn vorhanden', () => {
    const ics = buildExamsIcs([exam({ id: 1, examDate: 20260910, startTime: 1000, endTime: 1050, grade: '2 Gut' })], FIXED_NOW);
    expect(ics).toContain('Note: 2 Gut');
  });

  it('keine Note-Zeile, wenn (noch) unbenotet', () => {
    const ics = buildExamsIcs([exam({ id: 1, examDate: 20260910, startTime: 1000, endTime: 1050, grade: '' })], FIXED_NOW);
    expect(ics).not.toContain('Note:');
  });
});

describe('buildExamsIcs — mehrere Ereignisse', () => {
  it('erzeugt einen Block je Pruefung, in derselben Reihenfolge wie uebergeben', () => {
    const exams: RestExam[] = [
      exam({ id: 1, subject: 'D', examDate: 20260910, startTime: 1000, endTime: 1050 }),
      exam({ id: 2, subject: 'E', examDate: 20260917, startTime: 1000, endTime: 1050 }),
    ];
    const ics = buildExamsIcs(exams, FIXED_NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.indexOf('SUMMARY:D')).toBeLessThan(ics.indexOf('SUMMARY:E'));
  });

  it('baut fuer zwei Pruefungen an unterschiedlichen Terminen unterschiedliche UIDs', () => {
    const a = exam({ id: 0, subject: 'AM', examDate: 20260910, startTime: 1000, endTime: 1050 });
    const b = exam({ id: 0, subject: 'AM', examDate: 20261119, startTime: 1000, endTime: 1050 });
    expect(examUid(a)).not.toBe(examUid(b));
  });
});

describe('buildExamsIcs — Escaping (RFC 5545 §3.3.11)', () => {
  it('escaped Kommas, Semikolons und Backslashes im Fachnamen', () => {
    const exams: RestExam[] = [exam({ id: 1, subject: 'Fach; mit, Komma\\Backslash', examDate: 20260910, startTime: 800, endTime: 850 })];
    const ics = buildExamsIcs(exams, FIXED_NOW);
    expect(ics).toContain('SUMMARY:Fach\\; mit\\, Komma\\\\Backslash — Prüfung');
  });

  it('ohne Klasse/Lehrkraft/Text/Note: keine DESCRIPTION-Zeile', () => {
    const exams: RestExam[] = [exam({ id: 1, subject: 'M', examDate: 20260910, startTime: 800, endTime: 850 })];
    const ics = buildExamsIcs(exams, FIXED_NOW);
    expect(ics).not.toContain('DESCRIPTION:');
  });

  it('ohne Raum: keine LOCATION-Zeile', () => {
    const exams: RestExam[] = [exam({ id: 1, subject: 'M', examDate: 20260910, startTime: 800, endTime: 850, rooms: [] })];
    const ics = buildExamsIcs(exams, FIXED_NOW);
    expect(ics).not.toContain('LOCATION:');
  });
});

describe('buildExamsIcs — Zeilenfaltung (RFC 5545 §3.1)', () => {
  it('faltet Zeilen ueber 75 Oktette; jede physische Zeile bleibt darunter', () => {
    const longSubject = 'X'.repeat(120);
    const exams: RestExam[] = [exam({ id: 1, subject: longSubject, examDate: 20260910, startTime: 800, endTime: 850 })];
    const ics = buildExamsIcs(exams, FIXED_NOW);

    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // Die Fortsetzungszeile(n) der langen SUMMARY beginnen mit einem Leerzeichen (RFC 5545 "folding").
    expect(ics).toMatch(/SUMMARY:X+\r\n {1,74}X+/);
  });
});
