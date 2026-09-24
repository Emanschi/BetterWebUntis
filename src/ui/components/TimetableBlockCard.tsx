import { formatWuTime } from '../../api/format';
import { subjectColor } from '../../domain/colors';
import { useSubjectColorStore } from '../../state/subjectColorStore';
import type { TimetableBlock } from '../../domain/timetable';

const LSTYPE_LABEL: Record<string, string> = {
  ex: 'Prüfung',
  oh: 'Sprechstunde',
  sb: 'Bereitschaft',
  bs: 'Pausenaufsicht',
};

export function blockTitle(block: TimetableBlock): string {
  if (block.subject?.name !== undefined) return block.subject.name;
  if (block.lstype !== undefined) return LSTYPE_LABEL[block.lstype] ?? block.lstype;
  return '—';
}

interface TimetableBlockCardProps {
  block: TimetableBlock;
  /**
   * Kompakte Darstellung für den Zeitraster (M-Update): kleinere Schrift/Abstände,
   * damit auch kurze Einzelstunden (z. B. 45 Min.) noch alle Informationen zeigen,
   * ohne den Block optisch zu sprengen.
   */
  dense?: boolean;
  /** Öffnet die Detailansicht (PeriodDetail in einem Modal) — siehe TimetableScreen.tsx. */
  onOpen?: (block: TimetableBlock) => void;
  /**
   * Kurzer Neon-Rahmen (siehe index.css `.bwu-neon-highlight`) — gesetzt, wenn von
   * anderswo hierher gesprungen wurde (z. B. Klick auf eine Prüfung in ExamsScreen.tsx).
   * Zeitgesteuertes An/Aus kommt von TimetableScreen.tsx, nicht von hier.
   */
  highlighted?: boolean;
  /**
   * "L"-Badge (Nutzerwunsch 2026-09-24, analog zum Info-Badge): zeigt an, dass für diese
   * Stunde Lehrstoff hinterlegt ist. `teachingContent` selbst ist kein Feld von
   * `TimetableBlock` (separater, erst vorab geladener REST-Aufruf, siehe
   * TimetableScreen.tsx `blocksWithTeachingContent`) — deshalb ein eigenes Bool-Prop statt
   * eines Blocks-Felds, wie beim `info`-Badge aber ohne den Volltext hier zu brauchen.
   */
  hasTeachingContent?: boolean;
}

/**
 * Fach-Karte, komplett in der Fachfarbe gefüllt (Nutzerwunsch 2026-09-17 — vorher nur ein
 * linker Farbstreifen). Textfarbe kommt aus `domain/colors.ts` (WCAG-Kontrastformel bei
 * generierten/eigenen Farben, sonst die von der Schule gelieferte) — funktioniert dadurch
 * automatisch in Light und Dark Mode, ohne die Fachfarbe selbst je Theme zu verändern.
 * Ein Klick öffnet die Detailansicht (`onOpen`), Entfall bleibt bewusst neutral/grau statt
 * farbig, damit "das findet nicht statt" auf den ersten Blick auffällt.
 */
export function TimetableBlockCard({
  block,
  dense = false,
  onOpen,
  highlighted = false,
  hasTeachingContent = false,
}: TimetableBlockCardProps) {
  const override = useSubjectColorStore((s) => (block.subject?.id !== undefined ? s.overrides[block.subject.id] : undefined));
  const cancelled = block.code === 'cancelled';
  const irregular = block.code === 'irregular';
  const colors = block.subject !== undefined && !cancelled ? subjectColor({ id: block.subject.id ?? 0, name: block.subject.name }, override) : undefined;
  const tooltipText = [block.substText, block.info].filter((t): t is string => t !== undefined && t !== '').join(' — ');
  const badgeLabel = block.lstype !== undefined && block.lstype !== 'ls' ? (LSTYPE_LABEL[block.lstype] ?? block.lstype) : undefined;
  // Nutzerwunsch 2026-09-22: `info` (z. B. kurze Lehrkraft-Hinweise wie "Test"/"MÜ", siehe
  // TESTING.md "SMÜ Nomenklatur") war bisher nur im Titel-Tooltip versteckt (Hover, auf
  // Touch-Geräten gar nicht erreichbar). Jetzt ein sichtbares Icon auf der Karte selbst —
  // der Volltext steht weiterhin erst in der Detailansicht (PeriodDetail "Zusatzinfo"),
  // dieses Icon ist nur der Hinweis "hier steht was", kein eigener Klick-Handler nötig,
  // die ganze Karte öffnet ohnehin schon die Detailansicht.
  const hasInfo = block.info !== undefined && block.info !== '';
  // Pillen (Warnung/Badge) brauchen einen eigenen, vom Fachton unabhaengigen Kontrast —
  // ein halbtransparentes Overlay in der Gegenrichtung der Textfarbe funktioniert auf
  // jeder Hintergrundfarbe.
  const pillStyle = colors !== undefined ? { backgroundColor: colors.foreground === '#ffffff' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.4)' } : undefined;

  return (
    <button
      type="button"
      title={tooltipText === '' ? undefined : tooltipText}
      onClick={() => onOpen?.(block)}
      aria-haspopup="dialog"
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg text-left transition-shadow ${
        dense ? 'gap-0.5 p-1.5 text-[11px] leading-tight' : 'gap-1 p-2 text-xs'
      } ${cancelled ? 'border border-border bg-surface-hover opacity-70' : 'shadow-sm hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'} ${
        highlighted ? 'bwu-neon-highlight' : ''
      }`}
      style={cancelled ? undefined : { backgroundColor: colors?.background ?? 'var(--bwu-surface-hover)', color: colors?.foreground ?? 'var(--bwu-fg)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`font-semibold ${cancelled ? 'text-fg line-through' : ''}`}>{blockTitle(block)}</span>
        <div className="flex shrink-0 items-center gap-1">
          {hasInfo && (
            <span
              role="img"
              aria-label="Zusatzinfo vorhanden"
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-bold"
              style={pillStyle}
            >
              i
            </span>
          )}
          {hasTeachingContent && (
            <span
              role="img"
              aria-label="Lehrstoff vorhanden"
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-bold"
              style={pillStyle}
            >
              L
            </span>
          )}
          {badgeLabel !== undefined && (
            <span className="rounded px-1 py-0.5 text-[9px] font-medium" style={pillStyle}>
              {badgeLabel}
            </span>
          )}
        </div>
      </div>

      <div className={`font-medium ${cancelled ? 'text-fg-muted' : 'opacity-90'}`}>
        {formatWuTime(block.startTime)}–{formatWuTime(block.endTime)}
      </div>

      {(block.teacher?.name !== undefined || block.room?.name !== undefined) && (
        <div className={`truncate ${cancelled ? 'text-fg-muted' : 'opacity-90'}`}>
          {block.teacher?.name}
          {block.teacher?.name !== undefined && block.room?.name !== undefined ? ' · ' : ''}
          {block.room?.name}
        </div>
      )}

      {irregular && (
        <div className="mt-auto inline-flex w-fit items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-semibold" style={pillStyle}>
          ⚠ {block.substText ?? 'Vertretung'}
        </div>
      )}
      {cancelled && <div className="truncate font-medium text-cancelled">{block.substText ?? 'Entfall'}</div>}
    </button>
  );
}
