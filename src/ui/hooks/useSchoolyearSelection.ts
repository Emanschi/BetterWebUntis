import { useState } from 'react';
import { toWuDate } from '../../api/format';
import type { Schoolyear } from '../../api/types';
import { defaultSchoolyearId } from '../../domain/schoolyear';

/**
 * Schuljahr-Auswahl für Screens mit einem Schuljahr-Dropdown (Prüfungen, Abwesenheiten —
 * siehe domain/schoolyear.ts). Startet beim Schuljahr, das heute enthält, sobald die Liste
 * geladen ist; danach entscheidet die Nutzerauswahl.
 */
export function useSchoolyearSelection(schoolyears: readonly Schoolyear[] | undefined) {
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const today = toWuDate(new Date());
  const effectiveId = selectedId ?? (schoolyears !== undefined ? defaultSchoolyearId(schoolyears, today) : undefined);
  const selected = schoolyears?.find((y) => y.id === effectiveId);
  return { effectiveId, selected, setSelectedId };
}
