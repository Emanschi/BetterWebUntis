import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { addWuDays, formatWuDate, formatWuTime, toWuDate } from '../../api/format';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

/** Zeitraum: 30 Tage zurück bis heute — die Doku macht keine Vorgabe, das ist eine UI-Wahl. */
function absenceRange() {
  const today = toWuDate(new Date());
  return { startDate: addWuDays(today, -30), endDate: today };
}

/**
 * Doku Abschnitt 23 (getTimetableWithAbsences). Recht "Student absences" — Schüler-Konten
 * haben das laut PLAN.md R4 typischerweise nicht; der Screen degradiert dann sauber
 * über ErrorState statt abzustürzen.
 *
 * Wichtig: Diese Methode referenziert Elemente über externe Schlüssel, nicht über
 * interne Ids (PLAN.md R6). Ohne gepflegte externalkeys an der Schule bleibt nur die
 * Rohanzeige — genau das macht dieser Screen.
 */
export function AbsencesScreen() {
  const client = useSessionStore((s) => s.client);
  const { startDate, endDate } = absenceRange();

  const query = useQuery({
    queryKey: ['absences', startDate, endDate],
    enabled: client !== null,
    queryFn: async () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      const result = await api.getTimetableWithAbsences(client, { startDate, endDate });
      return result.periodsWithAbsences;
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Abwesenheiten</h1>
        <p className="text-sm text-fg-muted">
          {formatWuDate(startDate, 'de-AT', { day: '2-digit', month: '2-digit' })} –{' '}
          {formatWuDate(endDate, 'de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </p>
      </div>

      {query.isPending && <Spinner label="Abwesenheiten werden geladen…" />}
      {query.isError && <ErrorState error={query.error} />}

      {query.isSuccess && query.data.length === 0 && (
        <Card className="text-sm text-fg-muted">Keine Abwesenheiten in diesem Zeitraum.</Card>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {query.data.map((absence, index) => (
            <Card key={`${absence.date}-${absence.startTime}-${index}`} className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-fg">
                  {formatWuDate(absence.date)} · {formatWuTime(absence.startTime)}–{formatWuTime(absence.endTime)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    absence.checked ? 'bg-surface-hover text-fg-muted' : 'bg-irregular/20 text-irregular'
                  }`}
                >
                  {absence.checked ? 'kontrolliert' : 'nicht kontrolliert'}
                </span>
              </div>
              <div className="text-fg-muted">
                {absence.studentId} · {absence.subjectId}
                {absence.status !== undefined ? ` · ${absence.status}` : ''}
              </div>
              {absence.absenceReason !== undefined && (
                <div className="text-fg-muted">
                  Grund: {absence.absenceReason}
                  {absence.absentTime !== undefined ? ` (${absence.absentTime} Min.)` : ''}
                </div>
              )}
              {absence.excuseStatus !== undefined && <div className="text-fg-muted">Status: {absence.excuseStatus}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
