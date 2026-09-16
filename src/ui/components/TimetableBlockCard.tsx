import { formatWuTime } from '../../api/format';
import { subjectColor } from '../../domain/colors';
import type { TimetableBlock } from '../../domain/timetable';

const LSTYPE_LABEL: Record<string, string> = {
  ex: 'Prüfung',
  oh: 'Sprechstunde',
  sb: 'Bereitschaft',
  bs: 'Pausenaufsicht',
};

function blockTitle(block: TimetableBlock): string {
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
}

export function TimetableBlockCard({ block, dense = false }: TimetableBlockCardProps) {
  const colors = block.subject !== undefined ? subjectColor({ id: block.subject.id ?? 0, name: block.subject.name }) : undefined;
  const cancelled = block.code === 'cancelled';
  const irregular = block.code === 'irregular';
  const tooltipText = [block.substText, block.info].filter((t): t is string => t !== undefined && t !== '').join(' — ');
  const badge = block.lstype !== undefined && block.lstype !== 'ls' ? (LSTYPE_LABEL[block.lstype] ?? block.lstype) : undefined;

  return (
    <div
      title={tooltipText === '' ? undefined : tooltipText}
      className={`flex h-full flex-col overflow-hidden rounded-lg border-l-4 border-y border-r border-border bg-surface ${
        dense ? 'gap-0 p-1.5 text-[11px] leading-tight' : 'gap-1 p-2 text-xs'
      } ${cancelled ? 'opacity-60' : ''}`}
      style={{ borderLeftColor: colors?.background ?? 'var(--bwu-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`font-semibold text-fg ${cancelled ? 'line-through' : ''}`}>{blockTitle(block)}</span>
        {badge !== undefined && (
          <span className="shrink-0 rounded bg-surface-hover px-1 py-0.5 text-[9px] font-medium text-fg-muted">
            {badge}
          </span>
        )}
      </div>

      <div className="font-medium text-fg-muted">
        {formatWuTime(block.startTime)}–{formatWuTime(block.endTime)}
      </div>

      {(block.teacher?.name !== undefined || block.room?.name !== undefined) && (
        <div className="truncate text-fg-muted">
          {block.teacher?.name}
          {block.teacher?.name !== undefined && block.room?.name !== undefined ? ' · ' : ''}
          {block.room?.name}
        </div>
      )}

      {irregular && <div className="truncate font-medium text-irregular">⚠ {block.substText ?? 'Vertretung'}</div>}
      {cancelled && <div className="truncate font-medium text-cancelled">{block.substText ?? 'Entfall'}</div>}
    </div>
  );
}
