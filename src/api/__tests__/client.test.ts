import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE, WebUntisClient, directEndpoint } from '../client';
import { WebUntisRpcError, WebUntisTransportError, isBadCredentials, isNotAuthenticated } from '../errors';
import { readCookie } from '../transport';
import { authenticate, logout } from '../methods';
import { StubTransport, fixtureText, makeClient } from './helpers';

describe('Request-Aufbau', () => {
  it('baut einen JSON-RPC-2.0-Umschlag wie in der Doku', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');

    await client.call('getRooms', {});

    const payload = transport.lastPayload();
    expect(payload.jsonrpc).toBe('2.0');
    expect(payload.method).toBe('getRooms');
    expect(payload.params).toEqual({});
    expect(payload.id).toBe('bwu-1');
  });

  it('haengt den Pflichtparameter ?school= an', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');

    await client.call('getRooms');

    expect(transport.requests[0]?.url).toBe(
      'https://example.webuntis.com/WebUntis/jsonrpc.do?school=testschule',
    );
  });

  it('kodiert Schulnamen mit Sonderzeichen', () => {
    const client = new WebUntisClient({
      endpoint: 'https://x.webuntis.com/WebUntis/jsonrpc.do',
      school: 'schule mit leer&zeichen',
      client: 'T',
    });
    expect(client.buildUrl()).toContain('school=schule%20mit%20leer%26zeichen');
  });

  it('setzt Content-Type wie in der Doku empfohlen', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');

    await client.call('getRooms');

    expect(transport.requests[0]?.headers['Content-Type']).toBe('application/json');
  });

  it('zaehlt Request-Ids hoch, damit Antworten zuordenbar bleiben', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":[]}');

    await client.call('getRooms');
    await client.call('getSubjects');

    expect(transport.payloadAt(0).id).toBe('bwu-1');
    expect(transport.payloadAt(1).id).toBe('bwu-2');
  });
});

describe('Session und Cookies', () => {
  it('schickt nach dem Login JSESSIONID mit', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('authenticate.json');
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":[]}');

    await authenticate(client, { user: 'test', password: 'geheim' });
    await client.call('getRooms');

    expect(transport.requests[1]?.headers['Cookie']).toContain(
      `${SESSION_COOKIE}=644AFBF2C1B592B68C6B04938BD26965`,
    );
  });

  it('schickt vor dem Login kein Session-Cookie', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('authenticate.json');

    await authenticate(client, { user: 'test', password: 'geheim' });

    expect(transport.requests[0]?.headers['Cookie']).toBeUndefined();
  });

  it('setzt im Browser keinen Cookie-Header — das ist ein Forbidden Header', async () => {
    const transport = new StubTransport({ canSetCookieHeader: false });
    const { client } = makeClient(transport);
    transport.queueFixture('authenticate.json');
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":[]}');

    await authenticate(client, { user: 'test', password: 'geheim' });
    await client.call('getRooms');

    expect(transport.requests[1]?.headers['Cookie']).toBeUndefined();
    // Die Session ist trotzdem bekannt — im Browser transportiert der Proxy das Cookie.
    expect(client.sessionId).toBe('644AFBF2C1B592B68C6B04938BD26965');
  });

  it('laesst das Vor-Login-Cookie des Servers die echte Session nicht ueberschreiben', async () => {
    const { client, transport } = makeClient();
    // Der echte Server setzt schon beim Login-Request ein JSESSIONID-Cookie,
    // das noch keine angemeldete Session ist (gemessen 2026-09-10).
    transport.queueFixture('authenticate.json', {
      setCookie: ['JSESSIONID=VORLOGIN123; Path=/WebUntis; Secure; HttpOnly; SameSite=None'],
    });
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":[]}');

    await authenticate(client, { user: 'test', password: 'geheim' });
    await client.call('getRooms');

    expect(client.sessionId).toBe('644AFBF2C1B592B68C6B04938BD26965');
    expect(transport.requests[1]?.headers['Cookie']).toContain('644AFBF2C1B592B68C6B04938BD26965');
    expect(transport.requests[1]?.headers['Cookie']).not.toContain('VORLOGIN123');
  });

  it('merkt sich schoolname und Tenant-Id aus Set-Cookie', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('authenticate.json', {
      setCookie: [
        'schoolname="_aHRsc3Rw"; Max-Age=1209600; Secure; SameSite=None',
        'Tenant-Id="7053500"; Max-Age=1209600; Secure; SameSite=None',
      ],
    });
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":[]}');

    await authenticate(client, { user: 'test', password: 'geheim' });
    await client.call('getRooms');

    const cookie = transport.requests[1]?.headers['Cookie'] ?? '';
    expect(cookie).toContain('schoolname="_aHRsc3Rw"');
    expect(cookie).toContain('Tenant-Id="7053500"');
  });

  it('kann eine Session wiederherstellen, ohne sich neu anzumelden', async () => {
    const { client, transport } = makeClient();
    client.setSession({ sessionId: 'WIEDERHERGESTELLT', personType: 5, personId: 42 });
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');

    await client.call('getRooms');

    expect(client.isAuthenticated).toBe(true);
    expect(transport.requests[0]?.headers['Cookie']).toContain('JSESSIONID=WIEDERHERGESTELLT');
  });

  it('verwirft die Session beim Logout — auch wenn der Server dabei scheitert', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('authenticate.json');
    await authenticate(client, { user: 'test', password: 'geheim' });
    expect(client.isAuthenticated).toBe(true);

    transport.queueFixture('error-not-authenticated.json');
    await expect(logout(client)).rejects.toThrow(WebUntisRpcError);

    expect(client.isAuthenticated).toBe(false);
    expect(client.sessionId).toBeUndefined();
  });
});

