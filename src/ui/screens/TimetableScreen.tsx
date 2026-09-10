import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { addWuDays, formatWuDate, toWuDate, wuWeekRange } from '../../api/format';
import type { ElementType } from '../../api/types';
import { buildWeekGrid, mergeSubstitutions, type TimetableDay } from '../../domain/timetable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { TimetableBlockCard } from '../components/TimetableBlockCard';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

export interface TimetableElementRef {
  id: number | string;
  type: (typeof ElementType)[keyof typeof ElementType];
}

interface TimetableScreenProps {
  /** Für M6 (Elementwechsel): welcher Stundenplan angezeigt wird. Default: der eigene. */
  element?: TimetableElementRef;
  title?: string;
}

/**
 * Zeigt den Stundenplan einer Woche für ein Element (Standard: die eigene Person).
 * Holt `getTimetable` (customizable) und `getSubstitutions` parallel und merged sie
 * über `domain/timetable.ts` zu einem Wochenraster (Doppelstunden, Randfälle).
 */
export function TimetableScreen({ element: elementProp, title = 'Stundenplan' }: TimetableScreenProps) {
  const client = useSessionStore((s) => s.client);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);

  const [weekStart, setWeekStart] = useState(() => wuWeekRange(toWuDate(new Date())).startDate);
  const weekEnd = addWuDays(weekStart, 6);

  const element =
    elementProp ?? (personType !== undefined && personId !== undefined ? { id: personId, type: personType } : undefined);

  const query = useQuery({
    queryKey: ['timetable', element, weekStart],
    enabled: client !== null && element !== undefined,
    queryFn: async () => {
      if (client === null || element === undefined) throw new Error('Keine aktive Sitzung.');
      const [periods, substitutions] = await Promise.all([
        api.getTimetableCustom(client, {
          element,
          startDate: weekStart,
          endDate: weekEnd,
          showInfo: true,
          showSubstText: true,
          showLsText: true,
          showStudentgroup: true,
          subjectFields: ['id', 'name', 'longname'],
          teacherFields: ['id', 'name', 'longname'],
          roomFields: ['id', 'name', 'longname'],
          klasseFields: ['id', 'name'],
        }),
        // getSubstitutions kann an Rechten scheitern (PLAN.md R4) — der Plan bleibt trotzdem
        // brauchbar, weil getTimetable mit showInfo/showSubstText die wichtigsten Felder
        // meist schon direkt mitliefert.
        api.getSubstitutions(client, { startDate: weekStart, endDate: weekEnd, departmentId: 0 }).catch(() => []),
      ]);
      return mergeSubstitutions(periods, substitutions);
    },
  });

  const grid = useMemo(() => buildWeekGrid(query.data ?? [], weekStart), [query.data, weekStart]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setWeekStart((w) => addWuDays(w, -7))} aria-label="Vorige Woche">
            ←
          </Button>
          <span className="text-sm text-fg-muted">
            {formatWuDate(weekStart, 'de-AT', { day: '2-digit', month: '2-digit' })} –{' '}
            {formatWuDate(weekEnd, 'de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          <Button variant="secondary" onClick={() => setWeekStart((w) => addWuDays(w, 7))} aria-label="Nächste Woche">
            →
          </Button>
        </div>
      </div>

      {element === undefined && <ErrorState error="Keine Person zum Anzeigen — bitte neu anmelden." />}
      {query.isPending && element !== undefined && <Spinner label="Stundenplan wird geladen…" />}
      {query.isError && <ErrorState error={query.error} />}

      {query.isSuccess && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {grid.slice(0, 5).map((day, i) => (
            <DayColumn key={day.date} label={WEEKDAY_LABELS[i] ?? ''} day={day} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayColumn({ label, day }: { label: string; day: TimetableDay }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {label} · {formatWuDate(day.date, 'de-AT', { day: '2-digit', month: '2-digit' })}
      </div>
      {day.blocks.length === 0 ? (
        <Card className="p-2 text-xs text-fg-muted">frei</Card>
      ) : (
        day.blocks.map((block) => <TimetableBlockCard key={block.periodIds.join('-')} block={block} />)
      )}
    </div>
  );
}
