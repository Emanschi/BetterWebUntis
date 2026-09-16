import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { addWuDays, formatWuDate, formatWuTime, minutesToWuTime, toWuDate, wuTimeToMinutes, wuWeekRange } from '../../api/format';
import type { ElementType } from '../../api/types';
import {
  buildWeekGrid,
  computeTimeBounds,
  mergeSubstitutions,
  timeBoundsHourMarks,
  type TimeBounds,
  type TimetableDay,
} from '../../domain/timetable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ElementPicker } from '../components/ElementPicker';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { TimetableBlockCard } from '../components/TimetableBlockCard';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

/** Höhe je Minute im Zeitraster — 2px/Min. ergibt z. B. 90px für eine 45-Minuten-Stunde. */
const PX_PER_MINUTE = 2;

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
 * Zeigt den Stundenplan einer Woche für ein Element (Standard: die eigene Person) als
 * echtes Zeitraster — eine gemeinsame Stunden-Achse links, Perioden nach Startzeit und
 * Dauer positioniert, statt einer losen Kartenliste. So sind Uhrzeiten, Lücken
 * (Freistunden) und Überschneidungen auf einen Blick erkennbar.
 *
 * Holt `getTimetable` (customizable) und `getSubstitutions` parallel und merged sie
 * über `domain/timetable.ts` zu einem Wochenraster (Doppelstunden, Randfälle).
 */
export function TimetableScreen({ element: elementProp, title = 'Stundenplan' }: TimetableScreenProps) {
  const client = useSessionStore((s) => s.client);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);

  const [weekStart, setWeekStart] = useState(() => wuWeekRange(toWuDate(new Date())).startDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const weekEnd = addWuDays(weekStart, 6);

  const ownElement =
    personType !== undefined && personId !== undefined ? { id: personId, type: personType } : undefined;
  const element = elementProp ?? ownElement;
  const isForeignElement =
    elementProp !== undefined && (elementProp.id !== ownElement?.id || elementProp.type !== ownElement.type);

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
  const weekDays = useMemo(() => grid.slice(0, 5), [grid]);
  const bounds = useMemo(() => computeTimeBounds(weekDays), [weekDays]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-fg">{title}</h1>
          {isForeignElement && (
            <Link to="/timetable" className="text-sm text-accent hover:underline">
              ← Mein Plan
            </Link>
          )}
        </div>
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
          <Button variant="secondary" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen}>
            Anderen Plan ansehen
          </Button>
        </div>
      </div>

      {pickerOpen && (
        <Card>
          <ElementPicker onSelect={() => setPickerOpen(false)} />
        </Card>
      )}

      {element === undefined && <ErrorState error="Keine Person zum Anzeigen — bitte neu anmelden." />}
      {query.isPending && element !== undefined && <Spinner label="Stundenplan wird geladen…" />}
      {query.isError && <ErrorState error={query.error} />}

      {query.isSuccess && (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[820px] gap-1.5" style={{ gridTemplateColumns: '3.25rem repeat(5, minmax(0, 1fr))' }}>
            <TimeAxis bounds={bounds} />
            {weekDays.map((day, i) => (
              <DayGridColumn key={day.date} label={WEEKDAY_LABELS[i] ?? ''} day={day} bounds={bounds} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeAxis({ bounds }: { bounds: TimeBounds }) {
  const totalMinutes = bounds.endMinutes - bounds.startMinutes;
  return (
    <div className="flex flex-col">
      <div className="h-5" aria-hidden="true" />
      <div className="relative" style={{ height: totalMinutes * PX_PER_MINUTE }}>
        {timeBoundsHourMarks(bounds).map((minute) => (
          <div
            key={minute}
            className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-fg-muted"
            style={{ top: (minute - bounds.startMinutes) * PX_PER_MINUTE }}
          >
            {formatWuTime(minutesToWuTime(minute))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayGridColumn({ label, day, bounds }: { label: string; day: TimetableDay; bounds: TimeBounds }) {
  const totalMinutes = bounds.endMinutes - bounds.startMinutes;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="h-5 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {label} · {formatWuDate(day.date, 'de-AT', { day: '2-digit', month: '2-digit' })}
      </div>
      <div className="relative rounded-lg border border-border bg-bg" style={{ height: totalMinutes * PX_PER_MINUTE }}>
        {timeBoundsHourMarks(bounds).map((minute) => (
          <div
            key={minute}
            className="absolute inset-x-0 border-t border-border/60"
            style={{ top: (minute - bounds.startMinutes) * PX_PER_MINUTE }}
          />
        ))}
        {day.blocks.map((block) => {
          const top = (wuTimeToMinutes(block.startTime) - bounds.startMinutes) * PX_PER_MINUTE;
          const height = Math.max(
            (wuTimeToMinutes(block.endTime) - wuTimeToMinutes(block.startTime)) * PX_PER_MINUTE,
            30,
          );
          return (
            <div key={block.periodIds.join('-')} className="absolute inset-x-0.5" style={{ top, height }}>
              <TimetableBlockCard block={block} dense />
            </div>
          );
        })}
      </div>
    </div>
  );
}
