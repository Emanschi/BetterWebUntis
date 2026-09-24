import { describe, expect, it } from 'vitest';
import { getCalendarEntryDetailRest, hasRestText } from '../calendarEntryRest';
import { PersonType } from '../types';
import { makeClient } from './helpers';

describe('hasRestText', () => {
  it('true für einen nicht-leeren String', () => {
    expect(hasRestText('Diskussionsthemen sammeln')).toBe(true);
  });

  it('false für undefined (Feld fehlt)', () => {
    expect(hasRestText(undefined)).toBe(false);
  });

  it('false für null — Bug vom 2026-09-24: der Server sendet das bei einem Treffer ohne Lehrstoff, nicht nur ein fehlendes Feld', () => {
    expect(hasRestText(null)).toBe(false);
  });

  it('false für einen leeren String', () => {
    expect(hasRestText('')).toBe(false);
  });
});

describe('getCalendarEntryDetailRest', () => {
  it('holt zuerst einen Bearer-Token, dann den eigentlichen Endpunkt (siehe getRestBearer)', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'mock-token' }); // /api/token/new
    transport.queue({ status: 200, body: '{"calendarEntries":[]}' });

    await getCalendarEntryDetailRest(client, {
      elementId: 15436,
      elementType: PersonType.STUDENT,
      startDateTime: '2026-09-18T11:20:00',
      endDateTime: '2026-09-18T12:10:00',
    });

    expect(transport.getRequests).toHaveLength(2);
    expect(transport.getRequests[1]?.url).toContain('/api/rest/view/v2/calendar-entry/detail');
    expect(transport.getRequests[1]?.headers['Authorization']).toBe('Bearer mock-token');
  });

  it('liefert undefined, wenn calendarEntries leer ist (kein Treffer)', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok' });
    transport.queue({ status: 200, body: '{"calendarEntries":[]}' });

    await expect(
      getCalendarEntryDetailRest(client, {
        elementId: 1,
        elementType: PersonType.STUDENT,
        startDateTime: 'x',
        endDateTime: 'y',
      }),
    ).resolves.toBeUndefined();
  });

  it('gibt teachingContent:null unverändert durch — Normalisierung ist Sache der Aufruferin (hasRestText)', async () => {
    // Bug, gemeldet 2026-09-24: eine Periode OHNE Lehrstoff bekam trotzdem das "L"-Badge, die
    // Detailansicht zeigte eine leere "LEHRSTOFF"-Zeile. Ursache: der Server sendet bei einem
    // Treffer ohne Lehrstoff explizit `null`, nicht ein fehlendes Feld — diese Funktion reicht
    // das absichtlich unverändert durch (kein "war das ein Treffer?"-Rätsel für die Aufruferin),
    // die Normalisierung ("gilt das als vorhanden?") übernimmt bewusst `hasRestText()`.
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok' });
    transport.queue({ status: 200, body: '{"calendarEntries":[{"id":9059380,"teachingContent":null}]}' });

    const result = await getCalendarEntryDetailRest(client, {
      elementId: 1,
      elementType: PersonType.STUDENT,
      startDateTime: 'x',
      endDateTime: 'y',
    });

    expect(result).toEqual({ id: 9059380, teachingContent: null });
    expect(hasRestText(result?.teachingContent)).toBe(false);
  });

  it('gibt einen echten teachingContent-String unverändert durch', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok' });
    transport.queue({ status: 200, body: '{"calendarEntries":[{"id":1,"teachingContent":"Einführung"}]}' });

    const result = await getCalendarEntryDetailRest(client, {
      elementId: 1,
      elementType: PersonType.STUDENT,
      startDateTime: 'x',
      endDateTime: 'y',
    });

    expect(result?.teachingContent).toBe('Einführung');
    expect(hasRestText(result?.teachingContent)).toBe(true);
  });
});
