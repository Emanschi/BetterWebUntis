/**
 * ICS-Export der Prüfungen (RFC 5545) — rein clientseitig, kein Server (siehe
 * Zusatzfeature im Projektauftrag und IDEEN.md B2: der Abo-Feed mit Server-Zugriff
 * ist bewusst ein separater, späterer Schritt, M11).
 *
 * Grundlage ist `RestExam` aus `api/examsRest.ts` (undokumentierter REST-Workaround) —
 * siehe IDEEN.md B3 für den Hintergrund, warum weder `getExams` noch ein Feld im
 * Stundenplan selbst dafür ausreichen.
 *
 * Zeitzone: Die API liefert keine Zeitzoneninformation, nur Datum/Zeit in Lokalzeit
 * der Schule. Wir schreiben deshalb "floating time" (kein TZID, kein Z-Suffix) — die
 * meisten Kalenderprogramme interpretieren das als lokale Zeit des Geräts, was für
 * eine App mit genau einer Schule in Österreich die richtige Annahme ist.
 */

import { wuDateTimeToDate } from '../api/format';
import type { RestExam } from '../api/examsRest';

const ICS_LINE_BREAK = '\r\n';
/** RFC 5545 §3.1: Zeilen dürfen höchstens 75 Oktette lang sein, danach gefaltet werden. */
const MAX_LINE_LENGTH = 75;

/** Escaped Kommas, Semikolons, Backslashes und Zeilenumbrüche gemäß RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Faltet eine zu lange Zeile auf mehrere physische Zeilen (Fortsetzung mit einem Leerzeichen). */
function foldLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, MAX_LINE_LENGTH));
  rest = rest.slice(MAX_LINE_LENGTH);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, MAX_LINE_LENGTH - 1)}`);
    rest = rest.slice(MAX_LINE_LENGTH - 1);
  }
  return parts.join(ICS_LINE_BREAK);
}

function formatIcsDateTime(date: number, time: number): string {
  const d = wuDateTimeToDate(date, time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/** Zeitstempel für DTSTAMP (Erstellungszeitpunkt der Datei) — UTC, wie RFC 5545 es verlangt. */
function formatIcsTimestampUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function slugify(value: string): string {
  const slug = value
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug === '' ? 'fach' : slug;
}

/**
 * Stabile UID je Prüfung — wichtig, damit ein erneuter Export/Import dieselbe Prüfung
 * erkennt. Bewusst NICHT aus `exam.id` gebaut: in der einen echten Beispielantwort war
 * das Feld `0` (siehe api/examsRest.ts) — undokumentiert und nicht als eindeutige Id
 * verifizierbar. Datum+Uhrzeit+Fach identifizieren eine Prüfung in der Praxis eindeutig.
 */
export function examUid(exam: RestExam): string {
  return `exam-${exam.examDate}-${exam.startTime}-${slugify(exam.subject || exam.name)}@betterwebuntis.local`;
}

/**
 * Baut eine vollständige .ics-Datei aus einer Liste von Prüfungen.
 * `now` ist injizierbar für deterministische Tests.
 */
export function buildExamsIcs(exams: readonly RestExam[], now: Date = new Date()): string {
  const dtstamp = formatIcsTimestampUtc(now);
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BetterWebUntis//Pruefungsexport//DE', 'CALSCALE:GREGORIAN'];

  for (const exam of exams) {
    const summary = `${exam.subject || exam.name} — Prüfung`;
    const descriptionParts = [
      exam.studentClass.length > 0 ? `Klasse: ${exam.studentClass.join(', ')}` : undefined,
      exam.teachers.length > 0 ? `Lehrkraft: ${exam.teachers.join(', ')}` : undefined,
      exam.text !== '' ? exam.text : undefined,
      exam.grade !== '' ? `Note: ${exam.grade}` : undefined,
    ].filter((p): p is string => p !== undefined);

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${examUid(exam)}`));
    lines.push(foldLine(`DTSTAMP:${dtstamp}`));
    lines.push(foldLine(`DTSTART:${formatIcsDateTime(exam.examDate, exam.startTime)}`));
    lines.push(foldLine(`DTEND:${formatIcsDateTime(exam.examDate, exam.endTime)}`));
    lines.push(foldLine(`SUMMARY:${escapeText(summary)}`));
    if (exam.rooms.length > 0) {
      lines.push(foldLine(`LOCATION:${escapeText(exam.rooms.join(', '))}`));
    }
    if (descriptionParts.length > 0) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(descriptionParts.join('\\n'))}`));
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join(ICS_LINE_BREAK) + ICS_LINE_BREAK;
}
