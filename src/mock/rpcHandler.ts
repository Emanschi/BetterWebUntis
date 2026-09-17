/**
 * Transport-unabhängiger JSON-RPC-Dispatcher für den Mock-Server.
 *
 * Wird sowohl vom Node-Standalone-Server (`server.ts`, für manuelles Testen/`npm run mock`)
 * als auch von den MSW-Handlern (`msw/handlers.ts`, für Komponenten-/Integrationstests)
 * verwendet — einmal implementiert, zwei Transporte. So kann sich keine der beiden
 * Verpackungen fachlich vom Verhalten des jeweils anderen unterscheiden.
 *
 * Fehlercodes werden bewusst aus `api/errors.ts` wiederverwendet statt neu erfunden —
 * der Mock-Server soll sich so verhalten, wie unser eigener Client Fehler interpretiert.
 */

import { toWuDate } from '../api/format';
import { JsonRpcErrorCode, WebUntisErrorCode, type JsonRpcErrorPayload } from '../api/errors';
import { ElementType, type WuDate } from '../api/types';
import { findAccount, type MockAccount } from './accounts';
import {
  CLASSREG_CATEGORIES,
  CLASSREG_CATEGORY_GROUPS,
  CURRENT_SCHOOLYEAR,
  DEPARTMENTS,
  EXAM_TYPES,
  HOLIDAYS,
  KLASSEN,
  LATEST_IMPORT_TIME,
  ROOMS,
  SCHOOLYEARS,
  STATUS_DATA,
  STUDENTS,
  SUBJECTS,
  TEACHERS,
  TIMEGRID,
} from './schoolData';
import { mockAbsences } from './absences';
import { mockClassregEvents } from './classreg';
import {
  mockExams,
  mockSubstitutions,
  rawPeriodsForElement,
  toCustomPeriod,
  toSimplePeriod,
  type MockElement,
  type RenderOptions,
} from './timetable';

// ---------------------------------------------------------------------------
// Session-Zustand
// ---------------------------------------------------------------------------

export interface MockSession {
  sessionId: string;
  account: MockAccount;
}

export interface MockServerState {
  sessions: Map<string, MockSession>;
}

export function createMockState(): MockServerState {
  return { sessions: new Map() };
}

function generateSessionId(): string {
  // Rein kosmetisch an das Format des echten Servers angelehnt (32 Hex-Zeichen),
  // keine kryptographische Anforderung — das ist ein Mock.
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16))
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Request/Response
// ---------------------------------------------------------------------------

export interface RpcCall {
  id: string;
  method: string;
  params: unknown;
}

export interface RpcOutcome {
  envelope: { jsonrpc: '2.0'; id: string; result: unknown } | { jsonrpc: '2.0'; id: string; error: JsonRpcErrorPayload };
  /**
   * Wie der Transport-Layer die Session danach behandeln soll:
   *   undefined → unverändert
   *   Session   → diese Session ab jetzt verwenden (nach erfolgreichem authenticate)
   *   null      → Session beenden (nach logout)
   */
  session?: MockSession | null;
}

function ok(id: string, result: unknown): RpcOutcome {
  return { envelope: { jsonrpc: '2.0', id, result } };
}

function fail(id: string, code: number, message: string): RpcOutcome {
  return { envelope: { jsonrpc: '2.0', id, error: { code, message } } };
}

/** Datum von heute (Systemzeit), falls startDate/endDate fehlen — Doku: "default: actual date". */
function today(): WuDate {
  return toWuDate(new Date());
}

function asWuDate(value: unknown, fallback: WuDate): WuDate {
  return typeof value === 'number' ? value : fallback;
}

function asElement(value: unknown): MockElement | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  if ((typeof obj['id'] !== 'number' && typeof obj['id'] !== 'string') || typeof obj['type'] !== 'number') {
    return undefined;
  }
  return { id: obj['id'], type: obj['type'] as MockElement['type'] };
}

