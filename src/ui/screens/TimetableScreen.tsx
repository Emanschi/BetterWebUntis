import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../../state/sessionStore';
import { api, restApi } from '../../api/index';
import {
  addWuDays,
  formatWuDate,
  formatWuTime,
  minutesToWuTime,
  toWuDate,
  wuDateToDate,
  wuDateTimeToIsoLocal,
  wuTimeToMinutes,
  wuWeekRange,
} from '../../api/format';
import type { ElementType } from '../../api/types';
import {
  buildWeekGrid,
  computeTimeBounds,
  mergeSubstitutions,
  prioritizeByDate,
  timeBoundsHourMarks,
  type TimeBounds,
  type TimetableBlock,
  type TimetableDay,
} from '../../domain/timetable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ElementPicker } from '../components/ElementPicker';
import { ErrorState } from '../components/ErrorState';
import { Modal } from '../components/Modal';
import { PeriodDetail } from '../components/PeriodDetail';
import { Spinner } from '../components/Spinner';
import { blockTitle, TimetableBlockCard } from '../components/TimetableBlockCard';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * Geteilt zwischen der Ganztags-Zeile und dem Zeitraster einer Woche, damit Spalten exakt
 * fluchten. Breite der ersten Spalte kommt aus --bwu-time-axis-width (index.css), auf Mobil
 * schmaler — siehe dort.
 */
const WEEK_GRID_TEMPLATE_COLUMNS = 'var(--bwu-time-axis-width) repeat(5, minmax(0, 1fr))';
/** Tagesansicht: Zeitachse + genau eine Spalte. */
const DAY_GRID_TEMPLATE_COLUMNS = 'var(--bwu-time-axis-width) minmax(0, 1fr)';

/**
 * Höhe je Minute im Zeitraster, als CSS-Länge (nicht als Zahl) über --bwu-px-per-minute
 * (index.css) — auf Mobil kleiner, damit eine ganze Woche ohne Scrollen aufs Display passt
 * (Nutzerwunsch 2026-09-24). `minutes` kann aus einer Differenz stammen und rechnerisch
 * negativ oder nicht ganzzahlig sein, `calc()` behandelt beides korrekt.
 */
function px(minutes: number): string {
  return `calc(${minutes} * var(--bwu-px-per-minute))`;
}

/** Wie `px()`, aber nie kleiner als `minPx` — Mindesthöhe für sehr kurze Perioden. */
function pxAtLeast(minutes: number, minPx: number): string {
  return `max(${px(minutes)}, ${minPx}px)`;
}

/**
 * Sichtbarer Abstand zwischen zwei Perioden ohne Pause dazwischen (Nutzerwunsch 2026-09-24):
 * ohne echte Pause stießen die Karten pixelgenau aneinander — der Rand allein (siehe
 * TimetableBlockCard cardBorderColor) reichte nicht, wenn beide Karten aehnliche/gleiche
 * Fachfarben hatten. Wird symmetrisch von oben/unten abgezogen (siehe blockTop()/blockHeight()).
 */
const BLOCK_GAP_PX = 3;

function blockTop(minutes: number): string {
  return `calc(${px(minutes)} + ${BLOCK_GAP_PX / 2}px)`;
}

function blockHeight(minutes: number, minPx: number): string {
  return `calc(${pxAtLeast(minutes, minPx)} - ${BLOCK_GAP_PX}px)`;
}

/** Wie lange der Neon-Rahmen leuchtet, siehe index.css `.bwu-neon-highlight` (0.7s × 4 ≈ 2.8s Animation). */
const HIGHLIGHT_DURATION_MS = 3200;

/** Mo–So-Kürzel für ein Datum — JS `getDay()` zählt ab Sonntag (0), unser Raster ab Montag. */
function weekdayLabel(date: TimetableDay['date']): string {
  const jsDay = wuDateToDate(date).getDay();
  return WEEKDAY_LABELS[(jsDay + 6) % 7] ?? '';
}