describe('Fehler-Mapping', () => {
  it('macht aus einem error-Objekt einen WebUntisRpcError', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('error-bad-credentials.json');

    const error = await client.call('authenticate').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebUntisRpcError);
    expect((error as WebUntisRpcError).code).toBe(-8504);
    expect((error as WebUntisRpcError).serverMessage).toBe('bad credentials');
    expect((error as WebUntisRpcError).method).toBe('authenticate');
    expect(isBadCredentials(error)).toBe(true);
  });

  it('erkennt eine abgelaufene Session', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('error-not-authenticated.json');

    const error = await client.call('getRooms').catch((e: unknown) => e);

    expect(isNotAuthenticated(error)).toBe(true);
  });

  it('meldet Fehler auch bei HTTP 200 — WebUntis signalisiert nur im Body', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: fixtureText('error-bad-credentials.json') });

    await expect(client.call('authenticate')).rejects.toBeInstanceOf(WebUntisRpcError);
  });

  it('macht aus HTTP-Fehlern einen TransportError', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 502, body: '<html>Bad Gateway</html>' });

    const error = await client.call('getRooms').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebUntisTransportError);
    expect((error as WebUntisTransportError).status).toBe(502);
  });

  it('macht aus kaputtem JSON einen TransportError statt eines Absturzes', async () => {
    const { client, transport } = makeClient();
    transport.queue('<html>Wartungsarbeiten</html>');

    await expect(client.call('getRooms')).rejects.toBeInstanceOf(WebUntisTransportError);
  });

  it('meldet Antworten ohne result und ohne error', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1"}');

    await expect(client.call('getRooms')).rejects.toBeInstanceOf(WebUntisTransportError);
  });

  it('verpackt Netzwerkfehler', async () => {
    const { client, transport } = makeClient();
    transport.failWith = new TypeError('fetch failed');

    const error = await client.call('getRooms').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebUntisTransportError);
    expect((error as WebUntisTransportError).status).toBeUndefined();
  });

  it('laesst ein leeres Array als gueltiges Ergebnis durch', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');

    await expect(client.call('getRooms')).resolves.toEqual([]);
  });
});

describe('Warteschlange', () => {
  it('serialisiert Aufrufe, statt den Server zu fluten', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":1}');
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":2}');
    transport.queue('{"jsonrpc":"2.0","id":"bwu-3","result":3}');

    const results = await Promise.all([
      client.call('getRooms'),
      client.call('getSubjects'),
      client.call('getTeachers'),
    ]);

    expect(results).toEqual([1, 2, 3]);
    expect(transport.requests.map((r) => JSON.parse(r.body).method)).toEqual([
      'getRooms',
      'getSubjects',
      'getTeachers',
    ]);
  });

  it('reisst nach einem Fehler nicht ab', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('error-not-authenticated.json');
    transport.queue('{"jsonrpc":"2.0","id":"bwu-2","result":"danach"}');

    await expect(client.call('getRooms')).rejects.toThrow();
    await expect(client.call('getSubjects')).resolves.toBe('danach');
  });
});

