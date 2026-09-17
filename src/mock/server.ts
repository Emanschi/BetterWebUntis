/**
 * Eigenständiger Node-HTTP-Mock-Server für WebUntis JSON-RPC.
 *
 * Bildet denselben Endpunkt-Pfad wie der echte Server nach (`/WebUntis/jsonrpc.do`), damit
 * die App unverändert dagegen laufen kann — einfach `VITE_WEBUNTIS_SERVER` auf diesen
 * Server zeigen lassen (siehe README.md).
 *
 * WICHTIG: Anders als der echte Server (siehe TESTING.md: kein Access-Control-Allow-
 * Credentials) sendet dieser Mock-Server volle CORS-Freigabe inkl. Credentials. Das ist
 * eine bewusste Erleichterung fürs lokale Entwickeln/Testen OHNE Proxy — sie sagt nichts
 * über das Verhalten des echten Servers aus. Der Produktions-Proxy bleibt trotzdem nötig.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { SESSION_COOKIE } from '../api/client';
import { createMockState, handleRpc, type MockServerState } from './rpcHandler';
import { mockExamsRest } from './examsRestMock';
import { mockAbsencesRest } from './absencesRestMock';
import { mockCalendarEntryDetail, parseIsoLocalDateTime } from './calendarEntryRestMock';
import type { MockElement } from './timetable';

const JSONRPC_PATH = '/WebUntis/jsonrpc.do';
/**
 * Undokumentierte REST-Endpunkte (siehe api/examsRest.ts, api/absencesRest.ts,
 * api/calendarEntryRest.ts) — kein Teil der 2018er-Doku.
 */
const EXAMS_REST_PATH = '/WebUntis/api/exams';
const ABSENCES_REST_PATH = '/WebUntis/api/classreg/absences/students';
const CALENDAR_ENTRY_DETAIL_PATH = '/WebUntis/api/rest/view/v2/calendar-entry/detail';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function readSessionCookie(req: IncomingMessage): string | undefined {
  const header = req.headers['cookie'];
  if (header === undefined) return undefined;
  const cookies = Array.isArray(header) ? header.join('; ') : header;
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers['origin'];
  if (typeof origin === 'string') res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Vary', 'Origin');
}

export function createMockHttpServer(state: MockServerState = createMockState()) {
  return createServer((req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '', 'http://mock.local');
    const path = url.pathname;

    if (req.method === 'GET' && path === EXAMS_REST_PATH) {
      handleDateRangeRest(state, req, url, res, EXAMS_REST_PATH, mockExamsRest, 'exams');
      return;
    }
    if (req.method === 'GET' && path === ABSENCES_REST_PATH) {
      handleDateRangeRest(state, req, url, res, ABSENCES_REST_PATH, mockAbsencesRest, 'absences');
      return;
    }
    if (req.method === 'GET' && path === CALENDAR_ENTRY_DETAIL_PATH) {
      handleCalendarEntryDetailRest(state, req, url, res);
      return;
    }

    if (req.method !== 'POST' || path !== JSONRPC_PATH) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Unbekannter Pfad: ${req.method} ${path}. Erwartet: POST ${JSONRPC_PATH}, GET ${EXAMS_REST_PATH}, GET ${ABSENCES_REST_PATH} oder GET ${CALENDAR_ENTRY_DETAIL_PATH}`,
        }),
      );
      return;
    }

    void (async () => {
      const raw = await readBody(req);
      let call: { id?: unknown; method?: unknown; params?: unknown };
      try {
        call = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }

      const id = typeof call.id === 'string' ? call.id : String(call.id ?? '');
      const method = typeof call.method === 'string' ? call.method : '';
      const sessionId = readSessionCookie(req);

      const outcome = handleRpc(state, sessionId, { id, method, params: call.params });

      // Session-Zustand gemäß Vertrag von handleRpc() persistieren (siehe rpcHandler.ts).
      //
      // Cookie-Path bewusst "/" statt "/WebUntis" (wie beim echten Server): der Browser
      // ruft über den Vite-Dev-Proxy "/webuntis/..." (klein) auf, der Proxy schreibt das
      // erst serverseitig auf "/WebUntis" um — der Browser selbst sieht nie den
      // umgeschriebenen Pfad. Ein Cookie mit Path=/WebUntis würde dort (Groß/Kleinschreibung,
      // Pfad-Matching ist case-sensitiv) nie zurückgeschickt, die Session ginge sofort
      // wieder verloren. Betraf nur den echten Browser über den Proxy — MSW-Tests liefen
      // trotzdem grün, weil FetchTransport dort selbst Cookies verwaltet statt sich auf
      // die Browser-Cookie-Jar zu verlassen. Gefunden beim manuellen Test in M5.
      if (outcome.session === null) {
        if (sessionId !== undefined) state.sessions.delete(sessionId);
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
      } else if (outcome.session !== undefined) {
        state.sessions.set(outcome.session.sessionId, outcome.session);
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${outcome.session.sessionId}; Path=/`);
      }

      const status = 200; // WebUntis signalisiert Fehler im Body, nicht per HTTP-Status (siehe TESTING.md)
      res.writeHead(status, { 'Content-Type': 'application/json-rpc;charset=UTF-8' });
      res.end(JSON.stringify(outcome.envelope));

      const kind = 'error' in outcome.envelope ? `FEHLER ${outcome.envelope.error.code}` : 'OK';
      // eslint-disable-next-line no-console -- Mock-Server-Log ist gewollt, kein Produktionscode.
      console.log(`  ${method.padEnd(28)} ${kind}`);
    })().catch((error: unknown) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    });
  });
}

