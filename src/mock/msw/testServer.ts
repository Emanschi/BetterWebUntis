/**
 * Fertig verdrahteter MSW-Node-Server für Vitest — spart in jeder Testdatei das
 * setupServer/listen/resetHandlers/close-Boilerplate.
 *
 * Verwendung:
 *
 *   const mock = setupMockWebUntisServer();
 *   // mock.state gibt Zugriff auf laufende Sessions, falls ein Test das braucht
 */

import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { createMockState, type MockServerState } from '../rpcHandler';
import { createMswHandlers } from './handlers';

export function setupMockWebUntisServer(): { state: MockServerState } {
  const state = createMockState();
  const server = setupServer(...createMswHandlers(state));

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    state.sessions.clear();
  });
  afterAll(() => server.close());

  return { state };
}