describe('getRest — undokumentierte REST-Endpunkte (siehe examsRest.ts)', () => {
  it('baut die URL aus der Basis ohne "/jsonrpc.do" plus Pfad und Query', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"data":{"exams":[]}}');

    await client.getRest('/api/exams', { startDate: 20260901, endDate: 20260930, studentId: 15436 });

    expect(transport.getRequests[0]?.url).toBe(
      'https://example.webuntis.com/WebUntis/api/exams?startDate=20260901&endDate=20260930&studentId=15436',
    );
  });

  it('schickt das Session-Cookie mit, wenn eine Session besteht', async () => {
    const { client, transport } = makeClient();
    client.setSession({ sessionId: 'ABC123', personType: 5, personId: 42 });
    transport.queue('{"data":{"exams":[]}}');

    await client.getRest('/api/exams', {});

    expect(transport.getRequests[0]?.headers['Cookie']).toContain('JSESSIONID=ABC123');
  });

  it('gibt die geparste JSON-Antwort ohne JSON-RPC-Umschlag zurueck', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"data":{"exams":[{"id":1}]}}');

    await expect(client.getRest('/api/exams', {})).resolves.toEqual({ data: { exams: [{ id: 1 }] } });
  });

  it('wirft einen TransportError bei HTTP-Fehlern', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 401, body: '' });

    const error = await client.getRest('/api/exams', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WebUntisTransportError);
    expect((error as WebUntisTransportError).status).toBe(401);
  });

  it('wirft einen TransportError bei kaputtem JSON statt abzustuerzen', async () => {
    const { client, transport } = makeClient();
    transport.queue('<html>Wartungsarbeiten</html>');

    await expect(client.getRest('/api/exams', {})).rejects.toBeInstanceOf(WebUntisTransportError);
  });

  it('teilt sich die Warteschlange mit call() — serialisiert auch gemischte Aufrufe', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":"rpc"}');
    transport.queue('{"data":{"exams":[]}}');

    const results = await Promise.all([client.call('getRooms'), client.getRest('/api/exams', {})]);

    expect(results).toEqual(['rpc', { data: { exams: [] } }]);
  });
});

describe('getRestRaw — Diagnose fuer noch unklare Endpunkte (siehe scripts/smoke-test.ts)', () => {
  it('wirft NICHT bei einem Nicht-2xx-Status, sondern gibt Status+Body zurueck', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 404, body: '<html>not found</html>' });

    await expect(client.getRestRaw('/api/rest/view/v2/calendar-entry/detail', {})).resolves.toEqual({
      status: 404,
      body: '<html>not found</html>',
    });
  });

  it('parst die Antwort NICHT als JSON — auch ein roher Nicht-JSON-Body kommt unveraendert an', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'eyJhbGciOiJIUzI1NiJ9.not-real-json' });

    await expect(client.getRestRaw('/api/token/new', {})).resolves.toEqual({
      status: 200,
      body: 'eyJhbGciOiJIUzI1NiJ9.not-real-json',
    });
  });

  it('setzt zusaetzliche Header (z. B. Authorization) neben dem Cookie', async () => {
    const { client, transport } = makeClient();
    client.setSession({ sessionId: 'ABC123', personType: 5, personId: 42 });
    transport.queue({ status: 200, body: '{}' });

    await client.getRestRaw('/api/rest/view/v2/calendar-entry/detail', {}, { Authorization: 'Bearer xyz' });

    const headers = transport.getRequests[0]?.headers;
    expect(headers?.['Authorization']).toBe('Bearer xyz');
    expect(headers?.['Cookie']).toContain('JSESSIONID=ABC123');
  });
});

