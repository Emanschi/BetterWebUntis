import { describe, expect, it } from 'vitest';
import { createSessionStore, type StoredSchool } from '../sessionStore';
import { WebUntisClient } from '../../api/client';
import { FetchTransport } from '../../api/transport';
import { setupMockWebUntisServer } from '../../mock/msw/testServer';

setupMockWebUntisServer();

const TEST_SCHOOL: StoredSchool = { server: 'mock.local', loginName: 'mockschule', displayName: 'Mock-HTL' };

function buildTestClient(school: StoredSchool): WebUntisClient {
  return new WebUntisClient({
    endpoint: 'https://mock.local/WebUntis/jsonrpc.do',
    school: school.loginName,
    client: 'BetterWebUntis-Test',
    transport: new FetchTransport({ canSetCookieHeader: true }),
    minRequestGapMs: 0,
  });
}

describe('sessionStore', () => {
  it('startet im Zustand idle, ohne Client', () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.client).toBeNull();
  });

  it('meldet erfolgreich an und merkt sich personType/personId', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234');

    const state = useStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.personType).toBe(5);
    expect(state.personId).toBe(501);
    expect(state.client).not.toBeNull();
    expect(state.errorMessage).toBeUndefined();
  });

  it('setzt status auf error bei falschen Zugangsdaten, ohne zu werfen', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'falsches-passwort');

    const state = useStore.getState();
    expect(state.status).toBe('error');
    expect(state.client).toBeNull();
    expect(state.errorMessage).toBe('Benutzername oder Passwort ist falsch.');
  });

  it('logout setzt den Zustand zurueck', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234');
    expect(useStore.getState().status).toBe('authenticated');

    await useStore.getState().logout();

    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.client).toBeNull();
    expect(state.personId).toBeUndefined();
  });

  it('ein zweiter Login-Versuch nach einem Fehler kann trotzdem gelingen', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'falsch');
    expect(useStore.getState().status).toBe('error');

    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234');
    expect(useStore.getState().status).toBe('authenticated');
  });
});
