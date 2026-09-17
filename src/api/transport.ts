/**
 * HTTP-Transport für die JSON-RPC-Aufrufe.
 *
 * Warum eine Abstraktion und nicht einfach `fetch`?
 *
 * Der Browser kann WebUntis nicht direkt aufrufen: der Server sendet kein
 * `Access-Control-Allow-Credentials`, und `JSESSIONID` ist `HttpOnly` — JS kann das
 * Cookie also weder lesen noch als Header setzen (`Cookie` ist ein Forbidden Header).
 * Im Browser läuft deshalb alles über einen Proxy, der das Cookie transportiert.
 * Nativ (Capacitor) und in Node gibt es diese Einschränkung nicht, dort setzen wir
 * `Cookie` selbst. Gemessen am 2026-09-10, siehe TESTING.md.
 */

export interface RpcHttpRequest {
  url: string;
  /** Fertig serialisierter JSON-RPC-Body. */
  body: string;
  headers: Record<string, string>;
}

/** Wie RpcHttpRequest, aber ohne Body — für GET-Aufrufe gegen REST-Endpunkte (siehe api/examsRest.ts). */
export interface RpcHttpGetRequest {
  url: string;
  headers: Record<string, string>;
}

export interface RpcHttpResponse {
  status: number;
  body: string;
  /** Rohe Set-Cookie-Header, sofern der Transport sie lesen kann (nicht im Browser). */
  setCookie?: string[];
}

export interface RpcTransport {
  readonly name: string;
  /**
   * Darf dieser Transport den `Cookie`-Header selbst setzen?
   * Im Browser nein (Forbidden Header) — dort übernimmt das der Proxy bzw. der Browser selbst.
   */
  readonly canSetCookieHeader: boolean;
  send(request: RpcHttpRequest): Promise<RpcHttpResponse>;
  /** GET ohne JSON-RPC-Umschlag — für undokumentierte REST-Endpunkte unter derselben Basis. */
  sendGet(request: RpcHttpGetRequest): Promise<RpcHttpResponse>;
}

/** Läuft der Code in einem Browser-Dokument (im Gegensatz zu Node oder einer nativen WebView-Bridge)? */
function isBrowserContext(): boolean {
  return typeof document !== 'undefined';
}

export interface FetchTransportOptions {
  /**
   * Cookie-Header selbst setzen. Default: nur außerhalb des Browsers.
   * Im Browser hat das keine Wirkung und wird von fetch stillschweigend ignoriert.
   */
  canSetCookieHeader?: boolean;
  /** Default: 'include' — nötig, damit der Browser das Proxy-Cookie mitschickt. */
  credentials?: RequestCredentials;
  /** Timeout in Millisekunden. Default: 20000. */
  timeoutMs?: number;
  /** Für Tests injizierbar. */
  fetchImpl?: typeof fetch;
}

/**
 * Standard-Transport auf Basis von `fetch`.
 * Im Browser gegen den Proxy, in Node (Smoke-Test, Skripte) direkt gegen WebUntis.
 */
export class FetchTransport implements RpcTransport {
  readonly name = 'fetch';
  readonly canSetCookieHeader: boolean;

  readonly #credentials: RequestCredentials;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: FetchTransportOptions = {}) {
    this.canSetCookieHeader = options.canSetCookieHeader ?? !isBrowserContext();
    this.#credentials = options.credentials ?? 'include';
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async send(request: RpcHttpRequest): Promise<RpcHttpResponse> {
    return this.#doFetch(request.url, 'POST', request.headers, request.body);
  }

  async sendGet(request: RpcHttpGetRequest): Promise<RpcHttpResponse> {
    return this.#doFetch(request.url, 'GET', request.headers);
  }

  async #doFetch(url: string, method: string, headers: Record<string, string>, body?: string): Promise<RpcHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        credentials: this.#credentials,
        signal: controller.signal,
      });
      const responseBody = await response.text();
      // getSetCookie() gibt es nur außerhalb des Browsers; im Browser ist Set-Cookie
      // ein Forbidden Response Header und die Liste bleibt leer.
      const setCookie = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
      return setCookie.length > 0
        ? { status: response.status, body: responseBody, setCookie }
        : { status: response.status, body: responseBody };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Minimale Sicht auf Capacitors HTTP-Plugin — bewusst als Interface statt als Import,
 * damit `@capacitor/core` erst in M9 zur Abhängigkeit wird und der API-Layer
 * plattformunabhängig testbar bleibt.
 */
export interface CapacitorHttpLike {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data: string;
    responseType?: string;
  }): Promise<{ status: number; data: unknown; headers: Record<string, string> }>;
}

/**
 * Transport für Android/iOS. Requests laufen nativ und unterliegen keiner
 * Browser-CORS-Policy, deshalb ist hier kein Proxy nötig.
 */
export function createCapacitorTransport(http: CapacitorHttpLike): RpcTransport {
  async function doRequest(method: string, url: string, headers: Record<string, string>, data?: string): Promise<RpcHttpResponse> {
    const response = await http.request({ url, method, headers, data: data ?? '', responseType: 'text' });
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const raw = response.headers['set-cookie'] ?? response.headers['Set-Cookie'];
    return raw === undefined ? { status: response.status, body } : { status: response.status, body, setCookie: [raw] };
  }

  return {
    name: 'capacitor',
    canSetCookieHeader: true,
    send: (request) => doRequest('POST', request.url, request.headers, request.body),
    sendGet: (request) => doRequest('GET', request.url, request.headers),
  };
}

/** Liest den Wert eines Cookies aus rohen Set-Cookie-Headern. */
export function readCookie(setCookie: readonly string[] | undefined, name: string): string | undefined {
  if (setCookie === undefined) return undefined;
  const prefix = `${name}=`;
  for (const header of setCookie) {
    const first = header.split(';', 1)[0]?.trim();
    if (first !== undefined && first.startsWith(prefix)) {
      return first.slice(prefix.length);
    }
  }
  return undefined;
}
