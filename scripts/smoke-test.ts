/**
 * Rauchtest gegen den echten WebUntis-Server: authenticate -> getTimetable -> logout.
 *
 * Zugangsdaten kommen ausschliesslich aus Umgebungsvariablen und werden weder
 * gespeichert noch ausgegeben. Aufruf:
 *
 *   WEBUNTIS_USER='...' WEBUNTIS_PASSWORD='...' npm run smoke
 *
 * Optional:
 *   WEBUNTIS_SERVER (Default htlstp.webuntis.com)
 *   WEBUNTIS_SCHOOL (Default htlstp)
 *
 * Der Test prueft, ob sich der echte Server so verhaelt wie die Doku von 2018 beschreibt,
 * und meldet Abweichungen. Ergebnisse gehoeren nach TESTING.md Abschnitt 3.
 */
import { createWebUntisClient, api, describeError, formatWuDate, formatWuTime, toWuDate, wuWeekRange } from '../src/api/index';

const user = process.env['WEBUNTIS_USER'];
const password = process.env['WEBUNTIS_PASSWORD'];

if (user === undefined || password === undefined) {
  console.error('WEBUNTIS_USER und WEBUNTIS_PASSWORD muessen gesetzt sein.');
  process.exit(2);
}

const client = createWebUntisClient({
  school: process.env['WEBUNTIS_SCHOOL'] ?? 'htlstp',
  server: process.env['WEBUNTIS_SERVER'] ?? 'htlstp.webuntis.com',
});

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  OK  ' : ' ABW. '} ${label}${detail === '' ? '' : ` — ${detail}`}`);
}

try {
  console.log(`Endpunkt: ${client.buildUrl()}\n`);

  // --- 1) authenticate ---------------------------------------------------
  const session = await api.authenticate(client, { user, password });
  check('authenticate liefert eine sessionId', typeof session.sessionId === 'string' && session.sessionId.length > 0);
  check(
    'personType ist 2 (Lehrer) oder 5 (Schueler)',
    session.personType === 2 || session.personType === 5,
    `personType=${session.personType}, personId=${session.personId}`,
  );

  // --- 2) Kontext --------------------------------------------------------
  const schoolyear = await api.getCurrentSchoolyear(client);
  check(
    'getCurrentSchoolyear',
    Number.isInteger(schoolyear.id),
    `${schoolyear.name} (${formatWuDate(schoolyear.startDate)} – ${formatWuDate(schoolyear.endDate)})`,
  );

  const timegrid = await api.getTimegridUnits(client);
  const days = timegrid.map((d) => d.day);
  check(
    'getTimegridUnits: Tagesnummern 1..7 wie im Doku-Fliesstext',
    days.every((d) => d >= 1 && d <= 7),
    `day-Werte: ${days.join(', ')}`,
  );

  // --- 3) eigener Stundenplan (customizable) -----------------------------
  const { startDate, endDate } = wuWeekRange(toWuDate(new Date()));
  const periods = await api.getTimetableCustom(client, {
    element: { id: session.personId, type: session.personType },
    startDate,
    endDate,
    showInfo: true,
    showSubstText: true,
    showLsText: true,
    showStudentgroup: true,
    subjectFields: ['id', 'name', 'longname'],
    teacherFields: ['id', 'name'],
    roomFields: ['id', 'name'],
    klasseFields: ['id', 'name'],
  });
  check(
    'getTimetable (customizable) fuer den eigenen Plan',
    Array.isArray(periods),
    `${periods.length} Perioden vom ${formatWuDate(startDate)} bis ${formatWuDate(endDate)}`,
  );

  const first = periods[0];
  if (first !== undefined) {
    console.log(
      `        Beispiel: ${formatWuDate(first.date)} ${formatWuTime(first.startTime)}-${formatWuTime(first.endTime)} ` +
        `${first.su?.[0]?.name ?? '?'} / ${first.ro?.[0]?.name ?? '?'}${first.code === undefined ? '' : ` [${first.code}]`}`,
    );
    check('benannte Felder kommen an (subjectFields)', first.su?.[0]?.name !== undefined);
  }

  // --- 4) Rechte-Check: was darf dieses Konto? ---------------------------
  console.log('\nRechte dieses Kontos:');
  const optional: Array<[string, () => Promise<unknown>]> = [
    ['getKlassen', () => api.getKlassen(client)],
    ['getSubjects', () => api.getSubjects(client)],
    ['getRooms', () => api.getRooms(client)],
    ['getTeachers', () => api.getTeachers(client)],
    ['getStudents', () => api.getStudents(client)],
    ['getDepartments', () => api.getDepartments(client)],
    ['getHolidays', () => api.getHolidays(client)],
    ['getStatusData', () => api.getStatusData(client)],
    ['getExamTypes', () => api.getExamTypes(client)],
    ['getSubstitutions', () => api.getSubstitutions(client, { startDate, endDate, departmentId: 0 })],
    ['getTimetableWithAbsences', () => api.getTimetableWithAbsences(client, { startDate, endDate })],
    ['getClassregCategories', () => api.getClassregCategories(client)],
    ['getLatestImportTime', () => api.getLatestImportTime(client)],
  ];
  for (const [name, call] of optional) {
    try {
      const result = await call();
      const size = Array.isArray(result) ? `${result.length} Eintraege` : typeof result;
      console.log(`  JA   ${name} — ${size}`);
    } catch (error) {
      console.log(`  NEIN ${name} — ${describeError(error)}`);
    }
  }

  // --- 5) logout ---------------------------------------------------------
  await api.logout(client);
  check('\nlogout', !client.isAuthenticated);
  process.exit(0);
} catch (error) {
  console.error(`\nFEHLGESCHLAGEN: ${describeError(error)}`);
  try {
    await api.logout(client);
  } catch {
    // Aufraeumen darf den eigentlichen Fehler nicht verdecken.
  }
  process.exit(1);
}