describe('getRestBearer — neuere "api/rest/**"-Flaeche mit separatem Bearer-Token (siehe IDEEN.md B8)', () => {
  it('holt zuerst einen Token ueber /api/token/new und schickt ihn als Authorization mit', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'raw.jwt.token' }); // /api/token/new
    transport.queue({ status: 200, body: '{"calendarEntries":[]}' }); // eigentlicher Aufruf

    await client.getRestBearer('/api/rest/view/v2/calendar-entry/detail', { elementId: 1 });

    expect(transport.getRequests).toHaveLength(2);
    expect(transport.getRequests[0]?.url).toContain('/api/token/new');
    expect(transport.getRequests[1]?.url).toContain('/api/rest/view/v2/calendar-entry/detail');
    expect(transport.getRequests[1]?.headers['Authorization']).toBe('Bearer raw.jwt.token');
  });

  it('entfernt umschliessende Anfuehrungszeichen, falls der Token als JSON-String kommt', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: '"quoted.jwt.token"' });
    transport.queue({ status: 200, body: '{}' });

    await client.getRestBearer('/api/x', {});

    expect(transport.getRequests[1]?.headers['Authorization']).toBe('Bearer quoted.jwt.token');
  });

  it('cached den Token — ein zweiter Aufruf holt KEINEN neuen Token', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok1' });
    transport.queue({ status: 200, body: '{}' });
    transport.queue({ status: 200, body: '{}' });

    await client.getRestBearer('/api/x', {});
    await client.getRestBearer('/api/x', {});

    const tokenRequests = transport.getRequests.filter((r) => r.url.includes('/api/token/new'));
    expect(tokenRequests).toHaveLength(1);
  });

  it('holt bei HTTP 401 einmal einen neuen Token und wiederholt den Aufruf', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok-alt' }); // erster Token
    transport.queue({ status: 401, body: '' }); // erster Versuch schlaegt fehl (abgelaufen)
    transport.queue({ status: 200, body: 'tok-neu' }); // neuer Token
    transport.queue({ status: 200, body: '{"ok":true}' }); // Wiederholung klappt

    await expect(client.getRestBearer('/api/x', {})).resolves.toEqual({ ok: true });
    expect(transport.getRequests[3]?.headers['Authorization']).toBe('Bearer tok-neu');
  });

  it('gibt nach EINEM erfolglosen Retry auf, statt endlos zu versuchen', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok-alt' });
    transport.queue({ status: 401, body: '' });
    transport.queue({ status: 200, body: 'tok-neu' });
    transport.queue({ status: 401, body: '' });

    await expect(client.getRestBearer('/api/x', {})).rejects.toBeInstanceOf(WebUntisTransportError);
  });

  it('verwirft den gecachten Token bei setSession() — naechster Aufruf holt neu', async () => {
    const { client, transport } = makeClient();
    transport.queue({ status: 200, body: 'tok1' });
    transport.queue({ status: 200, body: '{}' });
    await client.getRestBearer('/api/x', {});

    client.setSession({ sessionId: 'NEU', personType: 5, personId: 1 });

    transport.queue({ status: 200, body: 'tok2' });
    transport.queue({ status: 200, body: '{}' });
    await client.getRestBearer('/api/x', {});

    const tokenRequests = transport.getRequests.filter((r) => r.url.includes('/api/token/new'));
    expect(tokenRequests).toHaveLength(2);
  });
});

describe('Hilfsfunktionen', () => {
  it('baut die direkte Endpunkt-URL', () => {
    expect(directEndpoint('htlstp.webuntis.com')).toBe('https://htlstp.webuntis.com/WebUntis/jsonrpc.do');
    expect(directEndpoint('https://htlstp.webuntis.com')).toBe('https://htlstp.webuntis.com/WebUntis/jsonrpc.do');
    expect(directEndpoint('https://htlstp.webuntis.com/')).toBe('https://htlstp.webuntis.com/WebUntis/jsonrpc.do');
  });

  it('liest Cookies aus echten Set-Cookie-Headern', () => {
    // Wortlaut wie am 2026-09-10 von htlstp.webuntis.com gemessen
    const headers = [
      'JSESSIONID=01E01FAB99974ADEB2576A87D0BFDC9C; Path=/WebUntis; Secure; HttpOnly; SameSite=None',
      'schoolname="_aHRsc3Rw"; Max-Age=1209600; Secure; SameSite=None',
    ];
    expect(readCookie(headers, 'JSESSIONID')).toBe('01E01FAB99974ADEB2576A87D0BFDC9C');
    expect(readCookie(headers, 'schoolname')).toBe('"_aHRsc3Rw"');
    expect(readCookie(headers, 'gibtesnicht')).toBeUndefined();
    expect(readCookie(undefined, 'JSESSIONID')).toBeUndefined();
  });
});
