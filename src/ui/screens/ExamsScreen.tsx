import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../state/sessionStore';
import { api, restApi } from '../../api/index';
import { formatWuDate, formatWuTime, wuTimeToMinutes } from '../../api/format';
import type { RestExam } from '../../api/examsRest';
import { buildExamsIcs } from '../../domain/ics';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { SchoolyearSelect } from '../components/SchoolyearSelect';
import { Spinner } from '../components/Spinner';
import { useSchoolyearSelection } from '../hooks/useSchoolyearSelection';

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
 * mehreren Schuljahren in der Historie überschaubar bleibt — Auswahl über ein Dropdown
 * (`useSchoolyearSelection`, geteilt mit `AbsencesScreen.tsx`).
 *
 * ICS-Export (M8): rein clientseitig, kein Server nötig (anders als der spätere
 * Kalenderabo-Feed aus M11, siehe IDEEN.md B2).
 *
 * Klick auf eine Prüfung springt im Stundenplan direkt zur passenden Woche und hebt die
 * Stunde kurz hervor (Nutzerwunsch 2026-09-17) — siehe TimetableScreen.tsx, das die
 * `highlightDate`/`highlightStart`/`highlightEnd`-Query-Parameter ausliest.
 */
export function ExamsScreen() {
  const client = useSessionStore((s) => s.client);
  const personId = useSessionStore((s) => s.personId);
  const navigate = useNavigate();

  function showInTimetable(exam: RestExam): void {
    const params = new URLSearchParams({
      highlightDate: String(exam.examDate),
      highlightStart: String(exam.startTime),
      highlightEnd: String(exam.endTime),
    });
    navigate(`/timetable?${params.toString()}`);
  }

  const schoolyearsQuery = useQuery({
    queryKey: ['schoolyears'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getSchoolyears(client);
    },
  });
  const { effectiveId, selected: selectedSchoolyear, setSelectedId } = useSchoolyearSelection(schoolyearsQuery.data);

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
            <SchoolyearSelect schoolyears={schoolyearsQuery.data} value={effectiveId} onChange={setSelectedId} />
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
              <Card
                key={`${exam.examDate}-${exam.startTime}-${exam.subject}`}
                role="button"
                tabIndex={0}
                onClick={() => showInTimetable(exam)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showInTimetable(exam);
                  }
                }}
                title="Im Stundenplan anzeigen"
                className="flex cursor-pointer flex-col gap-1 text-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
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
                <div className="text-xs text-accent">Im Stundenplan anzeigen →</div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
