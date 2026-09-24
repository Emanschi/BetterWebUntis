/**
 * Verwaltet die WebUntis-Session als React-State.
 *
 * Ursprüngliche, bewusste Sicherheitsentscheidung: die Session lebt ausschließlich im
 * Speicher, ein Reload meldet ab. Seit B15 (Nutzerwunsch, IDEEN.md) ist das jetzt OPT-IN
 * änderbar: "Angemeldet bleiben" beim Login (siehe LoginScreen.tsx) merkt sich die Identität
 * (Nutzername, PersonType, PersonId — siehe `RememberedSession`) in `localStorage`, bis
 * `bleibt bis man löscht`. **Nicht** gespeichert (geht wegen `HttpOnly` auch technisch gar
 * nicht): Passwort oder die WebUntis-Session-ID selbst — die eigentliche Authentifizierung
 * läuft weiterhin ausschließlich über das `JSESSIONID`-Cookie, das der Browser selbst hält.
 * Ohne Häkchen bleibt es beim alten Verhalten (Reload = abgemeldet).
 *
 * Ist eine gemerkte Identität vorhanden, startet der Store optimistisch als
 * "authenticated" — ob das Cookie noch gültig ist, entscheidet sich am ersten echten
 * API-Aufruf. Schlägt der fehl (`NOT_AUTHENTICATED`), fängt `App.tsx`s globaler
 * QueryCache-Handler das ab und ruft `sessionExpired()`.
 *
 * Nur die aufgelöste Schule wird IMMER gemerkt (unproblematisch, kein Geheimnis, auch ohne
 * "Angemeldet bleiben") — Komfort für den nächsten Login, siehe `SCHOOL_STORAGE_KEY`. Seit
 * der Schulsuche (IDEEN.md) ist das ein Objekt inkl. Server-Hostname, nicht mehr nur ein
 * Name — ein Login braucht seither beides (siehe `StoredSchool`, `defaultBuildClient`).
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { api, createWebUntisClient, describeError, type WebUntisClient } from '../api/index';
import type { PersonType } from '../api/types';

export type SessionStatus = 'idle' | 'authenticating' | 'authenticated' | 'error';

/** Ergebnis der Schulsuche, das für einen Login reicht (siehe `restApi.searchSchools`). */
export interface StoredSchool {
  server: string;
  loginName: string;
  displayName: string;
}

const SCHOOL_STORAGE_KEY = 'bwu-school';

function isStoredSchool(value: unknown): value is StoredSchool {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredSchool).server === 'string' &&
    typeof (value as StoredSchool).loginName === 'string' &&
    typeof (value as StoredSchool).displayName === 'string'
  );
}

function readStoredSchool(): StoredSchool | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SCHOOL_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    // Vor der Schulsuche stand hier ein roher String statt JSON (kein "server" bekannt) --
    // JSON.parse wirft dann, absichtlich als "nichts gemerkt" behandelt statt zu raten.
    return isStoredSchool(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredSchool(school: StoredSchool): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(school));
  } catch {
    // nicht kritisch
  }
}

/**
 * Nur die Identität, NIE das Passwort oder die Session-ID selbst (siehe Datei-Kommentar
 * oben) — genug, um die UI nach einem Reload sofort wieder als "angemeldet" zu zeigen, ohne
 * dass irgendwo ein Geheimnis liegt.
 */
interface RememberedSession {
  username: string;
  personType: PersonType;
  personId: number;
}

const REMEMBERED_SESSION_STORAGE_KEY = 'bwu-remembered-session';

function isRememberedSession(value: unknown): value is RememberedSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RememberedSession).username === 'string' &&
    typeof (value as RememberedSession).personType === 'number' &&
    typeof (value as RememberedSession).personId === 'number'
  );
}

function readRememberedSession(): RememberedSession | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(REMEMBERED_SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRememberedSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeRememberedSession(session: RememberedSession): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REMEMBERED_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // nicht kritisch
  }
}

function clearRememberedSession(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(REMEMBERED_SESSION_STORAGE_KEY);
  } catch {
    // nicht kritisch
  }
}

