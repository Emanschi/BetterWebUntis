/**
 * JSON-RPC-Client für WebUntis.
 *
 * Zuständig für: Request-Serialisierung, Request-Ids, Session-/Cookie-Verwaltung,
 * Fehler-Mapping und eine Drosselung der Aufrufrate. Die konkreten Methoden liegen
 * in `methods.ts` — dieser Client kennt keine einzelne Methode namentlich.
 */

import {
  WebUntisRpcError,
  WebUntisTransportError,
  type JsonRpcErrorPayload,
} from './errors';
import { FetchTransport, readCookie, type RpcTransport } from './transport';
import type { AuthenticateResult } from './types';

/** Name des Session-Cookies laut Doku Abschnitt 1. */
export const SESSION_COOKIE = 'JSESSIONID';

export interface WebUntisClientOptions {
  /**
   * Vollständige Endpunkt-URL, z. B. `https://htlstp.webuntis.com/WebUntis/jsonrpc.do`
   * (nativ / Node) oder ein Proxy-Pfad wie `/WebUntis/jsonrpc.do` (Browser).
   */
  endpoint: string;
  /** Schulname für den `?school=`-Parameter, z. B. "htlstp". */
  school: string;
  /**
   * Eindeutiger Bezeichner der Client-App (Doku Abschnitt 1: "The parameter client is a
   * unique identifier for the client app. The parameter client will be mandatory in the future.").
   */
  client: string;
  transport?: RpcTransport;
  /**
   * Mindestabstand zwischen zwei Requests in Millisekunden. WebUntis drosselt bei
   * Lastspitzen (PLAN.md R7). Default: 120.
   */
  minRequestGapMs?: number;
}

/** Zustandsloser Blick auf die aktuelle Session. */
export interface SessionInfo extends AuthenticateResult {}

export class WebUntisClient {
  readonly endpoint: string;
  readonly school: string;
  readonly clientId: string;

  readonly #transport: RpcTransport;
  readonly #minGapMs: number;
  /** Cookie-Jar. Nur relevant, wenn der Transport den Cookie-Header setzen darf. */
  readonly #cookies = new Map<string, string>();

  #session: SessionInfo | null = null;
  #requestCounter = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #lastRequestAt = 0;

  constructor(options: WebUntisClientOptions) {
    this.endpoint = options.endpoint;
    this.school = options.school;
    this.clientId = options.client;
    this.#transport = options.transport ?? new FetchTransport();
    this.#minGapMs = options.minRequestGapMs ?? 120;
  }

  get session(): SessionInfo | null {
    return this.#session;
  }

  get sessionId(): string | undefined {
    return this.#session?.sessionId;
  }

  get isAuthenticated(): boolean {
    return this.#session !== null;
  }

  /**
   * Setzt die Session, ohne erneut anzumelden — z. B. nach dem Wiederherstellen
   * aus einem sicheren Speicher.
   */
  setSession(session: SessionInfo | null): void {
    this.#session = session;
    if (session === null) {
      this.#cookies.delete(SESSION_COOKIE);
    } else {
      this.#cookies.set(SESSION_COOKIE, session.sessionId);
    }
  }

  /** Verwirft Session und Cookies. Ruft **nicht** `logout` auf — das macht `methods.logout`. */
  clearSession(): void {
    this.#session = null;
    this.#cookies.clear();
  }

  /** URL inklusive `?school=` (Doku Abschnitt 1: Pflichtparameter). */
  buildUrl(): string {
    const separator = this.endpoint.includes('?') ? '&' : '?';
    return `${this.endpoint}${separator}school=${encodeURIComponent(this.school)}`;
  }

  /**
   * Führt einen JSON-RPC-Aufruf aus. Aufrufe werden serialisiert und mit
   * `minRequestGapMs` Abstand abgeschickt.
   */
  async call<TResult>(method: string, params: unknown = {}): Promise<TResult> {
    const run = this.#queue.then(
      () => this.#execute<TResult>(method, params),
      () => this.#execute<TResult>(method, params),
    );
    // Die Warteschlange darf durch einen Fehler nicht abreißen.
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #execute<TResult>(method: string, params: unknown): Promise<TResult> {
    await this.#respectRateLimit();

    const requestId = `bwu-${++this.#requestCounter}`;
    const body = JSON.stringify({ id: requestId, method, params, jsonrpc: '2.0' });

    const headers: Record<string, string> = {
      // Doku Seite 1: "Content-Type should be set to text/plain or application/json"
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.#transport.canSetCookieHeader) {
      const cookieHeader = this.#cookieHeader();
      if (cookieHeader !== undefined) headers['Cookie'] = cookieHeader;
    }

    let response;
    try {
      response = await this.#transport.send({ url: this.buildUrl(), body, headers });
    } catch (cause) {
      throw new WebUntisTransportError(
        `Netzwerkfehler beim Aufruf von "${method}".`,
        method,
        { cause },
      );
    } finally {
      this.#lastRequestAt = Date.now();
    }

    this.#absorbCookies(response.setCookie);

    if (response.status < 200 || response.status >= 300) {
      throw new WebUntisTransportError(
        `HTTP ${response.status} beim Aufruf von "${method}".`,
        method,
        { status: response.status, body: response.body },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch (cause) {
      throw new WebUntisTransportError(
        `Antwort auf "${method}" ist kein gueltiges JSON.`,
        method,
        { status: response.status, body: response.body, cause },
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new WebUntisTransportError(
        `Antwort auf "${method}" ist kein JSON-RPC-Objekt.`,
        method,
        { status: response.status, body: response.body },
      );
    }

    const envelope = parsed as { error?: JsonRpcErrorPayload; result?: unknown };

    if (envelope.error !== undefined && envelope.error !== null) {
      throw new WebUntisRpcError(envelope.error, method, requestId);
    }

    if (!('result' in envelope)) {
      throw new WebUntisTransportError(
        `Antwort auf "${method}" enthaelt weder "result" noch "error".`,
        method,
        { status: response.status, body: response.body },
      );
    }

    return envelope.result as TResult;
  }

  /** Merkt sich die Session-Id aus einem authenticate-Result. */
  rememberAuthentication(result: AuthenticateResult): void {
    this.setSession(result);
  }

  #cookieHeader(): string | undefined {
    if (this.#cookies.size === 0) return undefined;
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  #absorbCookies(setCookie: readonly string[] | undefined): void {
    if (setCookie === undefined || !this.#transport.canSetCookieHeader) return;
    for (const name of [SESSION_COOKIE, 'schoolname', 'Tenant-Id']) {
      const value = readCookie(setCookie, name);
      // Die Session-Id aus dem authenticate-Result hat Vorrang: der Server setzt schon
      // vor dem Login ein JSESSIONID-Cookie, das noch keine angemeldete Session ist.
      if (value !== undefined && !(name === SESSION_COOKIE && this.#session !== null)) {
        this.#cookies.set(name, value);
      }
    }
  }

  async #respectRateLimit(): Promise<void> {
    if (this.#minGapMs <= 0 || this.#lastRequestAt === 0) return;
    const wait = this.#minGapMs - (Date.now() - this.#lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/**
 * Baut die Endpunkt-URL für den direkten Zugriff (nativ / Node).
 * Im Browser stattdessen den Proxy-Pfad verwenden — siehe TESTING.md.
 */
export function directEndpoint(server: string): string {
  const base = server.replace(/\/+$/, '');
  const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
  return `${withScheme}/WebUntis/jsonrpc.do`;
}