type ViewMode = 'week' | 'day';

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
 * Zeigt den Stundenplan einer Woche (oder eines einzelnen Tages, umschaltbar) für ein
 * Element (Standard: die eigene Person) als echtes Zeitraster — eine gemeinsame Stunden-
 * Achse links, Perioden nach Startzeit und Dauer positioniert, statt einer losen
 * Kartenliste. So sind Uhrzeiten, Lücken (Freistunden) und Überschneidungen auf einen
 * Blick erkennbar.
 *
 * Holt `getTimetable` (customizable) und `getSubstitutions` parallel und merged sie
 * über `domain/timetable.ts` zu einem Wochenraster (Doppelstunden, Randfälle). Die
 * Tagesansicht (Nutzerwunsch 2026-09-17) zeigt daraus nur einen Tag — kein separater
 * Request, die Wochendaten reichen.
 *
 * "Wo steht das in der Woche?" (Nutzerwunsch 2026-09-17): mit `?highlightDate=…&
 * highlightStart=…&highlightEnd=…` in der URL springt der Screen direkt zur passenden
 * Woche/zum passenden Tag und hebt die Stunde kurz hervor — siehe ExamsScreen.tsx, das
 * diese Parameter beim Klick auf eine Prüfung setzt.
 */
export function TimetableScreen({ element: elementProp, title = 'Stundenplan' }: TimetableScreenProps) {
  const client = useSessionStore((s) => s.client);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);

  const [searchParams, setSearchParams] = useSearchParams();
  const highlightDateParam = searchParams.get('highlightDate');
  const highlightStartParam = searchParams.get('highlightStart');
  const highlightEndParam = searchParams.get('highlightEnd');

  const [selectedDate, setSelectedDate] = useState(() => {
    const parsed = highlightDateParam !== null ? Number(highlightDateParam) : NaN;
    return Number.isNaN(parsed) ? toWuDate(new Date()) : parsed;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openBlock, setOpenBlock] = useState<TimetableBlock | null>(null);
  const [highlightActive, setHighlightActive] = useState(highlightDateParam !== null);

  useEffect(() => {
    if (!highlightActive) return;
    const timer = setTimeout(() => setHighlightActive(false), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlightActive]);

  // "Stundenplan"-Navlink springt zurück zu heute (Nutzerwunsch 2026-09-17): AppShell.tsx
  // verlinkt dorthin mit "?resetToToday=1". Ein Klick auf diesen Link, während man schon auf
  // /timetable ist, löst sonst KEINE Navigation aus, die selectedDate zurücksetzen würde —
  // React Router remountet die Komponente nur bei einem echten Pfadwechsel (siehe "← Mein
  // Plan", das wegen der eigenen Route /timetable/:segment/:id ohnehin frisch mountet). Der
  // Parameter wird sofort wieder entfernt, damit derselbe Link beim nächsten Klick erneut
  // eine erkennbare URL-Änderung auslöst. viewMode bleibt bewusst unverändert (Nutzerwunsch:
  // "je nachdem was eingestellt ist").
  useEffect(() => {
    if (searchParams.get('resetToToday') === null) return;
    setSelectedDate(toWuDate(new Date()));
    setHighlightActive(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('resetToToday');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const weekStart = wuWeekRange(selectedDate).startDate;
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
          showBooking: true,
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

  // "Lehrstoff" (Nutzerwunsch 2026-09-17, siehe IDEEN.md B8): separater, undokumentierter
  // Endpunkt (api/calendarEntryRest.ts) pro geöffneter Periode, nicht Teil von getTimetable —
  // deshalb ein eigener Query statt eines Felds auf TimetableBlock. Nur für die eigene
  // Person (elementType=personType, wie gemessen) und nur für den eigenen Plan: für ein
  // fremdes Element (Anderen Plan ansehen) ist das nie gemessen worden.
  const calendarDetailQuery = useQuery({
    queryKey: ['calendarEntryDetail', personId, personType, openBlock?.date, openBlock?.startTime, openBlock?.endTime],
    enabled: client !== null && openBlock !== null && personId !== undefined && personType !== undefined && !isForeignElement,
    // Fehlerformat ungemessen (siehe api/calendarEntryRest.ts) — kein Retry, um bei einem
    // unbekannten Fehler (z. B. Rate-Limit) nicht automatisch nachzuhaken.
    retry: false,
    queryFn: async () => {
      if (client === null || openBlock === null || personId === undefined || personType === undefined) {
        throw new Error('Keine aktive Sitzung.');
      }
      const result = await restApi.getCalendarEntryDetailRest(client, {
        elementId: personId,
        elementType: personType,
        startDateTime: wuDateTimeToIsoLocal(openBlock.date, openBlock.startTime),
        endDateTime: wuDateTimeToIsoLocal(openBlock.date, openBlock.endTime),
      });
      // React Query verbietet `undefined` als Query-Ergebnis ("Query data cannot be
      // undefined") — bei keinem Treffer liefert getCalendarEntryDetailRest() aber genau
      // das (Doku-Kommentar dort: "gibt undefined, wenn kein Eintrag ... passt"). `null`
      // ist der uebliche Ersatz-Sentinel dafuer. Das ist NICHT dasselbe `null` wie bei
      // `.teachingContent` (das kann der Server selbst bei einem TREFFER ohne Lehrstoff
      // liefern, siehe RestCalendarEntryDetail) — beide Faelle landen an den Leseseiten
      // unten trotzdem gleich, weil `hasRestText()`/optional chaining beides als "kein
      // Inhalt" behandeln.
      return result ?? null;
    },
  });

  const grid = useMemo(() => buildWeekGrid(query.data ?? [], weekStart), [query.data, weekStart]);
  const weekDays = useMemo(() => grid.slice(0, 5), [grid]);

  // "L"-Badge auf der Karte (Nutzerwunsch 2026-09-24): zeigt, ob eine Stunde Lehrstoff hat,
  // OHNE sie erst zu öffnen — dafür muss `teachingContent` für die ganze sichtbare Woche
  // vorab geladen werden, nicht erst pro Klick wie B8 es ursprünglich vorsah. Zwischenzeitlich
  // (2026-09-24, zweite Runde) auf "nur beim Öffnen" zurückgebaut, dann auf ausdrücklichen
  // Nutzerwunsch (dritte Runde, Screenshot mit gleichzeitig Zusatzinfo UND Lehrstoff) wieder
  // auf Vorabladung umgestellt — das Badge soll sichtbar sein, OHNE dass man erst öffnen muss.
  //
  // Priorisierung: der Tag, den man gerade ansieht (`selectedDate` — Default "heute", oder
  // der Tag, zu dem ein Prüfungs-Klick gesprungen ist), wird ZUERST abgefragt, der Rest der
  // Woche danach in normaler Reihenfolge. Grund: gegen den echten Server teilt sich jede
  // dieser Anfragen die Drosselung mit allen anderen API-Aufrufen (siehe api/client.ts,
  // `minRequestGapMs`) — eine ganze Woche (~30 Perioden) kann dadurch mehrere Sekunden
  // dauern, bevor die letzte Karte ihr Badge bekommt. Ohne Priorisierung stünde der gerade
  // relevante Tag u. U. ganz hinten in der Warteschlange (Montag-zuerst), was sich anfühlt,
  // als würde das Badge gar nicht vor dem Öffnen erscheinen — genau das war der gemeldete
  // Eindruck. Echte Nebenläufigkeit (mehrere Anfragen gleichzeitig statt nacheinander) wurde
  // bewusst NICHT eingebaut: ungemessen, ob der echte Server das ohne Rate-Limit verträgt.
  const teachingContentBlocks = useMemo(() => {
    if (isForeignElement) return [];
    return prioritizeByDate(weekDays, selectedDate).flatMap((day) => day.blocks);
  }, [weekDays, isForeignElement, selectedDate]);
  const teachingContentResults = useQueries({
    queries: teachingContentBlocks.map((block) => ({
      queryKey: ['calendarEntryDetail', personId, personType, block.date, block.startTime, block.endTime],
      enabled: client !== null && personId !== undefined && personType !== undefined,
      // Fehlerformat ungemessen (wie calendarDetailQuery) — kein Retry, damit ein einzelner
      // Fehlschlag nicht die ganze Woche wiederholt nachfragt.
      retry: false,
      queryFn: async () => {
        if (client === null || personId === undefined || personType === undefined) {
          throw new Error('Keine aktive Sitzung.');
        }
        // React Query verbietet `undefined` als Query-Ergebnis, getCalendarEntryDetailRest()
        // liefert das aber bei keinem Treffer (der Normalfall fuer die meisten Perioden).
        const result = await restApi.getCalendarEntryDetailRest(client, {
          elementId: personId,
          elementType: personType,
          startDateTime: wuDateTimeToIsoLocal(block.date, block.startTime),
          endDateTime: wuDateTimeToIsoLocal(block.date, block.endTime),
        });
        return result ?? null;
      },
    })),
  });
  const blocksWithTeachingContent = useMemo(() => {
    const keys = new Set<string>();
    teachingContentBlocks.forEach((block, index) => {
      // hasRestText(), nicht "!== undefined": der Server sendet bei keinem Lehrstoff
      // explizit `null`, nicht nur ein fehlendes Feld (siehe RestCalendarEntryDetail-
      // Kommentar) — Bug, gemeldet 2026-09-24: "L"-Badge erschien trotzdem.
      if (restApi.hasRestText(teachingContentResults[index]?.data?.teachingContent)) {
        keys.add(block.periodIds.join('-'));
      }
    });
    return keys;
  }, [teachingContentBlocks, teachingContentResults]);
  const selectedDay = useMemo(() => grid.find((d) => d.date === selectedDate), [grid, selectedDate]);
  const visibleDays = viewMode === 'week' ? weekDays : selectedDay !== undefined ? [selectedDay] : [];
  const bounds = useMemo(() => computeTimeBounds(visibleDays), [visibleDays]);

  const highlightMatch = useMemo(() => {
    if (highlightDateParam === null || highlightStartParam === null || highlightEndParam === null) return undefined;
    const date = Number(highlightDateParam);
    const start = Number(highlightStartParam);
    const end = Number(highlightEndParam);
    for (const day of grid) {
      if (day.date !== date) continue;
      for (const block of [...day.blocks, ...day.allDayBlocks]) {
        if (block.startTime < end && block.endTime > start) return block.periodIds.join('-');
      }
    }
    return undefined;
  }, [grid, highlightDateParam, highlightStartParam, highlightEndParam]);

  useEffect(() => {
    if (highlightMatch === undefined) return;
    const el = document.getElementById(`bwu-block-${highlightMatch}`);
    // scrollIntoView fehlt in manchen Testumgebungen (jsdom) komplett — defensiv, nicht
    // nur fuer Tests: schadet auch in echten, sehr alten WebViews nicht.
    if (el !== null && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightMatch]);

  function goPrev(): void {
    setSelectedDate((d) => addWuDays(d, viewMode === 'week' ? -7 : -1));
  }
  function goNext(): void {
    setSelectedDate((d) => addWuDays(d, viewMode === 'week' ? 7 : 1));
  }

  // hasRestText(), nicht direkt weiterreichen: siehe blocksWithTeachingContent oben — ohne
  // die Normalisierung würde ein explizites `null` vom Server als leere "LEHRSTOFF"-Zeile in
  // PeriodDetail landen statt dort ausgeblendet zu werden.
  const rawTeachingContent = calendarDetailQuery.data?.teachingContent;
  const detailTeachingContent = restApi.hasRestText(rawTeachingContent) ? rawTeachingContent : undefined;

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
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Ansicht" className="flex gap-1 rounded-lg border border-border p-0.5">
            {(['woche', 'tag'] as const).map((key) => {
              const mode: ViewMode = key === 'woche' ? 'week' : 'day';
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                    viewMode === mode ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-hover'
                  }`}
                >
                  {key === 'woche' ? 'Woche' : 'Tag'}
                </button>
              );
            })}
          </div>
          <Button variant="secondary" onClick={goPrev} aria-label={viewMode === 'week' ? 'Vorige Woche' : 'Vorheriger Tag'}>
            ←
          </Button>
          <span className="text-sm text-fg-muted">
            {viewMode === 'week' ? (
              <>
                {formatWuDate(weekStart, 'de-AT', { day: '2-digit', month: '2-digit' })} –{' '}
                {formatWuDate(weekEnd, 'de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </>
            ) : (
              formatWuDate(selectedDate, 'de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
            )}
          </span>
          <Button variant="secondary" onClick={goNext} aria-label={viewMode === 'week' ? 'Nächste Woche' : 'Nächster Tag'}>
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

      {query.isSuccess && viewMode === 'day' && selectedDay === undefined && (
        <ErrorState error="Kein Tag im geladenen Zeitraum gefunden." />
      )}

      {query.isSuccess && (viewMode === 'week' || selectedDay !== undefined) && (
        <div className="overflow-x-auto pb-2">
          <div className={viewMode === 'week' ? 'w-full sm:min-w-[820px]' : 'min-w-[320px]'}>
            {visibleDays.some((d) => d.allDayBlocks.length > 0) && (
              // Eigene Zeile für ganztägige Einträge, mit demselben Spaltenraster wie das
              // Zeitraster darunter — so bleiben die Spalten pixelgenau ausgerichtet, auch
              // wenn nur ein einzelner Tag so einen Eintrag hat (siehe DayGridColumn).
              <div
                className="mb-1.5 grid gap-1.5"
                style={{ gridTemplateColumns: viewMode === 'week' ? WEEK_GRID_TEMPLATE_COLUMNS : DAY_GRID_TEMPLATE_COLUMNS }}
                aria-label="Ganztägige Einträge"
              >
                <div aria-hidden="true" />
                {visibleDays.map((day) => (
                  <div key={day.date} className="flex min-w-0 flex-col gap-1">
                    {day.allDayBlocks.map((block) => {
                      const text = block.substText ?? block.info ?? block.lstext ?? 'Ganztägiger Eintrag';
                      const key = block.periodIds.join('-');
                      const isHighlighted = highlightActive && key === highlightMatch;
                      return (
                        <button
                          key={key}
                          id={`bwu-block-${key}`}
                          type="button"
                          title={text}
                          onClick={() => setOpenBlock(block)}
                          className={`truncate rounded-md border border-border bg-surface-hover px-2 py-1 text-left text-[10px] font-medium text-fg-muted hover:bg-border ${
                            isHighlighted ? 'bwu-neon-highlight' : ''
                          }`}
                        >
                          {text}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: viewMode === 'week' ? WEEK_GRID_TEMPLATE_COLUMNS : DAY_GRID_TEMPLATE_COLUMNS }}
            >
              <TimeAxis bounds={bounds} />
              {visibleDays.map((day) => (
                <DayGridColumn
                  key={day.date}
                  label={weekdayLabel(day.date)}
                  day={day}
                  bounds={bounds}
                  onOpenBlock={setOpenBlock}
                  highlightActive={highlightActive}
                  highlightKey={highlightMatch}
                  blocksWithTeachingContent={blocksWithTeachingContent}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {openBlock !== null && (
        <Modal title={blockTitle(openBlock)} onClose={() => setOpenBlock(null)}>
          <PeriodDetail block={openBlock} teachingContent={detailTeachingContent} />
        </Modal>
      )}
    </div>
  );
}

function TimeAxis({ bounds }: { bounds: TimeBounds }) {
  const totalMinutes = bounds.endMinutes - bounds.startMinutes;
  return (
    <div className="flex flex-col">
      <div className="h-5" aria-hidden="true" />
      <div className="relative" style={{ height: px(totalMinutes) }}>
        {timeBoundsHourMarks(bounds).map((minute) => (
          <div
            key={minute}
            className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-fg-muted"
            style={{ top: px(minute - bounds.startMinutes) }}
          >
            {formatWuTime(minutesToWuTime(minute))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DayGridColumnProps {
  label: string;
  day: TimetableDay;
  bounds: TimeBounds;
  onOpenBlock: (block: TimetableBlock) => void;
  highlightActive: boolean;
  highlightKey: string | undefined;
  /** Block-Keys (`periodIds.join('-')`) mit bereits vorab geladenem Lehrstoff — "L"-Badge. */
  blocksWithTeachingContent: ReadonlySet<string>;
}

function DayGridColumn({
  label,
  day,
  bounds,
  onOpenBlock,
  highlightActive,
  highlightKey,
  blocksWithTeachingContent,
}: DayGridColumnProps) {
  const totalMinutes = bounds.endMinutes - bounds.startMinutes;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="h-5 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {label} · {formatWuDate(day.date, 'de-AT', { day: '2-digit', month: '2-digit' })}
      </div>
      <div className="relative rounded-lg border border-border bg-bg" style={{ height: px(totalMinutes) }}>
        {timeBoundsHourMarks(bounds).map((minute) => (
          <div
            key={minute}
            className="absolute inset-x-0 border-t border-border/60"
            style={{ top: px(minute - bounds.startMinutes) }}
          />
        ))}
        {day.blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-muted">
            Keine Perioden an diesem Tag.
          </div>
        )}
        {day.blocks.map((block) => {
          const top = blockTop(wuTimeToMinutes(block.startTime) - bounds.startMinutes);
          const height = blockHeight(wuTimeToMinutes(block.endTime) - wuTimeToMinutes(block.startTime), 30);
          const key = block.periodIds.join('-');
          return (
            <div key={key} id={`bwu-block-${key}`} className="absolute inset-x-0.5" style={{ top, height }}>
              <TimetableBlockCard
                block={block}
                dense
                onOpen={onOpenBlock}
                highlighted={highlightActive && key === highlightKey}
                hasTeachingContent={blocksWithTeachingContent.has(key)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
