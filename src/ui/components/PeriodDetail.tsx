import { Link } from 'react-router-dom';
import { formatWuDate, formatWuTime, wuTimeToMinutes } from '../../api/format';
import type { TimetableBlock } from '../../domain/timetable';

const LSTYPE_LABEL: Record<string, string> = {
  ex: 'Prüfung',
  oh: 'Sprechstunde',
  sb: 'Bereitschaft',
  bs: 'Pausenaufsicht',
};

function Row({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-fg-muted uppercase">{label}</dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
}

/** Aufgeklappte Detailansicht einer Stundenplan-Periode — alles, was die Karte selbst nicht zeigt. */
export function PeriodDetail({ block }: { block: TimetableBlock }) {
  const durationMinutes = wuTimeToMinutes(block.endTime) - wuTimeToMinutes(block.startTime);
  const statusLabel = block.code === 'cancelled' ? 'Entfall' : block.code === 'irregular' ? 'Vertretung/Änderung' : undefined;

  return (
    <dl className="flex flex-col gap-3">
      <Row
        label="Fach"
        value={block.subject?.longname ?? block.subject?.name ?? (block.lstype !== undefined ? LSTYPE_LABEL[block.lstype] : undefined)}
      />
      <Row
        label="Datum"
        value={formatWuDate(block.date, 'de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
      />
      <Row label="Uhrzeit" value={`${formatWuTime(block.startTime)}–${formatWuTime(block.endTime)} (${durationMinutes} Min.)`} />
      <Row label="Lehrkraft" value={block.teacher?.longname ?? block.teacher?.name} />
      <Row label="Raum" value={block.room?.longname ?? block.room?.name} />
      <Row label="Klasse/Gruppe" value={block.klasse?.name ?? block.studentGroup} />
      <Row label="Status" value={statusLabel} />
      <Row label="Vertretungstext" value={block.substText} />
      <Row label="Zusatzinfo" value={block.info} />
      <Row label="Hinweis" value={block.lstext} />
      <Row label="Buchungshinweis" value={block.bookingText} />
      <Row label="Buchungsvermerk" value={block.bookingRemark} />

      {block.subject?.id !== undefined && (
        <Link to="/settings" className="text-sm text-accent hover:underline">
          Farbe für {block.subject.name ?? 'dieses Fach'} anpassen →
        </Link>
      )}
    </dl>
  );
}