export interface SessionState {
  status: SessionStatus;
  school: StoredSchool | null;
  /** Der eingegebene Benutzername — für die Profilseite ("Username anzeigen"). */
  username?: string | undefined;
  personType?: PersonType | undefined;
  personId?: number | undefined;
  errorMessage?: string | undefined;
  /** Der aktive Client, sobald angemeldet — für alle weiteren API-Aufrufe der Screens. */
  client: WebUntisClient | null;
  /**
   * `remember`: Identität (nicht Passwort/Session-ID, siehe Datei-Kommentar) dauerhaft in
   * localStorage merken, damit ein Reload/Neustart des Browsers nicht erneut zum Login
   * zwingt — opt-in, siehe Checkbox in LoginScreen.tsx.
   */
  login: (school: StoredSchool, user: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Server hat eine laufende Anfrage mit "nicht angemeldet" abgelehnt (abgelaufene/ungültige
   * Session) — anders als `logout()` OHNE erneuten Logout-Aufruf an den (schon ungültigen)
   * Server, dafür mit Fehlermeldung. Aufgerufen vom globalen QueryCache-Handler, App.tsx.
   */
  sessionExpired: () => void;
}

export interface CreateSessionStoreOptions {
  /**
   * Baut den WebUntisClient für eine Login-Anfrage. Standardmäßig über den Proxy-Pfad
   * (siehe vite.config.ts: `/WebUntis` → echter oder Mock-Server, TESTING.md R1).
   * In Tests überschreibbar, um direkt gegen einen MSW-Mock zu sprechen.
   */
  buildClient?: (school: StoredSchool) => WebUntisClient;
}

function defaultBuildClient(school: StoredSchool): WebUntisClient {
  // Pfad exakt "/WebUntis" (Großschreibung) — muss zum Cookie-Path des echten Servers
  // passen, siehe die ausführliche Begründung in vite.config.ts. "server" wird als Header
  // mitgeschickt (siehe WebUntisClientOptions.targetHost) -- der Produktions-Proxy
  // braucht ihn, um an die richtige Schule weiterzuleiten (IDEEN.md).
  const proxyBase = (import.meta.env['VITE_WEBUNTIS_PROXY_BASE'] as string | undefined) || '/WebUntis';
  return createWebUntisClient({ school: school.loginName, server: school.server, proxyBase });
}

export function createSessionStore(
  options: CreateSessionStoreOptions = {},
): UseBoundStore<StoreApi<SessionState>> {
  const buildClient = options.buildClient ?? defaultBuildClient;

  const rememberedSchool = readStoredSchool();
  const rememberedSession = readRememberedSession();
  // Optimistischer Neustart: nur wenn BEIDES da ist (Schule UND gemerkte Identität) — ob
  // das Browser-Cookie selbst noch gültig ist, kann erst ein echter API-Aufruf zeigen (siehe
  // sessionExpired()). Ein rein lokal "authenticated" ohne funktionierende Session korrigiert
  // sich dadurch spätestens beim ersten Bildschirm von selbst, statt UI dauerhaft falsch zu zeigen.
  const canRestore = rememberedSchool !== null && rememberedSession !== null;

  return create<SessionState>((set, get) => ({
    status: canRestore ? 'authenticated' : 'idle',
    school: rememberedSchool,
    client: canRestore ? buildClient(rememberedSchool) : null,
    username: rememberedSession?.username,
    personType: rememberedSession?.personType,
    personId: rememberedSession?.personId,

    async login(school, user, password, remember) {
      set({ status: 'authenticating', school, errorMessage: undefined });
      writeStoredSchool(school);
      const client = buildClient(school);
      try {
        const result = await api.authenticate(client, { user, password });
        if (remember) {
          writeRememberedSession({ username: user, personType: result.personType, personId: result.personId });
        } else {
          // Ein vorheriges Haekchen gilt nicht automatisch weiter -- jeder Login entscheidet neu.
          clearRememberedSession();
        }
        set({
          status: 'authenticated',
          client,
          username: user,
          personType: result.personType,
          personId: result.personId,
          errorMessage: undefined,
        });
      } catch (error) {
        set({ status: 'error', client: null, errorMessage: describeError(error) });
      }
    },

    async logout() {
      const { client } = get();
      clearRememberedSession();
      if (client !== null) {
        try {
          await api.logout(client);
        } catch {
          // Serverseitiges Abmelden darf das lokale Verwerfen der Session nicht verhindern.
        }
      }
      set({
        status: 'idle',
        client: null,
        username: undefined,
        personType: undefined,
        personId: undefined,
        errorMessage: undefined,
      });
    },

    sessionExpired() {
      clearRememberedSession();
      set({
        status: 'error',
        client: null,
        username: undefined,
        personType: undefined,
        personId: undefined,
        errorMessage: 'Die Sitzung ist abgelaufen. Bitte melde dich erneut an.',
      });
    },
  }));
}

export const useSessionStore = createSessionStore();
