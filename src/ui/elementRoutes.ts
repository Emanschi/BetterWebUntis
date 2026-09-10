/**
 * URL-Segmente für den Elementwechsel (M6): "welchen Stundenplan sehe ich mir an".
 * Lesbare deutsche Wörter in der URL statt der rohen ElementType-Zahlen aus der API.
 */

import { ElementType } from '../api/types';

export const ELEMENT_TYPE_SEGMENTS = {
  klasse: ElementType.KLASSE,
  lehrer: ElementType.TEACHER,
  fach: ElementType.SUBJECT,
  raum: ElementType.ROOM,
} as const;

export type ElementTypeSegment = keyof typeof ELEMENT_TYPE_SEGMENTS;

export const ELEMENT_TYPE_LABELS: Record<ElementTypeSegment, string> = {
  klasse: 'Klasse',
  lehrer: 'Lehrer',
  fach: 'Fach',
  raum: 'Raum',
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
