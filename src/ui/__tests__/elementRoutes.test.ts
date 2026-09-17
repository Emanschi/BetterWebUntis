import { describe, expect, it } from 'vitest';
import { ElementType } from '../../api/types';
import {
  ELEMENT_TYPE_SEGMENTS,
  elementTypeForSegment,
  segmentForElementType,
  timetablePathFor,
} from '../elementRoutes';

describe('elementRoutes', () => {
  it('bildet jeden ElementType auf genau ein Segment ab und zurueck', () => {
    for (const [segment, type] of Object.entries(ELEMENT_TYPE_SEGMENTS)) {
      expect(segmentForElementType(type)).toBe(segment);
      expect(elementTypeForSegment(segment)).toBe(type);
    }
  });

  it('liefert undefined fuer unbekannte Segmente', () => {
    expect(elementTypeForSegment('gibtsnicht')).toBeUndefined();
  });

  it('liefert undefined fuer Typen ohne Segment (STUDENT hat keinen Wechsel-Eintrag)', () => {
    expect(segmentForElementType(ElementType.STUDENT)).toBeUndefined();
  });

  it('baut den Stundenplan-Pfad', () => {
    expect(timetablePathFor(ElementType.KLASSE, 102)).toBe('/timetable/klasse/102');
  });

  it('faellt fuer nicht routbare Typen auf /timetable zurueck — Lehrer/Fach/Raum bewusst entfernt (IDEEN.md)', () => {
    expect(timetablePathFor(ElementType.STUDENT, 501)).toBe('/timetable');
    expect(timetablePathFor(ElementType.TEACHER, 12)).toBe('/timetable');
    expect(timetablePathFor(ElementType.SUBJECT, 4)).toBe('/timetable');
    expect(timetablePathFor(ElementType.ROOM, 3)).toBe('/timetable');
  });
});
