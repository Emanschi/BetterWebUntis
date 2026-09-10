import { useParams } from 'react-router-dom';
import { ELEMENT_TYPE_LABELS, elementTypeForSegment, type ElementTypeSegment } from '../elementRoutes';
import { ErrorState } from '../components/ErrorState';
import { TimetableScreen } from './TimetableScreen';

/**
 * Liest Elementtyp und -Id aus der URL (z. B. "/timetable/klasse/102") und reicht sie
 * als Element an `TimetableScreen` weiter — der eigentliche Screen bleibt dadurch
 * unabhängig vom Routing testbar (nimmt sein Element als Prop).
 */
export function TimetableRouteScreen() {
  const { segment, id } = useParams<{ segment: string; id: string }>();
  const type = segment !== undefined ? elementTypeForSegment(segment) : undefined;
  const numericId = id !== undefined ? Number(id) : NaN;

  if (type === undefined || Number.isNaN(numericId)) {
    return <ErrorState error={`Ungültiger Stundenplan-Link: "${segment}/${id}".`} />;
  }

  const label = ELEMENT_TYPE_LABELS[segment as ElementTypeSegment];
  return <TimetableScreen element={{ id: numericId, type }} title={`Stundenplan · ${label}`} />;
}
