import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebUntisClient } from '../client';
import type { RpcHttpGetRequest, RpcHttpRequest, RpcHttpResponse, RpcTransport } from '../transport';

/** Lädt ein Fixture als Rohtext, so wie es der Server liefern würde. */
export function fixtureText(name: string): string {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, 'utf-8');
}

export function fixtureJson<T = unknown>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

export interface StubResponse {
  status?: number;
  body: string;
  setCookie?: string[];
}

/**
 * Transport-Attrappe: gibt vorbereitete Antworten der Reihe nach zurück und
 * protokolliert jeden Request. Ersetzt jeden Netzwerkzugriff in den Tests.
 */
export class StubTransport implements RpcTransport {
  readonly name = 'stub';
  canSetCookieHeader: boolean;

  readonly requests: RpcHttpRequest[] = [];
  readonly getRequests: RpcHttpGetRequest[] = [];
  readonly #responses: StubResponse[] = [];
  /** Wird geworfen statt zu antworten, wenn gesetzt. */
  failWith: Error | null = null;

  constructor(options: { canSetCookieHeader?: boolean } = {}) {
    this.canSetCookieHeader = options.canSetCookieHeader ?? true;
  }

  /** Stellt eine Antwort in die Warteschlange. */
  queue(response: StubResponse | string): this {
    this.#responses.push(typeof response === 'string' ? { body: response } : response);
    return this;
  }

  /** Stellt ein Fixture als Antwort in die Warteschlange. */
  queueFixture(name: string, extra: Omit<StubResponse, 'body'> = {}): this {
    return this.queue({ ...extra, body: fixtureText(name) });
  }

  async send(request: RpcHttpRequest): Promise<RpcHttpResponse> {
    this.requests.push(request);
    return this.#nextResponse();
  }

  async sendGet(request: RpcHttpGetRequest): Promise<RpcHttpResponse> {
    this.getRequests.push(request);
    return this.#nextResponse();
  }

  #nextResponse(): RpcHttpResponse {
    if (this.failWith !== null) throw this.failWith;
    const next = this.#responses.shift();
    if (next === undefined) {
      const count = this.requests.length + this.getRequests.length;
      throw new Error(`StubTransport: keine Antwort mehr in der Warteschlange (Request ${count})`);
    }
    const response: RpcHttpResponse = { status: next.status ?? 200, body: next.body };
    return next.setCookie === undefined ? response : { ...response, setCookie: next.setCookie };
  }

  /** Der zuletzt gesendete Request, als JSON-RPC-Objekt geparst. */
  lastPayload(): { id: string; method: string; params: unknown; jsonrpc: string } {
    const last = this.requests.at(-1);
    if (last === undefined) throw new Error('StubTransport: es wurde noch kein Request gesendet.');
    return JSON.parse(last.body);
  }

  payloadAt(index: number): { id: string; method: string; params: unknown; jsonrpc: string } {
    const entry = this.requests[index];
    if (entry === undefined) throw new Error(`StubTransport: kein Request mit Index ${index}.`);
    return JSON.parse(entry.body);
  }
}

/** Client mit Attrappen-Transport und ohne Drosselung, für schnelle Tests. */
export function makeClient(transport: StubTransport = new StubTransport()): {
  client: WebUntisClient;
  transport: StubTransport;
} {
  const client = new WebUntisClient({
    endpoint: 'https://example.webuntis.com/WebUntis/jsonrpc.do',
    school: 'testschule',
    client: 'BetterWebUntis-Test',
    transport,
    minRequestGapMs: 0,
  });
  return { client, transport };
}
