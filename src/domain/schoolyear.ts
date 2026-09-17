/**
 * Schuljahr-Auswahl für Screens, die pro Schuljahr abfragen (Prüfungen, Abwesenheiten —
 * beide über REST-Workarounds, siehe api/examsRest.ts/absencesRest.ts und IDEEN.md B3):
 * ein Schuljahr auf einmal, nicht die komplette Historie, damit die Antwort überschaubar
 * bleibt.
 */

import type { Schoolyear, WuDate } from '../api/types';

/** Das Schuljahr, das `today` enthält — sonst das zuletzt begonnene (z. B. in den Ferien). */
export function defaultSchoolyearId(schoolyears: readonly Schoolyear[], today: WuDate): number | undefined {
  const containing = schoolyears.find((y) => y.startDate <= today && today <= y.endDate);
  if (containing !== undefined) return containing.id;
  return [...schoolyears].toSorted((a, b) => b.startDate - a.startDate)[0]?.id;
}
