/**
 * Fehlerbehandlung für die WebUntis JSON-RPC API.
 *
 * WICHTIG zur Herkunft der Codes: Die Doku vom 20.09.2018 enthält **keine** Liste von
 * Fehlercodes. Deshalb ist unten genau markiert, was verifiziert ist und was nicht.
 * Der Code muss mit unbekannten Codes umgehen können — er verlässt sich nirgends
 * darauf, dass die Liste vollständig ist.
 */

/** Standard-Fehlercodes aus der JSON-RPC-2.0-Spezifikation (jsonrpc.org). */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * WebUntis-spezifische Fehlercodes.
 *
 * VERIFIZIERT — am 2026-09-10 direkt gegen htlstp.webuntis.com gemessen (siehe TESTING.md):
 *   BAD_CREDENTIALS   -8504  "bad credentials"
 *   NOT_AUTHENTICATED -8520  "not authenticated"
 *
 * NICHT VERIFIZIERT — in der Praxis verbreitet, aber weder dokumentiert noch von uns
 * beobachtet. Nur für bessere Fehlermeldungen verwendet; die Logik funktioniert auch,
 * wenn ein Server abweichende Codes liefert. Beim Smoke-Test gegen den echten Server
 * gegenprüfen und diese Liste korrigieren.
 */
export const WebUntisErrorCode = {
  /** verifiziert */
  BAD_CREDENTIALS: -8504,
  /** verifiziert */
  NOT_AUTHENTICATED: -8520,
  /** nicht verifiziert */
  INVALID_SCHOOLNAME: -8500,
  /** nicht verifiziert */
  NO_RIGHT_FOR_METHOD: -8509,
  /** nicht verifiziert */
  INVALID_ELEMENT_OR_RANGE: -7004,
} as const;

/** Rohes error-Objekt aus einer JSON-RPC-Antwort. */
export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Der Server hat sauber geantwortet, die Antwort enthielt aber ein `error`-Objekt.
 * HTTP-Status ist dabei typischerweise 200 — WebUntis signalisiert Fehler nur im Body.
 */
export class WebUntisRpcError extends Error {
  readonly code: number;
  /** Unveränderte Meldung des Servers. */
  readonly serverMessage: string;
  readonly data: unknown;
  readonly method: string;
  readonly requestId: string;

  constructor(payload: JsonRpcErrorPayload, method: string, requestId: string) {
    super(`WebUntis-Fehler bei "${method}": ${payload.message} (Code ${payload.code})`);
    this.name = 'WebUntisRpcError';
    this.code = payload.code;
    this.serverMessage = payload.message;
    this.data = payload.data;
    this.method = method;
    this.requestId = requestId;
  }
}

/** Netzwerk-, HTTP- oder Parsing-Fehler — die Antwort war gar keine gültige JSON-RPC-Antwort. */
export class WebUntisTransportError extends Error {
  readonly status: number | undefined;
  readonly method: string;
  readonly body: string | undefined;

  constructor(
    message: string,
    method: string,
    options: { status?: number; body?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'WebUntisTransportError';
    this.status = options.status;
    this.method = method;
    this.body = options.body;
  }
}

/** Es wurde eine Methode aufgerufen, die eine Session braucht, ohne angemeldet zu sein. */
export function isNotAuthenticated(error: unknown): error is WebUntisRpcError {
  return error instanceof WebUntisRpcError && error.code === WebUntisErrorCode.NOT_AUTHENTICATED;
}

/** Benutzername oder Passwort falsch. */
export function isBadCredentials(error: unknown): error is WebUntisRpcError {
  return error instanceof WebUntisRpcError && error.code === WebUntisErrorCode.BAD_CREDENTIALS;
}

/**
 * Dem angemeldeten Konto fehlt das Recht für diese Methode.
 *
 * Relevant für PLAN.md R4: Schüler-Konten haben oft kein Recht auf getSubstitutions,
 * getStudents, getExams oder getTimetableWithAbsences. Screens sollen in dem Fall
 * ausgrauen statt abzustürzen.
 */
export function isMissingRight(error: unknown): error is WebUntisRpcError {
  return error instanceof WebUntisRpcError && error.code === WebUntisErrorCode.NO_RIGHT_FOR_METHOD;
}

/** Die Methode existiert auf diesem Server nicht. */
export function isMethodNotFound(error: unknown): error is WebUntisRpcError {
  return error instanceof WebUntisRpcError && error.code === JsonRpcErrorCode.METHOD_NOT_FOUND;
}

/**
 * Für die UI aufbereitete, deutschsprachige Fehlermeldung.
 * Unbekannte Codes werden mit der Servermeldung durchgereicht, statt sie zu verschlucken.
 */
export function describeError(error: unknown): string {
  if (error instanceof WebUntisRpcError) {
    switch (error.code) {
      case WebUntisErrorCode.BAD_CREDENTIALS:
        return 'Benutzername oder Passwort ist falsch.';
      case WebUntisErrorCode.NOT_AUTHENTICATED:
        return 'Die Sitzung ist abgelaufen. Bitte melde dich erneut an.';
      case WebUntisErrorCode.INVALID_SCHOOLNAME:
        return 'Der Schulname ist unbekannt.';
      case WebUntisErrorCode.NO_RIGHT_FOR_METHOD:
        return 'Dein Konto hat nicht die nötigen Rechte für diese Abfrage.';
      case WebUntisErrorCode.INVALID_ELEMENT_OR_RANGE:
        return 'Das angefragte Element oder der Zeitraum ist ungültig.';
      case JsonRpcErrorCode.METHOD_NOT_FOUND:
        return 'Diese Funktion wird vom WebUntis-Server der Schule nicht angeboten.';
      default:
        return `${error.serverMessage} (Code ${error.code})`;
    }
  }
  if (error instanceof WebUntisTransportError) {
    return error.status === undefined
      ? 'Der WebUntis-Server ist nicht erreichbar.'
      : `Der WebUntis-Server hat unerwartet geantwortet (HTTP ${error.status}).`;
  }
  return error instanceof Error ? error.message : String(error);
}
