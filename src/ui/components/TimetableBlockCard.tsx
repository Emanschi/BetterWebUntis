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

export function TimetableBlockCard({ block }: { block: TimetableBlock }) {
  const colors = block.subject !== undefined ? subjectColor({ id: block.subject.id ?? 0, name: block.subject.name }) : undefined;
  const cancelled = block.code === 'cancelled';
  const irregular = block.code === 'irregular';
  const tooltipText = [block.substText, block.info].filter((t): t is string => t !== undefined && t !== '').join(' — ');
  const badge = block.lstype !== undefined && block.lstype !== 'ls' ? (LSTYPE_LABEL[block.lstype] ?? block.lstype) : undefined;

  return (
    <div
      title={tooltipText === '' ? undefined : tooltipText}
      className={`flex flex-col gap-1 rounded-lg border-l-4 border-y border-r border-border bg-surface p-2 text-xs ${
        cancelled ? 'opacity-60' : ''
      }`}
      style={{ borderLeftColor: colors?.background ?? 'var(--bwu-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`font-semibold text-fg ${cancelled ? 'line-through' : ''}`}>{blockTitle(block)}</span>
        {badge !== undefined && (
          <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
            {badge}
          </span>
        )}
      </div>

      <div className="text-fg-muted">
        {formatWuTime(block.startTime)}–{formatWuTime(block.endTime)}
      </div>

      {(block.teacher?.name !== undefined || block.room?.name !== undefined) && (
        <div className="text-fg-muted">
          {block.teacher?.name}
          {block.teacher?.name !== undefined && block.room?.name !== undefined ? ' · ' : ''}
          {block.room?.name}
        </div>
      )}

      {irregular && <div className="font-medium text-irregular">⚠ {block.substText ?? 'Vertretung'}</div>}
      {cancelled && <div className="font-medium text-cancelled">{block.substText ?? 'Entfall'}</div>}
    </div>
  );
}
