import { describe, expect, it } from 'vitest';
import {
  JsonRpcErrorCode,
  WebUntisErrorCode,
  WebUntisRpcError,
  WebUntisTransportError,
  describeError,
  isBadCredentials,
  isMethodNotFound,
  isMissingRight,
  isNotAuthenticated,
} from '../errors';
import { fixtureJson } from './helpers';

interface ErrorEnvelope {
  error: { code: number; message: string };
}

describe('verifizierte Fehlercodes', () => {
  it('entspricht dem, was htlstp.webuntis.com am 2026-09-10 geliefert hat', () => {
    const badCredentials = fixtureJson<ErrorEnvelope>('error-bad-credentials.json');
    expect(badCredentials.error.code).toBe(WebUntisErrorCode.BAD_CREDENTIALS);
    expect(badCredentials.error.message).toBe('bad credentials');

    const notAuthenticated = fixtureJson<ErrorEnvelope>('error-not-authenticated.json');
    expect(notAuthenticated.error.code).toBe(WebUntisErrorCode.NOT_AUTHENTICATED);
    expect(notAuthenticated.error.message).toBe('not authenticated');
  });
});

describe('WebUntisRpcError', () => {
  it('behaelt Code, Servermeldung, Methode und Request-Id', () => {
    const error = new WebUntisRpcError(
      { code: -8504, message: 'bad credentials' },
      'authenticate',
      'bwu-1',
    );

    expect(error.code).toBe(-8504);
    expect(error.serverMessage).toBe('bad credentials');
    expect(error.method).toBe('authenticate');
    expect(error.requestId).toBe('bwu-1');
    expect(error.name).toBe('WebUntisRpcError');
    expect(error).toBeInstanceOf(Error);
  });

  it('nennt Methode und Code in der Message', () => {
    const error = new WebUntisRpcError({ code: -8504, message: 'bad credentials' }, 'authenticate', 'bwu-1');
    expect(error.message).toContain('authenticate');
    expect(error.message).toContain('-8504');
  });
});

describe('Praedikate', () => {
  const rpc = (code: number) => new WebUntisRpcError({ code, message: 'x' }, 'm', 'bwu-1');

  it('unterscheidet die Fehlerarten', () => {
    expect(isBadCredentials(rpc(WebUntisErrorCode.BAD_CREDENTIALS))).toBe(true);
    expect(isNotAuthenticated(rpc(WebUntisErrorCode.NOT_AUTHENTICATED))).toBe(true);
    expect(isMissingRight(rpc(WebUntisErrorCode.NO_RIGHT_FOR_METHOD))).toBe(true);
    expect(isMethodNotFound(rpc(JsonRpcErrorCode.METHOD_NOT_FOUND))).toBe(true);
  });

  it('verwechselt sie nicht', () => {
    expect(isBadCredentials(rpc(WebUntisErrorCode.NOT_AUTHENTICATED))).toBe(false);
    expect(isNotAuthenticated(rpc(WebUntisErrorCode.BAD_CREDENTIALS))).toBe(false);
  });

  it('sagt bei fremden Fehlern nein, statt zu raten', () => {
    expect(isBadCredentials(new Error('irgendwas'))).toBe(false);
    expect(isNotAuthenticated(null)).toBe(false);
    expect(isMissingRight(undefined)).toBe(false);
    expect(isMethodNotFound('string')).toBe(false);
  });
});

describe('describeError', () => {
  it('uebersetzt bekannte Codes ins Deutsche', () => {
    const message = describeError(
      new WebUntisRpcError({ code: WebUntisErrorCode.BAD_CREDENTIALS, message: 'bad credentials' }, 'authenticate', '1'),
    );
    expect(message).toBe('Benutzername oder Passwort ist falsch.');
  });

  it('weist bei fehlenden Rechten darauf hin — PLAN.md R4', () => {
    const message = describeError(
      new WebUntisRpcError({ code: WebUntisErrorCode.NO_RIGHT_FOR_METHOD, message: 'no right' }, 'getSubstitutions', '1'),
    );
    expect(message).toContain('Rechte');
  });

  it('verschluckt unbekannte Codes nicht, sondern reicht die Servermeldung durch', () => {
    const message = describeError(
      new WebUntisRpcError({ code: -9999, message: 'something new' }, 'getRooms', '1'),
    );
    expect(message).toContain('something new');
    expect(message).toContain('-9999');
  });

  it('unterscheidet Netzwerk- von HTTP-Fehlern', () => {
    expect(describeError(new WebUntisTransportError('x', 'getRooms'))).toContain('nicht erreichbar');
    expect(describeError(new WebUntisTransportError('x', 'getRooms', { status: 502 }))).toContain('502');
  });

  it('kommt auch mit gewoehnlichen Fehlern und Nicht-Fehlern zurecht', () => {
    expect(describeError(new Error('kaputt'))).toBe('kaputt');
    expect(describeError('nur ein String')).toBe('nur ein String');
  });
});

describe('WebUntisTransportError', () => {
  it('behaelt Status, Body und Ursache', () => {
    const cause = new TypeError('fetch failed');
    const error = new WebUntisTransportError('HTTP 502', 'getRooms', {
      status: 502,
      body: '<html/>',
      cause,
    });

    expect(error.status).toBe(502);
    expect(error.body).toBe('<html/>');
    expect(error.cause).toBe(cause);
    expect(error.method).toBe('getRooms');
  });
});