/**
 * Simuliert einen der undokumentierten REST-Endpunkte (siehe api/examsRest.ts,
 * api/absencesRest.ts) — gleiches Muster für beide: `startDate`/`endDate` filtern, Ergebnis
 * unter `wrapKey` verpackt (`{"data":{[wrapKey]:[...]}}`). Das reale Fehlerverhalten bei
 * fehlender Session wurde nie gemessen — 401 ist eine plausible, aber nicht verifizierte
 * Annahme.
 */
function handleDateRangeRest<T>(
  state: MockServerState,
  req: IncomingMessage,
  url: URL,
  res: ServerResponse,
  pathLabel: string,
  fetchItems: (startDate: number, endDate: number) => readonly T[],
  wrapKey: string,
): void {
  const sessionId = readSessionCookie(req);
  if (sessionId === undefined || !state.sessions.has(sessionId)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not authenticated (Annahme, real nie gemessen)' }));
    return;
  }

  const startDate = Number(url.searchParams.get('startDate') ?? 0);
  const endDate = Number(url.searchParams.get('endDate') ?? 99999999);
  const items = fetchItems(startDate, endDate);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: { [wrapKey]: items } }));
  // eslint-disable-next-line no-console -- Mock-Server-Log ist gewollt, kein Produktionscode.
  console.log(`  GET ${pathLabel.padEnd(40)} OK — ${items.length} ${wrapKey}`);
}

/**
 * Simuliert den undokumentierten calendar-entry-detail-Endpunkt (siehe
 * api/calendarEntryRest.ts) — anderes Anfrage-/Antwortformat als die beiden Datumsbereich-
 * Endpunkte oben (ein einzelner Eintrag über exakte Start-/Endzeit statt einer Liste über
 * einen Zeitraum), deshalb ein eigener Handler statt `handleDateRangeRest`.
 */
function handleCalendarEntryDetailRest(state: MockServerState, req: IncomingMessage, url: URL, res: ServerResponse): void {
  const sessionId = readSessionCookie(req);
  if (sessionId === undefined || !state.sessions.has(sessionId)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not authenticated (Annahme, real nie gemessen)' }));
    return;
  }

  const elementId = Number(url.searchParams.get('elementId') ?? NaN);
  const elementType = Number(url.searchParams.get('elementType') ?? NaN) as MockElement['type'];
  const start = parseIsoLocalDateTime(url.searchParams.get('startDateTime') ?? '');
  const end = parseIsoLocalDateTime(url.searchParams.get('endDateTime') ?? '');

  const detail = mockCalendarEntryDetail({ id: elementId, type: elementType }, start.date, start.time, end.time);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ calendarEntries: detail === undefined ? [] : [detail] }));
  // eslint-disable-next-line no-console -- Mock-Server-Log ist gewollt, kein Produktionscode.
  console.log(`  GET ${CALENDAR_ENTRY_DETAIL_PATH.padEnd(40)} OK — ${detail === undefined ? 'kein Treffer' : 'Treffer'}`);
}

export { createMockState, type MockServerState } from './rpcHandler';
export { JSONRPC_PATH, EXAMS_REST_PATH, ABSENCES_REST_PATH, CALENDAR_ENTRY_DETAIL_PATH };
