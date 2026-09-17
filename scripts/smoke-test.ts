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
import {
  createWebUntisClient,
  api,
  addWuDays,
  describeError,
  formatWuDate,
  formatWuTime,
  toWuDate,
  wuWeekRange,
  WebUntisRpcError,
} from '../src/api/index';

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
    showBooking: true,
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

  // showBooking (Doku Abschnitt 15) — ungeprueft, ob diese Schule das ueberhaupt befuellt.
  const withBooking = periods.filter((p) => p.bkText !== undefined || p.bkRemark !== undefined);
  console.log(`        showBooking: ${withBooking.length} von ${periods.length} Perioden mit bkText/bkRemark`);
  for (const p of withBooking.slice(0, 3)) {
    console.log(`          ${formatWuDate(p.date)} ${formatWuTime(p.startTime)} — bkText="${p.bkText ?? ''}" bkRemark="${p.bkRemark ?? ''}"`);
  }

  // --- 4) Rechte-Check: was darf dieses Konto? ---------------------------
  // Wichtig: hier steht jetzt der rohe Fehlercode dabei, nicht nur OK/NEIN.
  // Grund: "NEIN" allein sagt nicht, ob es wirklich ein Rechte-Fehler war
  // (Code -8509) oder etwas anderes (z. B. ungueltige Parameter) — das wurde
  // beim ersten Durchlauf (M10) nicht unterschieden.
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
    // Nie gemessen (Luecke, gefunden 2026-09-17): mock/accounts.ts nimmt seit M3 an, dass
    // Schueler-Konten hier kein Recht haben (PLAN.md R4), aber das war nie am echten Server
    // verifiziert wie die anderen Zeilen hier. Relevant fuer "Lehrstoff/Notizen pro Stunde" —
    // die naheliegende WebUntis-Antwort darauf ist das Klassenbuch (Doku Abschnitt 20), nicht
    // ein Feld am Stundenplan selbst. Siehe IDEEN.md.
    ['getClassregEvents', () => api.getClassregEvents(client, { startDate, endDate })],
    ['getLatestImportTime', () => api.getLatestImportTime(client)],
  ];
  for (const [name, call] of optional) {
    try {
      const result = await call();
      const size = Array.isArray(result) ? `${result.length} Eintraege` : typeof result;
      console.log(`  JA   ${name} — ${size}`);
    } catch (error) {
      const code = error instanceof WebUntisRpcError ? ` [Code ${error.code}]` : '';
      console.log(`  NEIN ${name}${code} — ${describeError(error)}`);
    }
  }

  // --- 4b) getExams direkt probieren -------------------------------------
  // getExamTypes ("examtypes read") und getExams ("examinations read") sind
  // laut Doku ZWEI verschiedene Rechte. Der erste Durchlauf (M10) hat nur
  // getExamTypes getestet und daraus geschlossen, dass Pruefungen fuer dieses
  // Konto generell nicht gehen — das war ein Fehlschluss, siehe IDEEN.md B3.
  // Die original WebUntis-Weboberflaeche zeigt Pruefungen fuer genau dieses
  // Konto an, das Recht muss also irgendwie vorhanden sein. Da getExamTypes
  // (zum Ermitteln gueltiger IDs) fehlt, wird hier einfach eine Handvoll
  // ueblicher IDs durchprobiert.
  console.log('\ngetExams direkt (ohne getExamTypes), IDs 1..10 durchprobiert:');
  let anyExamTypeWorked = false;
  for (let examTypeId = 1; examTypeId <= 10; examTypeId += 1) {
    try {
      const exams = await api.getExams(client, { examTypeId, startDate: addWuDays(startDate, -180), endDate: addWuDays(endDate, 180) });
      console.log(`  JA   examTypeId=${examTypeId} — ${exams.length} Eintraege`);
      anyExamTypeWorked = true;
    } catch (error) {
      const code = error instanceof WebUntisRpcError ? error.code : undefined;
      // Bei "ungueltige examTypeId" antwortet der Server vermutlich anders als
      // bei "kein Recht" — beides wird hier sichtbar, nicht verschluckt.
      console.log(`  NEIN examTypeId=${examTypeId} — ${describeError(error)}${code === undefined ? '' : ` [Code ${code}]`}`);
    }
  }
  if (!anyExamTypeWorked) {
    console.log('  -> keine der IDs 1..10 hat funktioniert. Entweder ist die Liste zu kurz,');
    console.log('     oder "examinations read" fehlt diesem Konto tatsaechlich auch.');
  }

  // --- 4c) Diagnose: wie markiert der echte Server Pruefungsstunden? -----
  // ExamsScreen.tsx geht davon aus, dass Pruefungsstunden lstype "ex" haben (Doku
  // Abschnitt 14/15) — das war eine Vermutung, keine Messung. Nutzer-Test zeigt: der
  // Pruefungen-Screen findet nichts, obwohl laut Original-App am 18.09.2026, 12:20-13:10
  // (Fach NW2) eine Pruefung stattfindet. Dieser Block laedt das ganze aktuelle Schuljahr
  // (wie ExamsScreen.tsx) und prueft, ob/wie sich diese Stunde von einer normalen
  // unterscheidet — Ergebnis gehoert nach TESTING.md / IDEEN.md B3.
  console.log('\nDiagnose: Pruefungs-Markierung im Stundenplan (ganzes Schuljahr geladen)');
  const yearPeriods = await api.getTimetableCustom(client, {
    element: { id: session.personId, type: session.personType },
    startDate: schoolyear.startDate,
    endDate: schoolyear.endDate,
    showInfo: true,
    showSubstText: true,
    showLsText: true,
    showLsNumber: true,
    showStudentgroup: true,
    subjectFields: ['id', 'name', 'longname'],
    teacherFields: ['id', 'name'],
    roomFields: ['id', 'name'],
    klasseFields: ['id', 'name'],
  });
  console.log(`  ${yearPeriods.length} Perioden im ganzen Schuljahr geladen.`);

  const countBy = (values: Array<string | undefined>) => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v ?? '(leer)', (counts.get(v ?? '(leer)') ?? 0) + 1);
    return Object.fromEntries(counts);
  };
  console.log('  lstype-Verteilung:', countBy(yearPeriods.map((p) => p.lstype)));
  console.log('  code-Verteilung:', countBy(yearPeriods.map((p) => p.code)));
  console.log('  activityType-Verteilung:', countBy(yearPeriods.map((p) => p.activityType)));

  // Bekannter Pruefungstermin aus der Original-App (Screenshot): 18.09.2026, 12:20-13:10, Fach NW2.
  const known = yearPeriods.filter((p) => p.date === 20260918 && p.startTime >= 1150 && p.startTime <= 1230);
  if (known.length === 0) {
    console.log('  -> Der bekannte Termin (18.09.2026, ~12:20) taucht in getTimetable GAR NICHT auf.');
    console.log('     Moegliche Erklaerung: die Pruefung ist keine normale Timetable-Periode, sondern');
    console.log('     kommt aus einer separaten Quelle (z. B. der neueren REST-API), die getTimetable');
    console.log('     gar nicht sieht. Naechster Schritt waere dann eine Grundsatzentscheidung ueber');
    console.log('     undokumentierte Endpunkte (siehe IDEEN.md A1), kein reiner Code-Fix mehr.');
  } else {
    console.log(`  Gefunden (${known.length}x) — volle Rohdaten:`);
    for (const p of known) console.log('   ', JSON.stringify(p));
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
