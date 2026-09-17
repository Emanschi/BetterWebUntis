import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { formatWuDate, formatWuTime, toWuDate, wuTimeToMinutes } from '../../api/format';
import type { Period, Schoolyear, WuDate } from '../../api/types';
import { examExtraText, examPeriods } from '../../domain/timetable';
import { buildExamsIcs, type ExamIcsEntry } from '../../domain/ics';
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

function subjectName(period: Period): string {
  return period.su?.[0]?.longname ?? period.su?.[0]?.name ?? 'Unbekanntes Fach';
}

/**
 * Doku Abschnitt 21/22 (`getExams`/`getExamTypes`) sind für Schüler-Konten an der HTL
 * St. Pölten gemessen gesperrt (Code -8509, siehe TESTING.md Abschnitt 3+"Nutzer-Feedback").
 * Die originale WebUntis-Oberfläche zeigt Prüfungen für genau dasselbe Konto trotzdem an —
 * sie markiert Prüfungsstunden offenbar im Stundenplan selbst (lstype "ex"). Deshalb: über
 * `getTimetable` für ein ganzes Schuljahr iterieren und auf lstype "ex" filtern, statt
 * `getExams` zu rufen. Details und Hintergrund: IDEEN.md B3.
 *
 * Ein Schuljahr auf einmal (nicht "alle Prüfungen aller Jahre"), damit die Antwort auch bei
 * mehreren Schuljahren in der Historie überschaubar bleibt — Auswahl über ein Dropdown.
 *
 * ICS-Export (M8): rein clientseitig, kein Server nötig (anders als der spätere
 * Kalenderabo-Feed aus M11, siehe IDEEN.md B2).
 */
export function ExamsScreen() {
  const client = useSessionStore((s) => s.client);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);
  const element = personType !== undefined && personId !== undefined ? { id: personId, type: personType } : undefined;

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
    queryKey: ['examPeriods', element, selectedSchoolyear?.id],
    enabled: client !== null && element !== undefined && selectedSchoolyear !== undefined,
    queryFn: async () => {
      if (client === null || element === undefined || selectedSchoolyear === undefined) {
        throw new Error('Keine aktive Sitzung.');
      }
      const periods = await api.getTimetableCustom(client, {
        element,
        startDate: selectedSchoolyear.startDate,
        endDate: selectedSchoolyear.endDate,
        showInfo: true,
        showSubstText: true,
        showLsText: true,
        subjectFields: ['id', 'name', 'longname'],
        roomFields: ['id', 'name'],
        klasseFields: ['id', 'name'],
      });
      return examPeriods(periods);
    },
  });

  function handleExport(): void {
    if (examsQuery.data === undefined) return;
    const entries: ExamIcsEntry[] = examsQuery.data.map((period) => ({
      period,
      subjectName: subjectName(period),
      klasseNames: period.kl?.map((k) => k.name ?? (k.id !== undefined ? `Klasse ${k.id}` : 'Klasse')),
    }));
    downloadIcsFile('pruefungen.ics', buildExamsIcs(entries));
  }

  const isLoading = schoolyearsQuery.isPending || (selectedSchoolyear !== undefined && examsQuery.isPending);
  const error = schoolyearsQuery.error ?? examsQuery.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fg">Prüfungen</h1>
          <p className="text-sm text-fg-muted">Als Prüfung markierte Stunden im Stundenplan.</p>
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
          {examsQuery.data.map((period) => {
            const extra = examExtraText(period);
            const durationMinutes = wuTimeToMinutes(period.endTime) - wuTimeToMinutes(period.startTime);
            return (
              <Card key={period.id} className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-fg">{subjectName(period)}</span>
                  <span className="text-fg-muted">
                    {formatWuDate(period.date)} · {formatWuTime(period.startTime)}–{formatWuTime(period.endTime)} ·{' '}
                    {durationMinutes} Min.
                    {period.ro?.[0]?.name !== undefined ? ` · ${period.ro[0].name}` : ''}
                  </span>
                </div>
                {extra !== undefined && <div className="text-fg-muted">{extra}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
