import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../../state/sessionStore';
import { api, restApi } from '../../api/index';
import { formatWuDate, formatWuTime, wuTimeToMinutes } from '../../api/format';
import type { RestAbsence } from '../../api/absencesRest';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { SchoolyearSelect } from '../components/SchoolyearSelect';
import { Spinner } from '../components/Spinner';
import { useSchoolyearSelection } from '../hooks/useSchoolyearSelection';

/**
 * Abwesenheiten über einen undokumentierten REST-Endpunkt (`api/absencesRest.ts`), nicht
 * über das dokumentierte `getTimetableWithAbsences` (für echte Schüler-Konten gesperrt,
 * Code -8509) — und anders als bei Prüfungen gibt es dafür kein Feld im Stundenplan zum
 * Umgehen. Der Nutzer hat den Endpunkt selbst aus den Browser-DevTools der originalen
 * WebUntis-Oberfläche kopiert und dessen Nutzung ausdrücklich freigegeben. Details, Risiko
 * und die gemessene Beispielantwort: `api/absencesRest.ts`, IDEEN.md B3b.
 *
 * Ein Schuljahr auf einmal, wie bei Prüfungen — Auswahl über dasselbe Dropdown
 * (`useSchoolyearSelection`, geteilt mit `ExamsScreen.tsx`).
 */
export function AbsencesScreen() {
  const client = useSessionStore((s) => s.client);
  const personId = useSessionStore((s) => s.personId);

  const schoolyearsQuery = useQuery({
    queryKey: ['schoolyears'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getSchoolyears(client);
    },
  });
  const { effectiveId, selected: selectedSchoolyear, setSelectedId } = useSchoolyearSelection(schoolyearsQuery.data);

  const absencesQuery = useQuery({
    queryKey: ['absencesRest', personId, selectedSchoolyear?.id],
    enabled: client !== null && personId !== undefined && selectedSchoolyear !== undefined,
    queryFn: async () => {
      if (client === null || personId === undefined || selectedSchoolyear === undefined) {
        throw new Error('Keine aktive Sitzung.');
      }
      const absences = await restApi.getAbsencesRest(client, {
        studentId: personId,
        startDate: selectedSchoolyear.startDate,
        endDate: selectedSchoolyear.endDate,
      });
      return [...absences].sort((a, b) => b.startDate - a.startDate || b.startTime - a.startTime);
    },
  });

  const isLoading = schoolyearsQuery.isPending || (selectedSchoolyear !== undefined && absencesQuery.isPending);
  const error = schoolyearsQuery.error ?? absencesQuery.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-fg">Abwesenheiten</h1>
        {schoolyearsQuery.data !== undefined && schoolyearsQuery.data.length > 0 && (
          <SchoolyearSelect schoolyears={schoolyearsQuery.data} value={effectiveId} onChange={setSelectedId} />
        )}
      </div>

      {isLoading && <Spinner label="Abwesenheiten werden geladen…" />}
      {(schoolyearsQuery.isError || absencesQuery.isError) && <ErrorState error={error} />}

      {absencesQuery.isSuccess && absencesQuery.data.length === 0 && (
        <Card className="text-sm text-fg-muted">Keine Abwesenheiten in diesem Schuljahr.</Card>
      )}

      {absencesQuery.isSuccess && absencesQuery.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {absencesQuery.data.map((absence: RestAbsence) => {
            const durationMinutes = wuTimeToMinutes(absence.endTime) - wuTimeToMinutes(absence.startTime);
            const dateLabel =
              absence.startDate === absence.endDate
                ? formatWuDate(absence.startDate)
                : `${formatWuDate(absence.startDate)} – ${formatWuDate(absence.endDate)}`;
            const extra = [absence.reason, absence.text].filter((t) => t !== '').join(' — ');
            return (
              <Card key={absence.id} className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-fg">
                    {dateLabel} · {formatWuTime(absence.startTime)}–{formatWuTime(absence.endTime)} · {durationMinutes} Min.
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      absence.isExcused ? 'bg-surface-hover text-fg-muted' : 'bg-irregular/20 text-irregular'
                    }`}
                  >
                    {absence.isExcused ? 'entschuldigt' : 'nicht entschuldigt'}
                    {absence.excuseStatus !== null && absence.excuseStatus !== '' ? ` · ${absence.excuseStatus}` : ''}
                  </span>
                </div>
                {extra !== '' && <div className="text-fg-muted">{extra}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
