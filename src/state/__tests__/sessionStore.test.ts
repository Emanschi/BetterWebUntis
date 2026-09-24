// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
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

// Jeder Store liest beim Erzeugen aus localStorage (siehe sessionStore.ts, "Angemeldet
// bleiben") -- ohne Reset wuerde ein `remember: true` aus einem Test in den naechsten
// durchsickern.
beforeEach(() => {
  localStorage.clear();
});

describe('sessionStore', () => {
  it('startet im Zustand idle, ohne Client', () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.client).toBeNull();
  });

  it('meldet erfolgreich an und merkt sich personType/personId', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', false);

    const state = useStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.personType).toBe(5);
    expect(state.personId).toBe(501);
    expect(state.client).not.toBeNull();
    expect(state.errorMessage).toBeUndefined();
  });

  it('setzt status auf error bei falschen Zugangsdaten, ohne zu werfen', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'falsches-passwort', false);

    const state = useStore.getState();
    expect(state.status).toBe('error');
    expect(state.client).toBeNull();
    expect(state.errorMessage).toBe('Benutzername oder Passwort ist falsch.');
  });

  it('logout setzt den Zustand zurueck', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', false);
    expect(useStore.getState().status).toBe('authenticated');

    await useStore.getState().logout();

    const state = useStore.getState();
    expect(state.status).toBe('idle');
    expect(state.client).toBeNull();
    expect(state.personId).toBeUndefined();
  });

  it('ein zweiter Login-Versuch nach einem Fehler kann trotzdem gelingen', async () => {
    const useStore = createSessionStore({ buildClient: buildTestClient });
    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'falsch', false);
    expect(useStore.getState().status).toBe('error');

    await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', false);
    expect(useStore.getState().status).toBe('authenticated');
  });

  describe('"Angemeldet bleiben" (remember)', () => {
    it('merkt die Identitaet NICHT, wenn remember=false', async () => {
      const useStore = createSessionStore({ buildClient: buildTestClient });
      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', false);

      expect(localStorage.getItem('bwu-remembered-session')).toBeNull();

      // Ein neu erzeugter Store (z. B. naechster Seitenaufruf) startet dadurch wieder idle.
      const freshStore = createSessionStore({ buildClient: buildTestClient });
      expect(freshStore.getState().status).toBe('idle');
    });

    it('merkt die Identitaet bei remember=true — ein neuer Store startet direkt authenticated', async () => {
      const useStore = createSessionStore({ buildClient: buildTestClient });
      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', true);

      expect(localStorage.getItem('bwu-remembered-session')).not.toBeNull();

      const freshStore = createSessionStore({ buildClient: buildTestClient });
      const state = freshStore.getState();
      expect(state.status).toBe('authenticated');
      expect(state.personId).toBe(501);
      expect(state.personType).toBe(5);
      expect(state.username).toBe('mmuster');
      expect(state.client).not.toBeNull();
    });

    it('nie Passwort oder Session-ID in localStorage, nur Identitaetsfelder', async () => {
      const useStore = createSessionStore({ buildClient: buildTestClient });
      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', true);

      const raw = localStorage.getItem('bwu-remembered-session');
      expect(raw).not.toBeNull();
      const parsed: unknown = JSON.parse(raw ?? '{}');
      expect(parsed).toEqual({ username: 'mmuster', personType: 5, personId: 501 });
    });

    it('logout vergisst eine zuvor gemerkte Identitaet wieder', async () => {
      const useStore = createSessionStore({ buildClient: buildTestClient });
      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', true);
      expect(localStorage.getItem('bwu-remembered-session')).not.toBeNull();

      await useStore.getState().logout();

      expect(localStorage.getItem('bwu-remembered-session')).toBeNull();
      const freshStore = createSessionStore({ buildClient: buildTestClient });
      expect(freshStore.getState().status).toBe('idle');
    });

    it('ein erneuter Login ohne Haekchen vergisst eine vorher gemerkte Identitaet', async () => {
      const useStore = createSessionStore({ buildClient: buildTestClient });
      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', true);
      expect(localStorage.getItem('bwu-remembered-session')).not.toBeNull();

      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', false);

      expect(localStorage.getItem('bwu-remembered-session')).toBeNull();
    });

    it('sessionExpired() verwirft eine gemerkte Identitaet und zeigt eine Fehlermeldung', async () => {
      const useStore = createSessionStore({ buildClient: buildTestClient });
      await useStore.getState().login(TEST_SCHOOL, 'mmuster', 'test1234', true);

      useStore.getState().sessionExpired();

      const state = useStore.getState();
      expect(state.status).toBe('error');
      expect(state.client).toBeNull();
      expect(state.errorMessage).toBe('Die Sitzung ist abgelaufen. Bitte melde dich erneut an.');
      expect(localStorage.getItem('bwu-remembered-session')).toBeNull();
    });
  });
});
