/**
 * Schulsuche (undokumentiert) — findet den echten WebUntis-Server zu einem Schulnamen.
 *
 * WARUM: "Schule" (der `?school=`-Parameter, z. B. "htlstp") und der Server-Hostname
 * (z. B. "htlstp.webuntis.com") sind bei WebUntis zwei unabhängige Dinge — viele Schulen
 * teilen sich einen Server, andere haben einen eigenen, und es gibt keine Formel, um vom
 * einen auf das andere zu schließen. Diese Suche ist der einzige Weg, das herauszufinden;
 * das offizielle WebUntis-Login macht intern dasselbe.
 *
 * Gemessen 2026-09-24 gegen den echten Dienst (siehe TESTING.md): POST
 * https://mobile.webuntis.com/ms/schoolquery2, JSON-RPC-Methode "searchSchool", Parameter
 * `[{search: string}]`. Braucht keine Zugangsdaten. Läuft über den Proxy-Pfad
 * "/WebUntis/schoolsearch" (fest auf den zentralen Such-Dienst verdrahtet, nicht auf eine
 * einzelne Schule — siehe deploy/webuntis-proxy.php und vite.config.ts): der Browser darf
 * nicht direkt auf eine fremde Domain zugreifen, derselbe CORS-Grund wie bei jedem anderen
 * Aufruf (TESTING.md).
 *
 * Ohne WebUntisClient, weil vor der Schulsuche noch keine Session/kein Client existiert —
 * anders als examsRest.ts/absencesRest.ts/calendarEntryRest.ts, die einen bereits
 * angemeldeten Client erwarten.
 *
 * Zwei Eigenheiten der echten Antwort, gemessen 2026-09-24 (siehe TESTING.md):
 *  - Feld `size` ist unzuverlässig (gemessen: 0, obwohl `schools` 18 Einträge enthielt) —
 *    bewusst ignoriert, stattdessen zählt die tatsächliche Array-Länge.
 *  - `mobileServiceUrlAndroid`/`mobileServiceUrlIos`/`mobileServiceUrl` waren in jeder
 *    gemessenen Zeile `false`/`false`/`null`. Was ein abweichender Wert bedeutet, ist
 *    ungemessen — hier nicht unterstützt, solche Schulen fallen einfach nicht auf, weil wir
 *    dieselben `server`/`loginName`-Felder wie jede andere Schule trotzdem übernehmen.
 */

import { WebUntisTransportError } from './errors';
import { FetchTransport, type RpcTransport } from './transport';

export interface SchoolSearchResult {
  /** Hostname des WebUntis-Servers dieser Schule, z. B. "htlstp.webuntis.com". */
  server: string;
  /** Schulname für den `?school=`-Parameter, z. B. "htlstp". */
  loginName: string;
  /** Anzeigename, z. B. "HTBLUVA St.Pölten". */
  displayName: string;
  /** Adresse — zur Unterscheidung gleich-/ähnlich benannter Schulen (siehe TESTING.md: eine Suche nach "pölten" liefert 18 verschiedene Schulen). */
  address: string;
}

interface RawSchool {
  server?: unknown;
  loginName?: unknown;
  displayName?: unknown;
  address?: unknown;
}

interface RawSearchResponse {
  result?: { schools?: unknown };
  error?: { message?: unknown };
}

function isValidSchool(raw: RawSchool): raw is SchoolSearchResult {
  return (
    typeof raw.server === 'string' &&
    raw.server !== '' &&
    typeof raw.loginName === 'string' &&
    raw.loginName !== '' &&
    typeof raw.displayName === 'string' &&
    raw.displayName !== '' &&
    typeof raw.address === 'string'
  );
}

export interface SearchSchoolsOptions {
  /** Proxy-Basispfad, z. B. "/WebUntis" (Dev/Produktion). Default: "/WebUntis". */
  proxyBase?: string;
  /** Für Tests injizierbar. Default: FetchTransport (Browser-fetch). */
  transport?: RpcTransport;
}

/**
 * Sucht Schulen anhand eines Namens oder einer Stadt. Ein zu kurzer Suchbegriff liefert
 * ohne Netzwerkaufruf ein leeres Ergebnis (verhindert Anfragen bei jedem Tastendruck).
 */
export async function searchSchools(
  term: string,
  options: SearchSchoolsOptions = {},
): Promise<SchoolSearchResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const transport = options.transport ?? new FetchTransport();
  const proxyBase = (options.proxyBase ?? '/WebUntis').replace(/\/+$/, '');
  const url = `${proxyBase}/schoolsearch`;
  const body = JSON.stringify({
    id: 'bwu-schoolsearch',
    method: 'searchSchool',
    params: [{ search: trimmed }],
    jsonrpc: '2.0',
  });

  let response;
  try {
    response = await transport.send({
      url,
      body,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  } catch (cause) {
    throw new WebUntisTransportError('Netzwerkfehler bei der Schulsuche.', 'searchSchool', { cause });
  }

  if (response.status < 200 || response.status >= 300) {
    throw new WebUntisTransportError(`HTTP ${response.status} bei der Schulsuche.`, 'searchSchool', {
      status: response.status,
      body: response.body,
    });
  }

  let parsed: RawSearchResponse;
  try {
    parsed = JSON.parse(response.body) as RawSearchResponse;
  } catch (cause) {
    throw new WebUntisTransportError('Antwort der Schulsuche ist kein gueltiges JSON.', 'searchSchool', {
      status: response.status,
      body: response.body,
      cause,
    });
  }

  // Fehlerform ungemessen (in der echten Antwort nie beobachtet) -- defensiv behandelt.
  if (typeof parsed.error === 'object' && parsed.error !== null) {
    const message = typeof parsed.error.message === 'string' ? parsed.error.message : 'Schulsuche fehlgeschlagen.';
    throw new WebUntisTransportError(message, 'searchSchool', { status: response.status, body: response.body });
  }

  const rawSchools = Array.isArray(parsed.result?.schools) ? (parsed.result.schools as RawSchool[]) : [];
  // isValidSchool schmaelert nur den TS-Typ, nicht das Objekt selbst -- die echte Antwort
  // hat weitere Felder (schoolId, tenantId, serverUrl, mobileServiceUrl*, siehe oben), die
  // hier bewusst nicht durchgereicht werden, deshalb explizit neu bauen statt nur filtern.
  return rawSchools.filter(isValidSchool).map((s) => ({
    server: s.server,
    loginName: s.loginName,
    displayName: s.displayName,
    address: s.address,
  }));
}
