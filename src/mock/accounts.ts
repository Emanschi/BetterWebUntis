/**
 * Fake-Logins für den Mock-Server.
 *
 * Simuliert zusätzlich unterschiedliche Rechte je Kontotyp (PLAN.md R4: Schüler-Konten
 * haben in der Praxis oft nicht alle Rechte, die die Doku pro Methode verlangt). So lässt
 * sich das Degradieren der UI schon gegen den Mock testen, ohne dass ein echtes Konto ohne
 * Rechte existieren muss.
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
    // Schüler-Konto: hat kein "masterdata students read for all", keine "classregister"-
    // und keine "Student absences"-Rechte — typisch für ein Schüler-Login.
    user: 'mmuster',
    password: 'test1234',
    personType: PersonType.STUDENT,
    personId: 501,
    ownElement: { id: 501, type: ElementType.STUDENT },
    missingRights: [
      'getStudents',
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
