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

function readSessionCookie(cookieHeader: string | null): string | undefined {
  if (cookieHeader === null) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
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

    // Undokumentierter REST-Endpunkt (siehe api/examsRest.ts) — kein Teil der 2018er-Doku,
    // dasselbe 401-bei-fehlender-Session-Verhalten wie in mock/server.ts (Annahme, nie
    // real gemessen).
    http.get('*/WebUntis/api/exams', ({ request }) => {
      const sessionId = readSessionCookie(request.headers.get('cookie'));
      if (sessionId === undefined || !state.sessions.has(sessionId)) {
        return HttpResponse.json(
          { error: 'not authenticated (Annahme, real nie gemessen — siehe examsRest.ts)' },
          { status: 401 },
        );
      }

      const url = new URL(request.url);
      const startDate = Number(url.searchParams.get('startDate') ?? 0);
      const endDate = Number(url.searchParams.get('endDate') ?? 99999999);
      return HttpResponse.json({ data: { exams: mockExamsRest(startDate, endDate) } });
    }),
  ];
}

export { createMockState, type MockServerState } from '../rpcHandler';
