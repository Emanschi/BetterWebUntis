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

const JSONRPC_PATH = '/WebUntis/jsonrpc.do';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'POST' || path !== JSONRPC_PATH) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unbekannter Pfad: ${req.method} ${path}. Erwartet: POST ${JSONRPC_PATH}` }));
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
      if (outcome.session === null) {
        if (sessionId !== undefined) state.sessions.delete(sessionId);
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/WebUntis; Max-Age=0`);
      } else if (outcome.session !== undefined) {
        state.sessions.set(outcome.session.sessionId, outcome.session);
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${outcome.session.sessionId}; Path=/WebUntis`);
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

export { createMockState, type MockServerState } from './rpcHandler';
export { JSONRPC_PATH };
