/**
 * Sammelt alle undokumentierten REST-Endpunkte unter einem gemeinsamen Namensraum
 * (`restApi` in `api/index.ts`) — bewusst getrennt von den dokumentierten Methoden in
 * `methods.ts`. Siehe die einzelnen Dateien für Hintergrund, Risiko und die jeweils
 * gemessene Beispielantwort.
 */
export * from './examsRest';
export * from './absencesRest';
export * from './calendarEntryRest';
