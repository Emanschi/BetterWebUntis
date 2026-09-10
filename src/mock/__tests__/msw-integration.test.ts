/**
 * Verifiziert, dass der echte API-Layer aus M2 (WebUntisClient + api/methods) unverändert
 * gegen den Mock-Server spricht — die Verbindungsstelle zwischen M2 und M3.
 *
 * Läuft über MSW, das echten `fetch` abfängt: es wird also derselbe Code-Pfad
 * durchlaufen wie im Dev-Server (FetchTransport → Cookie-Handling → JSON-RPC-Envelope),
 * nur ohne echten Netzwerk-Port.
 */
import { describe, expect, it } from 'vitest';
import { WebUntisClient } from '../../api/client';
import { FetchTransport } from '../../api/transport';
import { isMissingRight, isNotAuthenticated } from '../../api/errors';
import * as api from '../../api/methods';
import { setupMockWebUntisServer } from '../msw/testServer';

setupMockWebUntisServer();

const RANGE_START = 20260907; // Montag
const RANGE_END = 20260918; // zwei Wochen

function newClient(): WebUntisClient {
  return new WebUntisClient({
    endpoint: 'https://mock.local/WebUntis/jsonrpc.do',
    school: 'mockschule',
    client: 'BetterWebUntis-Test',
    transport: new FetchTransport({ canSetCookieHeader: true }),
    minRequestGapMs: 0,
  });
}

describe('WebUntisClient gegen den Mock-Server (echter fetch, echtes Cookie-Handling)', () => {
  it('meldet einen Schueler an und erhaelt eine Session', async () => {
    const client = newClient();
    const session = await api.authenticate(client, { user: 'mmuster', password: 'test1234' });
    expect(session.personType).toBe(5);
    expect(session.personId).toBe(501);
    expect(client.isAuthenticated).toBe(true);
  });

  it('lehnt falsche Zugangsdaten ab', async () => {
    const client = newClient();
    await expect(api.authenticate(client, { user: 'mmuster', password: 'falsch' })).rejects.toThrow();
  });

  it('liefert den Stundenplan mit allen geforderten Randfaellen', async () => {
    const client = newClient();
    const session = await api.authenticate(client, { user: 'mmuster', password: 'test1234' });

    const periods = await api.getTimetableCustom(client, {
      element: { id: session.personId, type: session.personType },
      startDate: RANGE_START,
      endDate: RANGE_END,
      showInfo: true,
      showSubstText: true,
      subjectFields: ['id', 'name'],
      teacherFields: ['id', 'name'],
      roomFields: ['id', 'name'],
    });

    expect(periods.some((p) => p.code === 'cancelled')).toBe(true); // Entfall
    expect(periods.filter((p) => p.code === 'irregular').length).toBeGreaterThanOrEqual(2); // Vertretung + Raumaenderung
    expect(periods.some((p) => p.lstype === 'ex')).toBe(true); // Pruefung
    expect(periods.some((p) => p.su?.[0]?.name !== undefined)).toBe(true); // *Fields wurden honoriert

    await api.logout(client);
  });

  it('degradiert sauber bei fehlenden Rechten statt abzustuerzen', async () => {
    const client = newClient();
    await api.authenticate(client, { user: 'mmuster', password: 'test1234' });

    const error = await api.getStudents(client).catch((e: unknown) => e);
    expect(isMissingRight(error)).toBe(true);
  });

  it('Vertretungen ueber getSubstitutions passen zu den Randfaellen im Stundenplan', async () => {
    const client = newClient();
    await api.authenticate(client, { user: 'mmuster', password: 'test1234' });

    const subs = await api.getSubstitutions(client, { startDate: RANGE_START, endDate: RANGE_END, departmentId: 0 });
    expect(subs.map((s) => s.type)).toEqual(expect.arrayContaining(['cancel', 'subst', 'rmchg']));
  });

  it('Pruefungsexport-Kette: getExamTypes -> getExams liefert Ergebnisse', async () => {
    const client = newClient();
    await api.authenticate(client, { user: 'mmuster', password: 'test1234' });

    const examTypes = await api.getExamTypes(client);
    expect(examTypes.length).toBeGreaterThan(0);

    const exams = await api.getExams(client, {
      examTypeId: examTypes[0]!.id as number,
      startDate: RANGE_START,
      endDate: RANGE_END,
    });
    expect(exams.length).toBeGreaterThan(0);
  });

  it('logout beendet die Session serverseitig, nicht nur lokal', async () => {
    const client = newClient();
    await api.authenticate(client, { user: 'mmuster', password: 'test1234' });
    await api.logout(client);

    // Ein zweiter Client mit derselben (jetzt ungueltigen) sessionId darf nicht mehr rein.
    const zombie = newClient();
    zombie.setSession({ sessionId: client.sessionId ?? 'invalid', personType: 5, personId: 501 });
    const error = await api.getRooms(zombie).catch((e: unknown) => e);
    expect(isNotAuthenticated(error)).toBe(true);
  });
});
