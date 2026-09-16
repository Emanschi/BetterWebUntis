/**
 * Fake-Logins für den Mock-Server.
 *
 * Simuliert zusätzlich unterschiedliche Rechte je Kontotyp (PLAN.md R4: Schüler-Konten
 * haben in der Praxis oft nicht alle Rechte, die die Doku pro Methode verlangt). So lässt
 * sich das Degradieren der UI schon gegen den Mock testen, ohne dass ein echtes Konto ohne
 * Rechte existieren muss.
 *
 * Die Rechte des Schüler-Kontos sind seit M10 kein Vorabraten mehr, sondern 1:1 das
 * Ergebnis des Smoke-Tests gegen ein echtes Schüler-Konto an htlstp.webuntis.com
 * (siehe TESTING.md, Abschnitt 3) — inklusive zweier Überraschungen gegenüber der
 * ursprünglichen Annahme: ein Schüler-Konto darf real weder `getTeachers` noch
 * `getExamTypes` aufrufen.
 */

import { ElementType, PersonType, type ElementType as ElementTypeT } from '../api/types';

export interface MockAccount {
  user: string;
  password: string;
  personType: (typeof PersonType)[keyof typeof PersonType];
  personId: number;
  /** Für getTimetable: welches Element repräsentiert dieses Konto. */
  ownElement: { id: number; type: ElementTypeT };
  /** Methoden, für die dieses Konto laut Doku-Rechtespalte kein Recht hat. */
  missingRights: readonly string[];
}

export const ACCOUNTS: readonly MockAccount[] = [
  {
    // Schüler-Konto — Rechte 1:1 aus dem echten Smoke-Test uebernommen (siehe oben).
    user: 'mmuster',
    password: 'test1234',
    personType: PersonType.STUDENT,
    personId: 501,
    ownElement: { id: 501, type: ElementType.STUDENT },
    missingRights: [
      'getTeachers', // real bestaetigt: Schueler duerfen keine Lehrerliste abrufen
      'getStudents',
      'getExamTypes', // real bestaetigt: damit ist getExams fuer Schueler faktisch nicht nutzbar
      'getSubstitutions',
      'getTimetableWithAbsences',
      'getClassregEvents',
      'getClassregCategories',
      'getClassregCategoryGroups',
    ],
  },
  {
    // Lehrer-Konto: breitere Rechte, wie in der Doku für Lehrpersonal vorgesehen.
    user: 'aschmidt',
    password: 'test1234',
    personType: PersonType.TEACHER,
    personId: 11,
    ownElement: { id: 11, type: ElementType.TEACHER },
    missingRights: [],
  },
];

export function findAccount(user: string, password: string): MockAccount | undefined {
  return ACCOUNTS.find((account) => account.user === user && account.password === password);
}
