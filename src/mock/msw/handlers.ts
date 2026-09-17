/**
 * MSW-Handler (Mock Service Worker) für den JSON-RPC-Endpunkt — fürs Testen von UI-
 * und Domain-Code ab M4/M5, die über den echten `WebUntisClient`/`fetch` mit dem
 * Mock kommunizieren, ohne einen echten Prozess/Port zu brauchen.
 *
 * Nutzt denselben `handleRpc()`-Dispatcher wie `server.ts` — siehe dort für die
 * Begründung, warum die Fachlogik nur einmal existiert.
 */

import { http, HttpResponse } from 'msw';
import { SESSION_COOKIE } from '../../api/client';
import { createMockState, handleRpc, type MockServerState } from '../rpcHandler';
import { mockExamsRest } from '../examsRestMock';
import { mockAbsencesRest } from '../absencesRestMock';
import { mockCalendarEntryDetail, parseIsoLocalDateTime } from '../calendarEntryRestMock';
import type { MockElement } from '../timetable';

function readSessionCookie(cookieHeader: string | null): string | undefined {
  if (cookieHeader === null) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
}

/**
 * Baut einen MSW-GET-Handler für einen der undokumentierten REST-Endpunkte (siehe
 * api/examsRest.ts, api/absencesRest.ts) — gleiches Muster für beide: `startDate`/
 * `endDate` filtern, Ergebnis unter `wrapKey` verpackt. 401 bei fehlender Session ist eine
 * plausible, aber nie real gemessene Annahme.
 */
function dateRangeRestHandler<T>(
  path: string,
  state: MockServerState,
  fetchItems: (startDate: number, endDate: number) => readonly T[],
  wrapKey: string,
) {
  return http.get(`*${path}`, ({ request }) => {
    const sessionId = readSessionCookie(request.headers.get('cookie'));
    if (sessionId === undefined || !state.sessions.has(sessionId)) {
      return HttpResponse.json({ error: 'not authenticated (Annahme, real nie gemessen)' }, { status: 401 });
    }

    const url = new URL(request.url);
    const startDate = Number(url.searchParams.get('startDate') ?? 0);
    const endDate = Number(url.searchParams.get('endDate') ?? 99999999);
    return HttpResponse.json({ data: { [wrapKey]: fetchItems(startDate, endDate) } });
  });
}

/**
 * Simuliert den undokumentierten calendar-entry-detail-Endpunkt (siehe
 * api/calendarEntryRest.ts) — anderes Anfrage-/Antwortformat als `dateRangeRestHandler`
 * (ein einzelner Eintrag über exakte Start-/Endzeit statt einer Liste über einen Zeitraum).
 */
function calendarEntryDetailHandler(state: MockServerState) {
  return http.get('*/WebUntis/api/rest/view/v2/calendar-entry/detail', ({ request }) => {
    const sessionId = readSessionCookie(request.headers.get('cookie'));
    if (sessionId === undefined || !state.sessions.has(sessionId)) {
      return HttpResponse.json({ error: 'not authenticated (Annahme, real nie gemessen)' }, { status: 401 });
    }

    const url = new URL(request.url);
    const elementId = Number(url.searchParams.get('elementId') ?? NaN);
    const elementType = Number(url.searchParams.get('elementType') ?? NaN) as MockElement['type'];
    const start = parseIsoLocalDateTime(url.searchParams.get('startDateTime') ?? '');
    const end = parseIsoLocalDateTime(url.searchParams.get('endDateTime') ?? '');

    const detail = mockCalendarEntryDetail({ id: elementId, type: elementType }, start.date, start.time, end.time);
    return HttpResponse.json({ calendarEntries: detail === undefined ? [] : [detail] });
  });
}

/**
 * Baut die MSW-Handler. `state` kann von außen übergeben werden, damit ein Test seine
 * Session zwischen mehreren Requests behalten oder gezielt zurücksetzen kann.
 */
export function createMswHandlers(state: MockServerState = createMockState()) {
  return [
    http.post('*/WebUntis/jsonrpc.do', async ({ request }) => {
      const raw: unknown = await request.json();
      const body = (typeof raw === 'object' && raw !== null ? raw : {}) as {
        id?: unknown;
        method?: unknown;
        params?: unknown;
      };
      const id = typeof body.id === 'string' ? body.id : String(body.id ?? '');
      const method = typeof body.method === 'string' ? body.method : '';
      const sessionId = readSessionCookie(request.headers.get('cookie'));

      const outcome = handleRpc(state, sessionId, { id, method, params: body.params });

      const headers = new Headers({ 'Content-Type': 'application/json-rpc;charset=UTF-8' });
      if (outcome.session === null) {
        if (sessionId !== undefined) state.sessions.delete(sessionId);
        headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
      } else if (outcome.session !== undefined) {
        state.sessions.set(outcome.session.sessionId, outcome.session);
        headers.append('Set-Cookie', `${SESSION_COOKIE}=${outcome.session.sessionId}; Path=/`);
      }

      return HttpResponse.json(outcome.envelope, { headers });
    }),

    dateRangeRestHandler('/WebUntis/api/exams', state, mockExamsRest, 'exams'),
    dateRangeRestHandler('/WebUntis/api/classreg/absences/students', state, mockAbsencesRest, 'absences'),
    calendarEntryDetailHandler(state),
  ];
}

export { createMockState, type MockServerState } from '../rpcHandler';
