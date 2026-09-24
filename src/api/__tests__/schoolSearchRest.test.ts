import { describe, expect, it } from 'vitest';
import { searchSchools } from '../schoolSearchRest';
import { WebUntisTransportError } from '../errors';
import { StubTransport } from './helpers';

// Ausschnitt der echten Antwort, gemessen 2026-09-24 gegen mobile.webuntis.com/ms/schoolquery2
// (Suche nach "pölten", siehe TESTING.md) — auf zwei Schulen gekürzt, "size" bewusst auf 0
// belassen (genau der gemessene, unzuverlässige Wert trotz mehrerer echter Treffer).
const REAL_RESPONSE_EXCERPT = JSON.stringify({
  result: {
    size: 0,
    schools: [
      {
        server: 'htlstp.webuntis.com',
        useMobileServiceUrlAndroid: false,
        address: '3101, St. Pölten, Waldstraße 3',
        displayName: 'HTBLUVA St.Pölten',
        loginName: 'htlstp',
        schoolId: 7053500,
        useMobileServiceUrlIos: false,
        serverUrl: 'https://htlstp.webuntis.com/WebUntis/?school=htlstp',
        tenantId: '7053500',
        mobileServiceUrl: null,
      },
      {
        server: 'lbsstpoelten.webuntis.com',
        useMobileServiceUrlAndroid: false,
        address: '3100, St. Pölten, Hötzendorfstraße 8',
        displayName: 'LBS St.Pölten',
        loginName: 'lbsstpoelten',
        schoolId: 8221400,
        useMobileServiceUrlIos: false,
        serverUrl: 'https://lbsstpoelten.webuntis.com/WebUntis/?school=lbsstpoelten',
        tenantId: '8221400',
        mobileServiceUrl: null,
      },
    ],
  },
  id: '1',
  jsonrpc: '2.0',
});

describe('searchSchools', () => {
  it('sucht ohne Netzwerkaufruf bei einem zu kurzen Suchbegriff', async () => {
    const transport = new StubTransport();
    expect(await searchSchools('h', { transport })).toEqual([]);
    expect(await searchSchools('', { transport })).toEqual([]);
    expect(await searchSchools('   ', { transport })).toEqual([]);
    expect(transport.requests).toHaveLength(0);
  });

  it('parst eine echte gemessene Antwort korrekt, ignoriert das unzuverlässige "size"-Feld', async () => {
    // Gemessen 2026-09-24: "size" war 0, obwohl "schools" echte Treffer enthielt (TESTING.md) —
    // die tatsächliche Trefferzahl muss aus der Array-Länge kommen, nicht aus "size".
    const transport = new StubTransport().queue({ status: 200, body: REAL_RESPONSE_EXCERPT });

    const results = await searchSchools('pölten', { transport });

    expect(results).toEqual([
      { server: 'htlstp.webuntis.com', loginName: 'htlstp', displayName: 'HTBLUVA St.Pölten', address: '3101, St. Pölten, Waldstraße 3' },
      { server: 'lbsstpoelten.webuntis.com', loginName: 'lbsstpoelten', displayName: 'LBS St.Pölten', address: '3100, St. Pölten, Hötzendorfstraße 8' },
    ]);
  });

  it('schickt die Suche als JSON-RPC-POST an "<proxyBase>/schoolsearch"', async () => {
    const transport = new StubTransport().queue({ status: 200, body: '{"result":{"size":0,"schools":[]}}' });

    await searchSchools('htlstp', { transport, proxyBase: '/WebUntis' });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toBe('/WebUntis/schoolsearch');
    const payload = transport.lastPayload();
    expect(payload.method).toBe('searchSchool');
    expect(payload.params).toEqual([{ search: 'htlstp' }]);
  });

  it('trimmt einen abschließenden Schrägstrich im proxyBase', async () => {
    const transport = new StubTransport().queue({ status: 200, body: '{"result":{"size":0,"schools":[]}}' });
    await searchSchools('htlstp', { transport, proxyBase: '/WebUntis/' });
    expect(transport.requests[0]?.url).toBe('/WebUntis/schoolsearch');
  });

  it('lässt unvollständige Einträge weg, statt mit fehlenden Feldern durchzureichen', async () => {
    const transport = new StubTransport().queue({
      status: 200,
      body: JSON.stringify({
        result: {
          schools: [
            { server: 'ok.webuntis.com', loginName: 'ok', displayName: 'OK-Schule', address: 'Irgendwo 1' },
            { server: 'ohne-loginname.webuntis.com', displayName: 'Kaputt', address: 'Nirgendwo 2' },
            { loginName: 'ohne-server', displayName: 'Auch kaputt', address: 'Nirgendwo 3' },
          ],
        },
      }),
    });

    const results = await searchSchools('schule', { transport });

    expect(results).toEqual([{ server: 'ok.webuntis.com', loginName: 'ok', displayName: 'OK-Schule', address: 'Irgendwo 1' }]);
  });

  it('wirft WebUntisTransportError bei einem Nicht-2xx-Status', async () => {
    const transport = new StubTransport().queue({ status: 502, body: 'Bad Gateway' });
    await expect(searchSchools('htlstp', { transport })).rejects.toBeInstanceOf(WebUntisTransportError);
  });

  it('wirft WebUntisTransportError bei ungültigem JSON', async () => {
    const transport = new StubTransport().queue({ status: 200, body: 'das ist kein JSON' });
    await expect(searchSchools('htlstp', { transport })).rejects.toBeInstanceOf(WebUntisTransportError);
  });
});
