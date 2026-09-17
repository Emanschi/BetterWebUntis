import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import type { Subject } from '../../api/types';
import { subjectColor } from '../../domain/colors';
import { useSubjectColorStore } from '../../state/subjectColorStore';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

/** Bewusst kuratiert statt eines rohen Farbkreises — gut unterscheidbare, kräftige Töne,
 * die mit der automatischen Kontrastberechnung (domain/colors.ts) in beiden Themes
 * funktionieren. */
const PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#78716c',
];

/**
 * Fachfarben anpassen (Nutzerwunsch 2026-09-17). Zeigt nur Fächer, die im eigenen
 * Stundenplan tatsächlich vorkommen (nicht den ganzen Schulkatalog aus `getSubjects` —
 * an der HTL St. Pölten allein knapp 500 Einträge, siehe TESTING.md).
 *
 * Die Auswahl übersteuert, was `domain/colors.ts` sonst anzeigen würde — unabhängig
 * davon, ob die Schule selbst `foreColor`/`backColor` liefert (dazu siehe TESTING.md,
 * noch ungeklärt für diese Schule) oder nicht: eine bewusste Nutzerwahl soll in beiden
 * Fällen funktionieren. Gespeichert lokal in diesem Browser/Gerät, siehe
 * `state/subjectColorStore.ts`.
 */
export function SettingsScreen() {
  const client = useSessionStore((s) => s.client);
  const personType = useSessionStore((s) => s.personType);
  const personId = useSessionStore((s) => s.personId);
  const element = personType !== undefined && personId !== undefined ? { id: personId, type: personType } : undefined;

  const overrides = useSubjectColorStore((s) => s.overrides);
  const setOverride = useSubjectColorStore((s) => s.setOverride);
  const clearOverride = useSubjectColorStore((s) => s.clearOverride);

  const ownSubjectIdsQuery = useQuery({
    queryKey: ['settings-own-subject-ids', element],
    enabled: client !== null && element !== undefined,
    queryFn: async () => {
      if (client === null || element === undefined) throw new Error('Keine aktive Sitzung.');
      // Bewusst NICHT +-180 Tage (war so, siehe TESTING.md): der echte Server lehnt
      // getTimetable ab, wenn startDate/endDate ausserhalb desselben Schuljahres liegen
      // (Code -8507, "not within a single school year") -- gemessen 2026-09-17. Ein
      // Schuljahr auf einmal ist also nicht nur UX-Praeferenz (wie bei Pruefungen/
      // Abwesenheiten, IDEEN.md B3), sondern hier zwingend.
      const schoolyear = await api.getCurrentSchoolyear(client);
      const periods = await api.getTimetableCustom(client, {
        element,
        startDate: schoolyear.startDate,
        endDate: schoolyear.endDate,
        subjectFields: ['id'],
      });
      return new Set(periods.map((p) => p.su?.[0]?.id).filter((id): id is number => id !== undefined));
    },
  });

  const subjectsQuery = useQuery({
    queryKey: ['subjects'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getSubjects(client);
    },
  });

  const mySubjects = useMemo(() => {
    if (ownSubjectIdsQuery.data === undefined || subjectsQuery.data === undefined) return undefined;
    const ids = ownSubjectIdsQuery.data;
    return [...subjectsQuery.data].filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
  }, [ownSubjectIdsQuery.data, subjectsQuery.data]);

  const isLoading = ownSubjectIdsQuery.isPending || subjectsQuery.isPending;
  const error = ownSubjectIdsQuery.error ?? subjectsQuery.error;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Einstellungen</h1>
        <p className="text-sm text-fg-muted">
          Fachfarben anpassen — die Auswahl wird nur in diesem Browser bzw. auf diesem Gerät gespeichert.
        </p>
      </div>

      {isLoading && <Spinner label="Fächer werden geladen…" />}
      {(ownSubjectIdsQuery.isError || subjectsQuery.isError) && <ErrorState error={error} />}

      {mySubjects !== undefined && mySubjects.length === 0 && (
        <Card className="text-sm text-fg-muted">Keine Fächer im Stundenplan dieses Schuljahres gefunden.</Card>
      )}

      {mySubjects !== undefined && mySubjects.length > 0 && (
        <div className="flex flex-col gap-3">
          {mySubjects.map((subject) => (
            <SubjectColorRow
              key={subject.id}
              subject={subject}
              override={overrides[subject.id]}
              onPick={(hex) => setOverride(subject.id, hex)}
              onReset={() => clearOverride(subject.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectColorRow({
  subject,
  override,
  onPick,
  onReset,
}: {
  subject: Subject;
  override: string | undefined;
  onPick: (hex: string) => void;
  onReset: () => void;
}) {
  const resolved = subjectColor(subject, override);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="h-8 w-8 shrink-0 rounded-lg border border-border/50"
            style={{ backgroundColor: resolved.background }}
            aria-hidden="true"
          />
          <div>
            <div className="text-sm font-medium text-fg">{subject.name}</div>
            {subject.longName !== subject.name && <div className="text-xs text-fg-muted">{subject.longName}</div>}
          </div>
        </div>
        {override !== undefined && (
          <button type="button" onClick={onReset} className="text-xs text-accent hover:underline">
            Zurücksetzen
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Farbe für ${subject.name} wählen`}>
        {PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onPick(hex)}
            aria-label={hex}
            aria-pressed={override === hex}
            className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
              override === hex ? 'border-fg' : 'border-transparent'
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
        <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-xs text-fg-muted hover:bg-surface-hover">
          <input
            type="color"
            value={override ?? resolved.background}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`Eigene Farbe für ${subject.name}`}
          />
          <span aria-hidden="true">+</span>
        </label>
      </div>
    </Card>
  );
}
