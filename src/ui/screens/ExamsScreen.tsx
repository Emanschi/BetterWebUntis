import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { api, restApi } from '../../api/index';
import { formatWuDate, formatWuTime, toWuDate, wuTimeToMinutes } from '../../api/format';
import type { RestExam } from '../../api/examsRest';
import type { Schoolyear, WuDate } from '../../api/types';
import { buildExamsIcs } from '../../domain/ics';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

/** Löst eine .ics-Datei als Browser-Download aus — rein clientseitig, kein Server beteiligt. */
function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Das Schuljahr, das heute enthält — sonst das zuletzt begonnene (z. B. in den Ferien). */
function defaultSchoolyearId(schoolyears: readonly Schoolyear[], today: WuDate): number | undefined {
  const containing = schoolyears.find((y) => y.startDate <= today && today <= y.endDate);
  if (containing !== undefined) return containing.id;
  return [...schoolyears].toSorted((a, b) => b.startDate - a.startDate)[0]?.id;
}

/**
 * Prüfungen über einen undokumentierten REST-Endpunkt (`api/examsRest.ts`), nicht über
 * das dokumentierte `getExams`/`getExamTypes` (beide für echte Schüler-Konten gesperrt,
 * Code -8509) und auch nicht über ein Feld im Stundenplan (echte Prüfungsstunden haben
 * dort weder `lstype` noch `code`, nur einen freien Info-Text — gemessen 2026-09-17).
 *
 * Der Nutzer hat den Endpunkt selbst aus den Browser-DevTools der originalen WebUntis-
 * Oberfläche kopiert und dessen Nutzung ausdrücklich freigegeben. Details, Risiko und die
 * gemessene Beispielantwort: `api/examsRest.ts`, IDEEN.md B3.
 *
 * Ein Schuljahr auf einmal (nicht "alle Prüfungen aller Jahre"), damit die Antwort auch bei
 * mehreren Schuljahren in der Historie überschaubar bleibt — Auswahl über ein Dropdown.
 *
 * ICS-Export (M8): rein clientseitig, kein Server nötig (anders als der spätere
 * Kalenderabo-Feed aus M11, siehe IDEEN.md B2).
 */
export function ExamsScreen() {
  const client = useSessionStore((s) => s.client);
  const personId = useSessionStore((s) => s.personId);

  const [selectedSchoolyearId, setSelectedSchoolyearId] = useState<number | undefined>(undefined);

  const schoolyearsQuery = useQuery({
    queryKey: ['schoolyears'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getSchoolyears(client);
    },
  });

  const today = toWuDate(new Date());
  const effectiveSchoolyearId =
    selectedSchoolyearId ?? (schoolyearsQuery.data !== undefined ? defaultSchoolyearId(schoolyearsQuery.data, today) : undefined);
  const selectedSchoolyear = schoolyearsQuery.data?.find((y) => y.id === effectiveSchoolyearId);

  const examsQuery = useQuery({
    queryKey: ['examsRest', personId, selectedSchoolyear?.id],
    enabled: client !== null && personId !== undefined && selectedSchoolyear !== undefined,
    queryFn: async () => {
      if (client === null || personId === undefined || selectedSchoolyear === undefined) {
        throw new Error('Keine aktive Sitzung.');
      }
      const exams = await restApi.getExamsRest(client, {
        studentId: personId,
        startDate: selectedSchoolyear.startDate,
        endDate: selectedSchoolyear.endDate,
      });
      return [...exams].sort((a, b) => a.examDate - b.examDate || a.startTime - b.startTime);
    },
  });

  function handleExport(): void {
    if (examsQuery.data === undefined) return;
    downloadIcsFile('pruefungen.ics', buildExamsIcs(examsQuery.data));
  }

  const isLoading = schoolyearsQuery.isPending || (selectedSchoolyear !== undefined && examsQuery.isPending);
  const error = schoolyearsQuery.error ?? examsQuery.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fg">Prüfungen</h1>
        </div>
        <div className="flex items-center gap-2">
          {schoolyearsQuery.data !== undefined && schoolyearsQuery.data.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              Schuljahr
              <select
                className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                value={effectiveSchoolyearId ?? ''}
                onChange={(e) => setSelectedSchoolyearId(Number(e.target.value))}
              >
                {[...schoolyearsQuery.data]
                  .toSorted((a, b) => b.startDate - a.startDate)
                  .map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {examsQuery.isSuccess && examsQuery.data.length > 0 && (
            <Button variant="secondary" onClick={handleExport}>
              Als ICS exportieren
            </Button>
          )}
        </div>
      </div>

      {isLoading && <Spinner label="Prüfungen werden geladen…" />}
      {(schoolyearsQuery.isError || examsQuery.isError) && <ErrorState error={error} />}

      {examsQuery.isSuccess && examsQuery.data.length === 0 && (
        <Card className="text-sm text-fg-muted">Keine Prüfungen in diesem Schuljahr.</Card>
      )}

      {examsQuery.isSuccess && examsQuery.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {examsQuery.data.map((exam: RestExam) => {
            const durationMinutes = wuTimeToMinutes(exam.endTime) - wuTimeToMinutes(exam.startTime);
            return (
              <Card key={`${exam.examDate}-${exam.startTime}-${exam.subject}`} className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-fg">
                    {exam.subject || exam.name}
                    {exam.examType !== '' && <span className="ml-2 text-xs font-normal text-fg-muted">{exam.examType}</span>}
                  </span>
                  <span className="text-fg-muted">
                    {formatWuDate(exam.examDate)} · {formatWuTime(exam.startTime)}–{formatWuTime(exam.endTime)} ·{' '}
                    {durationMinutes} Min.
                    {exam.rooms.length > 0 ? ` · ${exam.rooms.join(', ')}` : ''}
                  </span>
                </div>
                {(exam.teachers.length > 0 || exam.text !== '') && (
                  <div className="text-fg-muted">
                    {exam.teachers.length > 0 ? exam.teachers.join(', ') : undefined}
                    {exam.teachers.length > 0 && exam.text !== '' ? ' · ' : ''}
                    {exam.text}
                  </div>
                )}
                {exam.grade !== '' && <div className="font-medium text-fg">Note: {exam.grade}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
