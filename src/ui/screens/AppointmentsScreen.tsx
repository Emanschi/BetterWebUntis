import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { addWuDays, formatWuDate, formatWuTime, toWuDate } from '../../api/format';
import { appointmentPeriods } from '../../domain/timetable';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

const LSTYPE_LABEL: Record<string, string> = { oh: 'Sprechstunde', sb: 'Bereitschaft', bs: 'Pausenaufsicht' };

/** Nächste 4 Wochen — die Doku macht keine Vorgabe, das ist eine UI-Wahl. */
function appointmentRange() {
  const today = toWuDate(new Date());
  return { startDate: today, endDate: addWuDays(today, 28) };
}

/**
 * "Meine Termine / Sprechstunden" — die API hat dafür keine eigene Methode (siehe
 * IDEEN.md A4). Angenähert über die Perioden des eigenen Stundenplans mit
 * lstype "oh"/"sb"/"bs".
 */
export function AppointmentsScreen() {
  const client = useSessionStore((s) => s.client);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);
  const { startDate, endDate } = appointmentRange();

  const element = personType !== undefined && personId !== undefined ? { id: personId, type: personType } : undefined;

  const query = useQuery({
    queryKey: ['appointments', element, startDate, endDate],
    enabled: client !== null && element !== undefined,
    queryFn: async () => {
      if (client === null || element === undefined) throw new Error('Keine aktive Sitzung.');
      const periods = await api.getTimetableCustom(client, {
        element,
        startDate,
        endDate,
        showInfo: true,
        roomFields: ['id', 'name'],
      });
      return appointmentPeriods(periods);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Meine Termine</h1>
        <p className="text-sm text-fg-muted">
          Sprechstunden und Bereitschaft aus dem Stundenplan — die WebUntis-API kennt keine
          eigene Terminverwaltung (siehe IDEEN.md).
        </p>
      </div>

      {query.isPending && <Spinner label="Termine werden geladen…" />}
      {query.isError && <ErrorState error={query.error} />}

      {query.isSuccess && query.data.length === 0 && (
        <Card className="text-sm text-fg-muted">Keine Sprechstunden oder Bereitschaften in den nächsten 4 Wochen.</Card>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {query.data.map((period) => (
            <Card key={period.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium text-fg">
                  {period.lstype !== undefined ? (LSTYPE_LABEL[period.lstype] ?? period.lstype) : '—'}
                </div>
                <div className="text-fg-muted">
                  {formatWuDate(period.date)} · {formatWuTime(period.startTime)}–{formatWuTime(period.endTime)}
                  {period.ro?.[0]?.name !== undefined ? ` · ${period.ro[0].name}` : ''}
                </div>
                {period.info !== undefined && <div className="text-fg-muted">{period.info}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
