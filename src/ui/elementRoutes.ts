/**
 * URL-Segmente für den Elementwechsel (M6): "welchen Stundenplan sehe ich mir an".
 * Lesbare deutsche Wörter in der URL statt der rohen ElementType-Zahlen aus der API.
 *
 * Nur noch "klasse" (Nutzerwunsch 2026-09-17): Lehrer-/Fach-/Raum-Suche entfernt, siehe
 * IDEEN.md. Als Map statt hartem Einzelwert belassen — der eigentliche Zweck (URL-Segment
 * ↔ numerischer ElementType ↔ Anzeigename trennen) bleibt auch mit einem Eintrag richtig.
 */

import { ElementType } from '../api/types';

export const ELEMENT_TYPE_SEGMENTS = {
  klasse: ElementType.KLASSE,
} as const;

export type ElementTypeSegment = keyof typeof ELEMENT_TYPE_SEGMENTS;

export const ELEMENT_TYPE_LABELS: Record<ElementTypeSegment, string> = {
  klasse: 'Klasse',
};

export function segmentForElementType(type: number): ElementTypeSegment | undefined {
  return (Object.keys(ELEMENT_TYPE_SEGMENTS) as ElementTypeSegment[]).find(
    (segment) => ELEMENT_TYPE_SEGMENTS[segment] === type,
  );
}

export function elementTypeForSegment(
  segment: string,
): (typeof ElementType)[keyof typeof ElementType] | undefined {
  return segment in ELEMENT_TYPE_SEGMENTS ? ELEMENT_TYPE_SEGMENTS[segment as ElementTypeSegment] : undefined;
}

/** Baut den Pfad für den Stundenplan eines fremden Elements, z. B. "/timetable/klasse/102". */
export function timetablePathFor(type: number, id: number): string {
  const segment = segmentForElementType(type);
  return segment === undefined ? '/timetable' : `/timetable/${segment}/${id}`;
}
