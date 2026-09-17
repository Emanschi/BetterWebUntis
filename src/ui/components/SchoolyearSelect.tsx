import type { Schoolyear } from '../../api/types';

interface SchoolyearSelectProps {
  schoolyears: readonly Schoolyear[];
  value: number | undefined;
  onChange: (id: number) => void;
}

export function SchoolyearSelect({ schoolyears, value, onChange }: SchoolyearSelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg-muted">
      Schuljahr
      <select
        className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {[...schoolyears]
          .toSorted((a, b) => b.startDate - a.startDate)
          .map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
      </select>
    </label>
  );
}
