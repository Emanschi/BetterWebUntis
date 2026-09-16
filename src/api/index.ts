/**
 * Öffentliche Schnittstelle des API-Layers.
 *
 * Regel aus PLAN.md: `ui/` und `domain/` reden nie direkt mit dem Netz, sondern
 * ausschließlich über dieses Modul.
 */

export * from './types';
export * from './format';
export * from './errors';
export * from './transport';
export * from './client';
export * as api from './methods';

import { WebUntisClient, directEndpoint, type WebUntisClientOptions } from './client';
import { FetchTransport, createCapacitorTransport, type CapacitorHttpLike } from './transport';

/** Kennung dieser App gegenüber WebUntis (Doku Abschnitt 1, Parameter `client`). */
export const CLIENT_ID = 'BetterWebUntis';

export interface CreateClientOptions {
  /** Schulname für `?school=`, z. B. "htlstp". */
  school: string;
  /** Hostname des WebUntis-Servers, z. B. "htlstp.webuntis.com". Nur für direkte Zugriffe nötig. */
  server?: string;
  /**
   * Proxy-Basispfad für den Browser, z. B. "/WebUntis" im Dev oder die World4you-URL
   * in Produktion. Ist er gesetzt, wird nicht direkt gegen WebUntis gesprochen.
   */
  proxyBase?: string;
  /** Capacitor-HTTP-Plugin, sofern die App nativ läuft (ab M9). */
  capacitorHttp?: CapacitorHttpLike;
  minRequestGapMs?: number;
}

/**
 * Baut einen Client passend zur Plattform:
 *
 *   nativ    → direkter Zugriff über CapacitorHttp, kein CORS
 *   Browser  → über den Proxy, weil WebUntis kein Access-Control-Allow-Credentials sendet
 *   Node     → direkter Zugriff über fetch (Smoke-Tests, Skripte)
 *
 * Hintergrund und Messung: TESTING.md.
 */
export function createWebUntisClient(options: CreateClientOptions): WebUntisClient {
  const base: Pick<WebUntisClientOptions, 'school' | 'client' | 'minRequestGapMs'> = {
    school: options.school,
    client: CLIENT_ID,
    ...(options.minRequestGapMs === undefined ? {} : { minRequestGapMs: options.minRequestGapMs }),
  };

  if (options.capacitorHttp !== undefined) {
    if (options.server === undefined) {
      throw new Error('Fuer den nativen Zugriff wird "server" benoetigt.');
    }
    return new WebUntisClient({
      ...base,
      endpoint: directEndpoint(options.server),
      transport: createCapacitorTransport(options.capacitorHttp),
    });
  }

  if (options.proxyBase !== undefined) {
    return new WebUntisClient({
      ...base,
      endpoint: `${options.proxyBase.replace(/\/+$/, '')}/jsonrpc.do`,
      transport: new FetchTransport(),
    });
  }

  if (options.server === undefined) {
    throw new Error('Es wird entweder "server", "proxyBase" oder "capacitorHttp" benoetigt.');
  }
  return new WebUntisClient({
    ...base,
    endpoint: directEndpoint(options.server),
    transport: new FetchTransport(),
  });
}