/**
 * Gemessen am echten Server (2026-09-17, siehe TESTING.md): `getTimetable` lehnt einen
 * Zeitraum ab, der nicht komplett in einem einzigen Schuljahr liegt (Code -8507). Nur für
 * `getTimetable` nachgebildet, weil nur dort gemessen — ob dieselbe Regel auch für andere
 * Methoden mit Zeitraum gilt (`getSubstitutions`, `getExams`, `getTimetableWithAbsences`),
 * ist unbekannt und wird nicht angenommen.
 */
function withinSingleSchoolyear(startDate: WuDate, endDate: WuDate): boolean {
  return SCHOOLYEARS.some((year) => startDate >= year.startDate && endDate <= year.endDate);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function handleRpc(state: MockServerState, currentSessionId: string | undefined, call: RpcCall): RpcOutcome {
  const { id, method, params } = call;
  const p = (typeof params === 'object' && params !== null ? params : {}) as Record<string, unknown>;

  if (method === 'authenticate') {
    const user = typeof p['user'] === 'string' ? p['user'] : undefined;
    const password = typeof p['password'] === 'string' ? p['password'] : undefined;
    const account = user !== undefined && password !== undefined ? findAccount(user, password) : undefined;
    if (account === undefined) {
      return fail(id, WebUntisErrorCode.BAD_CREDENTIALS, 'bad credentials');
    }
    const session: MockSession = { sessionId: generateSessionId(), account };
    return {
      envelope: {
        jsonrpc: '2.0',
        id,
        result: { sessionId: session.sessionId, personType: account.personType, personId: account.personId },
      },
      session,
    };
  }

  // Alle weiteren Methoden brauchen eine gültige Session (Doku Abschnitt 1).
  const session = currentSessionId === undefined ? undefined : state.sessions.get(currentSessionId);
  if (session === undefined) {
    return fail(id, WebUntisErrorCode.NOT_AUTHENTICATED, 'not authenticated');
  }

  if (method === 'logout') {
    return { ...ok(id, {}), session: null };
  }

  // Rechte-Simulation für PLAN.md R4 — bevor überhaupt Daten gebaut werden.
  if (session.account.missingRights.includes(method)) {
    return fail(id, WebUntisErrorCode.NO_RIGHT_FOR_METHOD, `no right for ${method}`);
  }

  switch (method) {
    case 'getTeachers':
      return ok(id, TEACHERS);
    case 'getStudents':
      return ok(id, STUDENTS);
    case 'getKlassen':
      return ok(id, KLASSEN);
    case 'getSubjects':
      return ok(id, SUBJECTS);
    case 'getRooms':
      return ok(id, ROOMS);
    case 'getDepartments':
      return ok(id, DEPARTMENTS);
    case 'getHolidays':
      return ok(id, HOLIDAYS);
    case 'getTimegridUnits':
      return ok(id, TIMEGRID);
    case 'getStatusData':
      return ok(id, STATUS_DATA);
    case 'getCurrentSchoolyear':
      return ok(id, [CURRENT_SCHOOLYEAR]); // Doku-Beispiel zeigt ein Array mit einem Element
    case 'getSchoolyears':
      return ok(id, SCHOOLYEARS);
    case 'getLatestImportTime':
      return ok(id, LATEST_IMPORT_TIME);
    case 'getExamTypes':
      return ok(id, EXAM_TYPES);
    case 'getClassregCategories':
      return ok(id, CLASSREG_CATEGORIES);
    case 'getClassregCategoryGroups':
      return ok(id, CLASSREG_CATEGORY_GROUPS);

    case 'getPersonId': {
      const sn = typeof p['sn'] === 'string' ? p['sn'] : '';
      const fn = typeof p['fn'] === 'string' ? p['fn'] : '';
      const type = p['type'];
      const pool = type === 2 ? TEACHERS : type === 5 ? STUDENTS : [];
      const match =
        type === 2
          ? (pool as typeof TEACHERS).find((t) => t.longName === sn && t.foreName === fn)
          : (pool as typeof STUDENTS).find((s) => s.longName === sn && s.foreName === fn);
      return ok(id, match?.id ?? 0);
    }

    case 'getTimetable': {
      const optionsRaw = p['options'];
      if (typeof optionsRaw === 'object' && optionsRaw !== null) {
        // Customizable-Variante (Doku Abschnitt 15)
        const options = optionsRaw as Record<string, unknown>;
        const element = asElement(options['element']);
        if (element === undefined) return fail(id, JsonRpcErrorCode.INVALID_PARAMS, 'element fehlt oder ungueltig');
        const startDate = asWuDate(options['startDate'], today());
        const endDate = asWuDate(options['endDate'], today());
        if (!withinSingleSchoolyear(startDate, endDate)) {
          return fail(id, WebUntisErrorCode.NOT_WITHIN_SINGLE_SCHOOLYEAR, 'startDate and endDate are not within a single school year');
        }
        const renderOptions: RenderOptions = {
          showInfo: options['showInfo'] as boolean | undefined,
          showSubstText: options['showSubstText'] as boolean | undefined,
          showLsText: options['showLsText'] as boolean | undefined,
          showLsNumber: options['showLsNumber'] as boolean | undefined,
          showStudentgroup: options['showStudentgroup'] as boolean | undefined,
          showBooking: options['showBooking'] as boolean | undefined,
          klasseFields: options['klasseFields'] as RenderOptions['klasseFields'],
          roomFields: options['roomFields'] as RenderOptions['roomFields'],
          subjectFields: options['subjectFields'] as RenderOptions['subjectFields'],
          teacherFields: options['teacherFields'] as RenderOptions['teacherFields'],
        };
        const raw = rawPeriodsForElement(element, startDate, endDate);
        return ok(id, raw.map((r) => toCustomPeriod(r, renderOptions)));
      }
      // Einfache Variante (Doku Abschnitt 14)
      const element = asElement({ id: p['id'], type: p['type'] });
      if (element === undefined) return fail(id, JsonRpcErrorCode.INVALID_PARAMS, 'id/type fehlt oder ungueltig');
      const startDate = asWuDate(p['startDate'], today());
      const endDate = asWuDate(p['endDate'], today());
      if (!withinSingleSchoolyear(startDate, endDate)) {
        return fail(id, WebUntisErrorCode.NOT_WITHIN_SINGLE_SCHOOLYEAR, 'startDate and endDate are not within a single school year');
      }
      const raw = rawPeriodsForElement(element, startDate, endDate);
      return ok(id, raw.map(toSimplePeriod));
    }

    case 'getSubstitutions': {
      const startDate = asWuDate(p['startDate'], today());
      const endDate = asWuDate(p['endDate'], today());
      return ok(id, mockSubstitutions(startDate, endDate));
    }

    case 'getExams': {
      const examTypeId = typeof p['examTypeId'] === 'number' ? p['examTypeId'] : Number(p['examTypeId']);
      const startDate = asWuDate(p['startDate'], today());
      const endDate = asWuDate(p['endDate'], today());
      return ok(id, mockExams(examTypeId, startDate, endDate));
    }

    case 'getTimetableWithAbsences': {
      const options = (p['options'] as Record<string, unknown> | undefined) ?? {};
      const startDate = asWuDate(options['startDate'], today());
      const endDate = asWuDate(options['endDate'], today());
      return ok(id, { periodsWithAbsences: mockAbsences(startDate, endDate) });
    }

    case 'getClassregEvents': {
      // Deckt sowohl die globale (Abschnitt 20) als auch die Element-Variante (Abschnitt 26) ab —
      // der Mock filtert im Element-Fall nicht nach Klasse/Student, da es hier nur eine Testklasse gibt.
      const options = p['options'] as Record<string, unknown> | undefined;
      const startDate = asWuDate(options?.['startDate'] ?? p['startDate'], today());
      const endDate = asWuDate(options?.['endDate'] ?? p['endDate'], today());
      return ok(id, mockClassregEvents(startDate, endDate));
    }

    default:
      return fail(id, JsonRpcErrorCode.METHOD_NOT_FOUND, `Methode "${method}" ist nicht implementiert`);
  }
}

export { ElementType };
