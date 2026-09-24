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
   * Hostname des echten WebUntis-Servers dieser Schule, z. B. "htlstp.webuntis.com" —
   * NUR im Proxy-Betrieb nötig (der Produktions-Proxy bedient beliebige Schulen, siehe
   * deploy/webuntis-proxy.php, und muss pro Anfrage wissen, wohin). Wird als Header
   * `X-WebUntis-Host` auf jeden Request gelegt; bei direktem Zugriff (nativ/Node, `server`
   * schon Teil der `endpoint`-URL) wird das Feld ignoriert.
   */
  targetHost?: string;
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

  readonly #targetHost: string | undefined;
  readonly #transport: RpcTransport;
  readonly #minGapMs: number;
  /** Cookie-Jar. Nur relevant, wenn der Transport den Cookie-Header setzen darf. */
  readonly #cookies = new Map<string, string>();

  #session: SessionInfo | null = null;
  #requestCounter = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #lastRequestAt = 0;
  /**
   * Bearer-Token für die neuere "api/rest/**"-Fläche (z. B. calendar-entry/detail) — anders
   * als die älteren REST-Endpunkte (api/exams, api/classreg/…) reicht dort das JSESSIONID-
   * Cookie allein nicht, siehe `getRestBearer()`. Gemessen 2026-09-22, siehe IDEEN.md B8.
   */
  #bearerToken: string | undefined;
  /** Verhindert parallele Mehrfach-Anfragen an /api/token/new, wenn kein Token gecacht ist. */
  #bearerTokenPromise: Promise<string> | undefined;

  constructor(options: WebUntisClientOptions) {
    this.endpoint = options.endpoint;
    this.school = options.school;
    this.clientId = options.client;
    this.#targetHost = options.targetHost;
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
    // Ein Bearer-Token aus /api/token/new (siehe getRestBearer()) haengt an der JSESSIONID,
    // die er geholt hat -- bei jedem Sessionwechsel (Login, Logout, Wiederherstellung) ist
    // ein alter Token wertlos bzw. gehoert zur falschen Session.
    this.#bearerToken = undefined;
    this.#bearerTokenPromise = undefined;
  }

  /** Verwirft Session und Cookies. Ruft **nicht** `logout` auf — das macht `methods.logout`. */
  clearSession(): void {
    this.#session = null;
    this.#cookies.clear();
    this.#bearerToken = undefined;
    this.#bearerTokenPromise = undefined;
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
    return this.#enqueue(() => this.#execute<TResult>(method, params));
  }

  /**
   * GET gegen einen REST-Endpunkt unter derselben Basis wie jsonrpc.do (z. B. "/api/exams"),
   * ohne JSON-RPC-Umschlag — der Aufrufer bekommt die rohe geparste JSON-Antwort. Nur für
   * undokumentierte Endpunkte gedacht (siehe api/examsRest.ts und IDEEN.md B3); dokumentierte
   * Methoden laufen immer über `call()`. Teilt sich Warteschlange und Drosselung mit `call()`.
   */
  async getRest<TResult>(path: string, query: Record<string, string | number | boolean>): Promise<TResult> {
    return this.#enqueue(() => this.#executeRest<TResult>(path, query));
  }

  /**
   * Wie `getRest()`, aber für die neuere "api/rest/**"-Fläche von WebUntis (z. B.
   * "/api/rest/view/v2/calendar-entry/detail"), die — anders als die älteren REST-Endpunkte
   * unter `getRest()` (`api/exams`, `api/classreg/absences/students`, siehe IDEEN.md B3/B3b)
   * — nicht mit dem JSESSIONID-Cookie allein auskommt.
   *
   * Gemessen 2026-09-22 (siehe IDEEN.md B8, `api/calendarEntryRest.ts`): ohne
   * `Authorization`-Header antwortet der Server mit HTTP 404 (**nicht** 401/403) — sieht wie
   * "Route existiert nicht" aus, ist aber "kein gültiger Token". `GET /api/token/new` liefert
   * mit der bestehenden Session ein rohes JWT (kein JSON-Body, kein umschließendes
   * Anführungszeichen), das als `Authorization: Bearer <token>` mitgeschickt werden muss.
   *
   * Der Token wird einmal pro Client-Instanz geholt und für weitere Aufrufe wiederverwendet
   * (verworfen bei jedem Sessionwechsel, siehe `setSession()`/`clearSession()`). Schlägt ein
   * Aufruf mit HTTP 401/403 fehl, wird der Token einmal neu geholt und der Aufruf wiederholt
   * — wie lange ein Token gültig ist, ist ungemessen. Teilt sich Warteschlange/Drosselung mit
   * `call()`/`getRest()`.
   */
  async getRestBearer<TResult>(path: string, query: Record<string, string | number | boolean>): Promise<TResult> {
    return this.#enqueue(() => this.#executeRestBearer<TResult>(path, query, false));
  }

  /**
   * Wie `getRest()`, aber ohne `JSON.parse` und mit der Möglichkeit, zusätzliche Header zu
   * setzen (z. B. `Authorization`) — für die Erkundung eines noch unklaren Endpunkts, bei
   * dem weder Antwortformat noch Auth-Mechanismus feststehen (z. B. ein roher Bearer-Token
   * statt JSON). Wirft NICHT bei einem Nicht-2xx-Status — die Aufruferin sieht Status und
   * Rohtext immer, auch bei einem Fehler, und entscheidet selbst. Nur für Diagnose/Skripte
   * gedacht (siehe scripts/smoke-test.ts); Produktionscode nutzt `getRest()`, sobald das
   * Format geklärt ist.
   */
  async getRestRaw(
    path: string,
    query: Record<string, string | number | boolean>,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; body: string }> {
    return this.#enqueue(() => this.#executeRestRaw(path, query, extraHeaders));
  }

  #enqueue<TResult>(task: () => Promise<TResult>): Promise<TResult> {
    const run = this.#queue.then(task, task);
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
      ...this.#targetHostHeader(),
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

  async #executeRest<TResult>(path: string, query: Record<string, string | number | boolean>): Promise<TResult> {
    const { status, body } = await this.#executeRestRaw(path, query, {});

    if (status < 200 || status >= 300) {
      throw new WebUntisTransportError(`HTTP ${status} beim Aufruf von "${path}".`, path, { status, body });
    }

    try {
      return JSON.parse(body) as TResult;
    } catch (cause) {
      throw new WebUntisTransportError(`Antwort auf "${path}" ist kein gueltiges JSON.`, path, {
        status,
        body,
        cause,
      });
    }
  }

  async #executeRestBearer<TResult>(
    path: string,
    query: Record<string, string | number | boolean>,
    isRetryAfterAuthFailure: boolean,
  ): Promise<TResult> {
    const token = await this.#ensureBearerToken();
    const { status, body } = await this.#executeRestRaw(path, query, { Authorization: `Bearer ${token}` });

    // Ungemessen, wie lange ein Token gilt (siehe getRestBearer()-Doku) -- bei 401/403 einmal
    // neu holen und wiederholen, statt sofort aufzugeben. Kein Endlosversuch: nur EIN Retry.
    if ((status === 401 || status === 403) && !isRetryAfterAuthFailure) {
      this.#bearerToken = undefined;
      return this.#executeRestBearer<TResult>(path, query, true);
    }

    if (status < 200 || status >= 300) {
      throw new WebUntisTransportError(`HTTP ${status} beim Aufruf von "${path}".`, path, { status, body });
    }
    try {
      return JSON.parse(body) as TResult;
    } catch (cause) {
      throw new WebUntisTransportError(`Antwort auf "${path}" ist kein gueltiges JSON.`, path, {
        status,
        body,
        cause,
      });
    }
  }

  /**
   * Liefert den gecachten Bearer-Token oder holt einen neuen — mit Single-Flight-Schutz
   * (`#bearerTokenPromise`), damit nicht zwei gleichzeitige Aufrufe ohne Cache zwei Token
   * anfordern. Ruft `#executeRestRaw` bewusst DIREKT auf, nicht über `#enqueue()`: diese
   * Methode läuft immer bereits INNERHALB eines über `#enqueue` laufenden Tasks
   * (`#executeRestBearer`) — ein verschachtelter `#enqueue`-Aufruf würde sich selbst
   * blockieren, weil die Warteschlange erst weiterläuft, wenn der äußere Task fertig ist.
   */
  async #ensureBearerToken(): Promise<string> {
    if (this.#bearerToken !== undefined) return this.#bearerToken;
    if (this.#bearerTokenPromise === undefined) {
      this.#bearerTokenPromise = this.#fetchBearerToken().finally(() => {
        this.#bearerTokenPromise = undefined;
      });
    }
    return this.#bearerTokenPromise;
  }

  async #fetchBearerToken(): Promise<string> {
    const { status, body } = await this.#executeRestRaw('/api/token/new', {}, {});
    if (status < 200 || status >= 300) {
      throw new WebUntisTransportError(`HTTP ${status} beim Holen des Bearer-Tokens.`, '/api/token/new', {
        status,
        body,
      });
    }
    // Gemessen 2026-09-22: die Antwort ist ein roher JWT-String, kein JSON — trotzdem
    // vorsichtshalber umschließende Anführungszeichen entfernen, falls ein anderer Server
    // ihn doch als JSON-String liefert.
    const token = body.trim().replace(/^"|"$/g, '');
    this.#bearerToken = token;
    return token;
  }

  async #executeRestRaw(
    path: string,
    query: Record<string, string | number | boolean>,
    extraHeaders: Record<string, string>,
  ): Promise<{ status: number; body: string }> {
    await this.#respectRateLimit();

    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) qs.set(key, String(value));
    const url = `${this.#restBase()}${path}?${qs.toString()}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.#targetHostHeader(),
      ...extraHeaders,
    };
    if (this.#transport.canSetCookieHeader) {
      const cookieHeader = this.#cookieHeader();
      if (cookieHeader !== undefined) headers['Cookie'] = cookieHeader;
    }

    let response;
    try {
      response = await this.#transport.sendGet({ url, headers });
    } catch (cause) {
      throw new WebUntisTransportError(`Netzwerkfehler beim Aufruf von "${path}".`, path, { cause });
    } finally {
      this.#lastRequestAt = Date.now();
    }

    this.#absorbCookies(response.setCookie);
    return { status: response.status, body: response.body };
  }

  /** Basis-URL ohne "/jsonrpc.do" — für REST-Aufrufe unter demselben Host/Proxy-Pfad. */
  #restBase(): string {
    return this.endpoint.replace(/\/jsonrpc\.do$/, '');
  }

  /** Siehe `WebUntisClientOptions.targetHost` — leeres Objekt, wenn kein Ziel-Host gesetzt ist. */
  #targetHostHeader(): Record<string, string> {
    return this.#targetHost === undefined ? {} : { 'X-WebUntis-Host': this.#targetHost };
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
