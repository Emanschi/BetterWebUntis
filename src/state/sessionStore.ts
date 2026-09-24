/**
 * Verwaltet die WebUntis-Session als React-State.
 *
 * Bewusste Sicherheitsentscheidung (Projektauftrag Abschnitt "Keine eigene
 * Nutzerverwaltung"): Die Session lebt **ausschließlich im Speicher**. Weder Passwort
 * noch sessionId werden in localStorage/sessionStorage persistiert — nach einem
 * Seiten-Reload ist man abgemeldet und muss sich neu einloggen. Das ist die sicherste
 * Grundeinstellung ("nicht im Klartext persistieren, wo vermeidbar"); eine spätere,
 * bewusst abgewogene Persistenz (z. B. sessionId in sessionStorage, tab-gebunden) ist
 * eine offene Idee, siehe IDEEN.md.
 *
 * Nur die aufgelöste Schule wird gemerkt (unproblematisch, kein Geheimnis) — Komfort für
 * den nächsten Login, siehe `SCHOOL_STORAGE_KEY`. Seit der Schulsuche (IDEEN.md) ist das
 * ein Objekt inkl. Server-Hostname, nicht mehr nur ein Name — ein Login braucht seither
 * beides (siehe `StoredSchool`, `defaultBuildClient`).
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
  login: (school: StoredSchool, user: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  return create<SessionState>((set, get) => ({
    status: 'idle',
    school: readStoredSchool(),
    client: null,

    async login(school, user, password) {
      set({ status: 'authenticating', school, errorMessage: undefined });
      writeStoredSchool(school);
      const client = buildClient(school);
      try {
        const result = await api.authenticate(client, { user, password });
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
  }));
}

export const useSessionStore = createSessionStore();
