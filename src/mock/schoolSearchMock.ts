/**
 * Simuliert die Schulsuche (siehe api/schoolSearchRest.ts) für `npm run mock` und die
 * MSW-Tests. "Mock-HTL" ist die einzige Schule, gegen die sich mit den Fake-Konten aus
 * accounts.ts wirklich einloggen lässt — die zwei weiteren Einträge dienen nur dazu,
 * "mehrere Treffer" testen zu können (z. B. eine Suche nach "mock").
 *
 * `server`/`loginName` sind frei erfunden, ohne Anspruch, real auflösbar zu sein: im
 * Dev-Proxy (vite.config.ts) geht "/WebUntis/schoolsearch" ohnehin fest an den echten
 * WebUntis-Suchdienst — dieser Mock wird nur von den Vitest/MSW-Tests erreicht.
 */

export interface MockSchoolSearchEntry {
  server: string;
  loginName: string;
  displayName: string;
  address: string;
}

export const MOCK_SCHOOLS: readonly MockSchoolSearchEntry[] = [
  {
    server: 'mock.local',
    loginName: 'mockhtl',
    displayName: 'Mock-HTL',
    address: 'Teststraße 1, 0000 Mockstadt',
  },
  {
    server: 'mock.local',
    loginName: 'mockrealschule',
    displayName: 'Mock-Realschule Steinfeld',
    address: 'Feldweg 9, 1111 Steinfeld',
  },
  {
    server: 'mock.local',
    loginName: 'mockgymnasium',
    displayName: 'Mock-Gymnasium Stadtmitte',
    address: 'Ringstraße 3, 2222 Stadtmitte',
  },
];

/** Suche per Teilstring, case-insensitiv, auf Anzeigename und Adresse — wie beim echten Dienst beobachtet (TESTING.md). */
export function mockSearchSchools(term: string): MockSchoolSearchEntry[] {
  const needle = term.trim().toLowerCase();
  if (needle === '') return [];
  return MOCK_SCHOOLS.filter(
    (school) => school.displayName.toLowerCase().includes(needle) || school.address.toLowerCase().includes(needle),
  );
}
