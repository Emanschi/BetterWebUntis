import { describe, expect, it } from 'vitest';
import { WebUntisErrorCode, JsonRpcErrorCode } from '../../api/errors';
import { createMockState, handleRpc } from '../rpcHandler';

const RANGE_START = 20260907; // Montag
const RANGE_END = 20260911; // Freitag derselben Woche

function login(state: ReturnType<typeof createMockState>, user: string, password: string) {
  const outcome = handleRpc(state, undefined, { id: '1', method: 'authenticate', params: { user, password } });
  if (outcome.session !== undefined && outcome.session !== null) state.sessions.set(outcome.session.sessionId, outcome.session);
  return outcome;
}

describe('Session-Lebenszyklus', () => {
  it('lehnt unbekannte Zugangsdaten mit BAD_CREDENTIALS ab', () => {
    const state = createMockState();
    const outcome = login(state, 'niemand', 'falsch');
    expect('error' in outcome.envelope).toBe(true);
    if ('error' in outcome.envelope) expect(outcome.envelope.error.code).toBe(WebUntisErrorCode.BAD_CREDENTIALS);
  });

  it('meldet fehlende Session als NOT_AUTHENTICATED', () => {
    const state = createMockState();
    const outcome = handleRpc(state, undefined, { id: '1', method: 'getRooms', params: {} });
    expect('error' in outcome.envelope).toBe(true);
    if ('error' in outcome.envelope) expect(outcome.envelope.error.code).toBe(WebUntisErrorCode.NOT_AUTHENTICATED);
  });

  it('akzeptiert eine unbekannte sessionId nicht', () => {
    const state = createMockState();
    const outcome = handleRpc(state, 'ERFUNDENE-SESSION', { id: '1', method: 'getRooms', params: {} });
    expect('error' in outcome.envelope).toBe(true);
    if ('error' in outcome.envelope) expect(outcome.envelope.error.code).toBe(WebUntisErrorCode.NOT_AUTHENTICATED);
  });

  it('erlaubt Datenabruf nach erfolgreichem Login', () => {
    const state = createMockState();
    const login1 = login(state, 'mmuster', 'test1234');
    expect('result' in login1.envelope).toBe(true);
    const sessionId = login1.session?.sessionId;
    expect(sessionId).toBeDefined();

    const rooms = handleRpc(state, sessionId, { id: '2', method: 'getRooms', params: {} });
    expect('result' in rooms.envelope).toBe(true);
  });

  it('logout signalisiert das Beenden der Session', () => {
    const state = createMockState();
    const login1 = login(state, 'mmuster', 'test1234');
    const sessionId = login1.session!.sessionId;

    const out = handleRpc(state, sessionId, { id: '2', method: 'logout', params: {} });
    expect(out.session).toBeNull();
  });

  it('unbekannte Methoden liefern METHOD_NOT_FOUND', () => {
    const state = createMockState();
    const login1 = login(state, 'mmuster', 'test1234');
    const out = handleRpc(state, login1.session!.sessionId, { id: '2', method: 'gibtEsNicht', params: {} });
    expect('error' in out.envelope).toBe(true);
    if ('error' in out.envelope) expect(out.envelope.error.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND);
  });
});

describe('Rechte-Simulation (PLAN.md R4)', () => {
  it('Schueler-Konto hat kein Recht auf getStudents', () => {
    const state = createMockState();
    const login1 = login(state, 'mmuster', 'test1234');
    const out = handleRpc(state, login1.session!.sessionId, { id: '2', method: 'getStudents', params: {} });
    expect('error' in out.envelope).toBe(true);
    if ('error' in out.envelope) expect(out.envelope.error.code).toBe(WebUntisErrorCode.NO_RIGHT_FOR_METHOD);
  });

  it('Lehrer-Konto darf getStudents abrufen', () => {
    const state = createMockState();
    const login1 = login(state, 'aschmidt', 'test1234');
    const out = handleRpc(state, login1.session!.sessionId, { id: '2', method: 'getStudents', params: {} });
    expect('result' in out.envelope).toBe(true);
  });
});

describe('getTimetable — Randfaelle', () => {
  function timetableFor(user: string, password: string, id: number, type: number) {
    const state = createMockState();
    const login1 = login(state, user, password);
    const sessionId = login1.session!.sessionId;
    const out = handleRpc(state, sessionId, {
      id: '2',
      method: 'getTimetable',
      params: { options: { element: { id, type }, startDate: RANGE_START, endDate: RANGE_END, showSubstText: true, showInfo: true } },
    });
    if (!('result' in out.envelope)) throw new Error('erwartetes result fehlt');
    return out.envelope.result as Array<{ code?: string; lstype?: string; date: number; startTime: number; su?: Array<{id:number}>; te?: Array<{id:number}> }>;
  }

  it('enthaelt einen Entfall (code: cancelled)', () => {
    const periods = timetableFor('mmuster', 'test1234', 501, 5);
    expect(periods.some((p) => p.code === 'cancelled')).toBe(true);
  });

  it('enthaelt mindestens eine Vertretung und eine Raumaenderung (code: irregular)', () => {
    const periods = timetableFor('mmuster', 'test1234', 501, 5);
    const irregular = periods.filter((p) => p.code === 'irregular');
    expect(irregular.length).toBeGreaterThanOrEqual(2);
  });

  it('enthaelt eine Pruefung (lstype: ex)', () => {
    const periods = timetableFor('mmuster', 'test1234', 501, 5);
    expect(periods.some((p) => p.lstype === 'ex')).toBe(true);
  });

  it('enthaelt eine Doppelstunde (zwei direkt aufeinanderfolgende Perioden, gleiches Fach/Lehrer)', () => {
    const periods = timetableFor('mmuster', 'test1234', 501, 5);
    const byDate = new Map<number, typeof periods>();
    for (const p of periods) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
    let found = false;
    for (const dayPeriods of byDate.values()) {
      const sorted = [...dayPeriods].sort((a, b) => a.startTime - b.startTime);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i]?.su?.[0]?.id === sorted[i + 1]?.su?.[0]?.id && sorted[i]?.te?.[0]?.id === sorted[i + 1]?.te?.[0]?.id) {
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('Lehrer-Ansicht enthaelt eine Sprechstunde (lstype: oh) ohne Klassenbezug', () => {
    const periods = timetableFor('aschmidt', 'test1234', 11, 2);
    const officeHour = periods.find((p) => p.lstype === 'oh');
    expect(officeHour).toBeDefined();
  });
});

describe('getSubstitutions', () => {
  it('liefert Eintraege vom Typ cancel, subst und rmchg', () => {
    const state = createMockState();
    const login1 = login(state, 'mmuster', 'test1234');
    const out = handleRpc(state, login1.session!.sessionId, {
      id: '2',
      method: 'getSubstitutions',
      params: { startDate: RANGE_START, endDate: RANGE_END, departmentId: 0 },
    });
    if (!('result' in out.envelope)) throw new Error('erwartetes result fehlt');
    const types = new Set((out.envelope.result as Array<{ type: string }>).map((s) => s.type));
    expect(types.has('cancel')).toBe(true);
    expect(types.has('subst')).toBe(true);
    expect(types.has('rmchg')).toBe(true);
  });
});
