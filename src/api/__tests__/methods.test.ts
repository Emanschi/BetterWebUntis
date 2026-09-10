/**
 * Jede dokumentierte Methode wird gegen das Beispiel-Response der Doku geprüft:
 * einmal der gesendete Request (heisst die Methode richtig? stimmen die Parameter?)
 * und einmal das geparste Ergebnis.
 */
import { describe, expect, it } from 'vitest';
import * as api from '../methods';
import { ElementType, PersonType } from '../types';
import { makeClient } from './helpers';

describe('1) authenticate', () => {
  it('sendet user, password und die Client-Kennung', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('authenticate.json');

    await api.authenticate(client, { user: 'ANDROID', password: 'PASSWORD' });

    const payload = transport.lastPayload();
    expect(payload.method).toBe('authenticate');
    expect(payload.params).toEqual({
      user: 'ANDROID',
      password: 'PASSWORD',
      client: 'BetterWebUntis-Test',
    });
  });

  it('liefert sessionId, personType und personId', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('authenticate.json');

    const result = await api.authenticate(client, { user: 'u', password: 'p' });

    expect(result).toEqual({
      sessionId: '644AFBF2C1B592B68C6B04938BD26965',
      personType: PersonType.TEACHER,
      personId: 17,
    });
    expect(client.session).toEqual(result);
  });
});

describe('2) logout', () => {
  it('ruft logout mit leeren Parametern auf', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":{}}');

    await api.logout(client);

    expect(transport.lastPayload().method).toBe('logout');
    expect(transport.lastPayload().params).toEqual({});
  });
});

describe('3-8) Stammdaten', () => {
  it('getTeachers', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTeachers.json');

    const teachers = await api.getTeachers(client);

    expect(transport.lastPayload().method).toBe('getTeachers');
    expect(teachers).toHaveLength(2);
    expect(teachers[0]).toEqual({
      id: 1,
      name: 'Bach',
      foreName: 'Ingeborg',
      longName: 'Bachmann',
      foreColor: '000000',
      backColor: '000000',
    });
  });

  it('getStudents', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getStudents.json');

    const students = await api.getStudents(client);

    expect(students[0]?.key).toBe('1234567');
    expect(students[0]?.longName).toBe('Müller');
    expect(students[1]?.gender).toBe('female');
  });

  it('getKlassen ohne schoolyearId nimmt das aktuelle Schuljahr', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getKlassen.json');

    await api.getKlassen(client);

    expect(transport.lastPayload().params).toEqual({});
  });

  it('getKlassen reicht schoolyearId durch', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getKlassen.json');

    const klassen = await api.getKlassen(client, 10);

    expect(transport.lastPayload().params).toEqual({ schoolyearId: 10 });
    expect(klassen[0]).toMatchObject({ id: 71, name: '1A', longName: 'Klasse 1A', did: 2 });
    expect(klassen[1]).toMatchObject({ teacher1: 17, teacher2: 21 });
    // did fehlt beim zweiten Eintrag — optionale Felder duerfen fehlen
    expect(klassen[1]?.did).toBeUndefined();
  });

  it('getSubjects', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSubjects.json');

    const subjects = await api.getSubjects(client);

    expect(subjects[0]).toMatchObject({ id: 1, name: 'RK', longName: 'Kath.Religion' });
  });

  it('getRooms', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getRooms.json');

    const rooms = await api.getRooms(client);

    expect(rooms[0]).toMatchObject({ id: 1, name: 'R1A', longName: '1A' });
  });

  it('getDepartments', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getDepartments.json');

    const departments = await api.getDepartments(client);

    expect(departments).toEqual([
      { id: 1, name: 'A1', longName: 'AAA1' },
      { id: 2, name: 'A2', longName: 'AAA2' },
    ]);
  });
});

describe('9-13) Kalender, Raster, Status, Schuljahre', () => {
  it('getHolidays', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getHolidays.json');

    const holidays = await api.getHolidays(client);

    expect(holidays[0]).toEqual({
      id: 44,
      name: 'Natio',
      longName: 'Nationalfeiertag',
      startDate: 20101026,
      endDate: 20101026,
    });
  });

  it('getTimegridUnits', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimegridUnits.json');

    const grid = await api.getTimegridUnits(client);

    expect(grid[0]?.day).toBe(1);
    expect(grid[0]?.timeUnits[0]).toEqual({ startTime: 800, endTime: 850 });
    expect(grid[0]?.timeUnits).toHaveLength(3);
  });

  it('getStatusData liefert Arrays von Ein-Schluessel-Objekten', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getStatusData.json');

    const status = await api.getStatusData(client);

    expect(status.lstypes).toHaveLength(5);
    expect(status.lstypes[0]).toEqual({ ls: { foreColor: '000000', backColor: 'ee7f00' } });
    expect(status.codes[0]).toEqual({ cancelled: { foreColor: '000000', backColor: 'b1b3b4' } });
  });

  it('getCurrentSchoolyear packt das Array der Doku aus', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getCurrentSchoolyear.json');

    const year = await api.getCurrentSchoolyear(client);

    expect(year).toEqual({ id: 10, name: '2010/2011', startDate: 20100830, endDate: 20110731 });
  });

  it('getCurrentSchoolyear vertraegt auch ein direktes Objekt', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":{"id":10,"name":"2010/2011","startDate":20100830,"endDate":20110731}}');

    const year = await api.getCurrentSchoolyear(client);

    expect(year.id).toBe(10);
  });

  it('getCurrentSchoolyear meldet ein leeres Array als Fehler', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[]}');

    await expect(api.getCurrentSchoolyear(client)).rejects.toThrow(/leeres Array/);
  });

  it('getSchoolyears', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSchoolyears.json');

    const years = await api.getSchoolyears(client);

    expect(years).toHaveLength(2);
    expect(years[1]?.name).toBe('2011/2012');
  });
});

describe('14) getTimetable (simple)', () => {
  it('sendet id und type, laesst optionale Datumsangaben weg', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetable-simple.json');

    await api.getTimetable(client, { id: 71, type: ElementType.KLASSE });

    expect(transport.lastPayload().params).toEqual({ id: 71, type: 1 });
  });

  it('reicht startDate und endDate durch', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetable-simple.json');

    await api.getTimetable(client, {
      id: 71,
      type: ElementType.KLASSE,
      startDate: 20110117,
      endDate: 20110121,
    });

    expect(transport.lastPayload().params).toEqual({
      id: 71,
      type: 1,
      startDate: 20110117,
      endDate: 20110121,
    });
  });

  it('parst die Perioden aus dem Doku-Beispiel', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetable-simple.json');

    const periods = await api.getTimetable(client, { id: 71, type: ElementType.KLASSE });

    expect(periods).toHaveLength(2);
    expect(periods[0]).toEqual({
      id: 125043,
      date: 20110117,
      startTime: 800,
      endTime: 850,
      kl: [{ id: 71 }],
      te: [{ id: 23 }],
      su: [{ id: 13 }],
      ro: [{ id: 1 }],
    });
    // lstype und code fehlen bei normalen Stunden — genau so steht es in der Doku
    expect(periods[0]?.lstype).toBeUndefined();
    expect(periods[0]?.code).toBeUndefined();
  });
});

describe('15) getTimetable (customizable)', () => {
  it('verpackt alles in options.element wie im Doku-Beispiel', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetable-custom.json');

    await api.getTimetableCustom(client, {
      element: { id: '1a_ext', type: ElementType.KLASSE, keyType: 'externalkey' },
      showStudentgroup: true,
      showLsText: true,
      showLsNumber: true,
      showInfo: true,
      klasseFields: ['id', 'name', 'longname', 'externalkey'],
      teacherFields: ['id', 'name'],
    });

    expect(transport.lastPayload().params).toEqual({
      options: {
        element: { id: '1a_ext', type: 1, keyType: 'externalkey' },
        showStudentgroup: true,
        showLsText: true,
        showLsNumber: true,
        showInfo: true,
        klasseFields: ['id', 'name', 'longname', 'externalkey'],
        teacherFields: ['id', 'name'],
      },
    });
  });

  it('laesst nicht gesetzte Optionen komplett weg', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetable-custom.json');

    await api.getTimetableCustom(client, {
      element: { id: 71, type: ElementType.KLASSE },
    });

    expect(transport.lastPayload().params).toEqual({ options: { element: { id: 71, type: 1 } } });
  });

  it('parst die Zusatzfelder der customizable Variante', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetable-custom.json');

    const periods = await api.getTimetableCustom(client, {
      element: { id: '1a_ext', type: ElementType.KLASSE, keyType: 'externalkey' },
    });

    const period = periods[0];
    expect(period?.id).toBe(74);
    expect(period?.lsnumber).toBe(700);
    expect(period?.statflags).toBe('@');
    expect(period?.lstext).toBe('Sample Lesson Text.');
    expect(period?.info).toBe('Sample Period Info as entered in WebUntis');
    expect(period?.sg).toBe('Rel_1a');
    expect(period?.kl?.[0]).toEqual({
      id: 1,
      name: '1a',
      longname: 'Klasse 1a (Gauss)',
      externalkey: '1a_ext',
    });
    // teacherFields war ["id","name"] — longname darf fehlen
    expect(period?.te?.[0]).toEqual({ id: 7, name: 'Nobel' });
    // su und ro ohne *Fields liefern nur die id
    expect(period?.su?.[0]).toEqual({ id: 3 });
  });
});

describe('17/18) Import-Zeit und Personensuche', () => {
  it('getLatestImportTime reicht den Timestamp unveraendert durch', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":1536825600000}');

    await expect(api.getLatestImportTime(client)).resolves.toBe(1536825600000);
  });

  it('getPersonId sendet die Doku-Parameter', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":0}');

    const id = await api.getPersonId(client, {
      sn: 'Talisker',
      dob: 0,
      type: PersonType.STUDENT,
      fn: 'James',
    });

    expect(transport.lastPayload().params).toEqual({ type: 5, sn: 'Talisker', fn: 'James', dob: 0 });
    expect(id).toBe(0);
  });
});

describe('19) getSubstitutions', () => {
  it('sendet startDate, endDate und das pflichtige departmentId', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSubstitutions.json');

    await api.getSubstitutions(client, {
      startDate: 20111107,
      endDate: 20111116,
      departmentId: 0,
    });

    expect(transport.lastPayload().params).toEqual({
      startDate: 20111107,
      endDate: 20111116,
      departmentId: 0,
    });
  });

  it('parst alle Vertretungsarten aus dem Doku-Beispiel', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSubstitutions.json');

    const subs = await api.getSubstitutions(client, {
      startDate: 20111107,
      endDate: 20111116,
      departmentId: 0,
    });

    expect(subs.map((s) => s.type)).toEqual([
      'cancel',
      'add',
      'shift',
      'cancel',
      'cancel',
      'subst',
      'rmchg',
    ]);
  });

  it('liest reschedule bei shift und cancel', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSubstitutions.json');

    const subs = await api.getSubstitutions(client, {
      startDate: 20111107,
      endDate: 20111116,
      departmentId: 0,
    });

    const shifted = subs.find((s) => s.type === 'shift');
    expect(shifted?.lsid).toBe(3087);
    // shift: Datum/Zeit der urspruenglichen Periode
    expect(shifted?.reschedule).toEqual({ date: 20111115, startTime: 1155, endTime: 1245 });
  });

  it('liest orgid beim Lehrertausch und beim Raumwechsel', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSubstitutions.json');

    const subs = await api.getSubstitutions(client, {
      startDate: 20111107,
      endDate: 20111116,
      departmentId: 0,
    });

    const subst = subs.find((s) => s.type === 'subst');
    expect(subst?.te?.[0]).toEqual({ id: 36, orgid: 5 });

    const roomChange = subs.find((s) => s.type === 'rmchg');
    expect(roomChange?.ro?.[0]).toEqual({ id: 39, orgid: 26 });
    expect(roomChange?.txt).toBe('Raumänderung');
    expect(roomChange?.kl).toHaveLength(2);
  });

  it('vertraegt ein leeres Raum-Array', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getSubstitutions.json');

    const subs = await api.getSubstitutions(client, {
      startDate: 20111107,
      endDate: 20111116,
      departmentId: 0,
    });

    expect(subs.find((s) => s.type === 'add')?.ro).toEqual([]);
  });
});

describe('20/26) getClassregEvents', () => {
  it('globale Variante sendet nur den Zeitraum', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getClassregEvents.json');

    const events = await api.getClassregEvents(client, { startDate: 20121018, endDate: 20121018 });

    expect(transport.lastPayload().params).toEqual({ startDate: 20121018, endDate: 20121018 });
    expect(events[0]).toEqual({
      studentid: '100010',
      surname: 'Oban',
      forname: 'Tom',
      date: 20121018,
      subject: '',
      reason: '',
      text: 'eats during lesson',
      categoryId: 12,
    });
  });

  it('Element-Variante verpackt alles in options', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getClassregEvents-element.json');

    await api.getClassregEventsForElement(client, {
      startDate: 20170814,
      endDate: 20180729,
      element: { id: 'Tobermory', type: ElementType.STUDENT, keyType: 'name' },
    });

    expect(transport.lastPayload().method).toBe('getClassregEvents');
    expect(transport.lastPayload().params).toEqual({
      options: {
        startDate: 20170814,
        endDate: 20180729,
        element: { id: 'Tobermory', type: 5, keyType: 'name' },
      },
    });
  });
});

describe('21/22) Pruefungen', () => {
  it('getExams sendet das pflichtige examTypeId', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getExams.json');

    await api.getExams(client, { examTypeId: 1, startDate: 20140101, endDate: 20141231 });

    expect(transport.lastPayload().params).toEqual({
      examTypeId: 1,
      startDate: 20140101,
      endDate: 20141231,
    });
  });

  it('getExams parst das Doku-Beispiel', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getExams.json');

    const exams = await api.getExams(client, { examTypeId: 1, startDate: 20140101, endDate: 20141231 });

    expect(exams[0]).toMatchObject({
      id: 1,
      classes: [1],
      teachers: [4],
      subject: 14,
      date: 20140729,
      startTime: 1425,
      endTime: 1510,
    });
    expect(exams[0]?.students).toHaveLength(24);
  });

  it('getExamTypes', async () => {
    const { client, transport } = makeClient();
    // Die Doku zeigt kein Beispiel-Response — hier eine minimale, plausible Antwort.
    transport.queue('{"jsonrpc":"2.0","id":"bwu-1","result":[{"id":1},{"id":2}]}');

    const types = await api.getExamTypes(client);

    expect(transport.lastPayload().method).toBe('getExamTypes');
    expect(types.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe('23) getTimetableWithAbsences', () => {
  it('verpackt den Zeitraum in options', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetableWithAbsences.json');

    await api.getTimetableWithAbsences(client, { startDate: 20150105, endDate: 20150111 });

    expect(transport.lastPayload().params).toEqual({
      options: { startDate: 20150105, endDate: 20150111 },
    });
  });

  it('liefert ein Objekt mit periodsWithAbsences, kein Array', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetableWithAbsences.json');

    const result = await api.getTimetableWithAbsences(client, {
      startDate: 20150105,
      endDate: 20150111,
    });

    expect(Array.isArray(result)).toBe(false);
    expect(result.periodsWithAbsences).toHaveLength(1);
  });

  it('referenziert Elemente ueber externe Schluessel statt ueber Ids', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getTimetableWithAbsences.json');

    const { periodsWithAbsences } = await api.getTimetableWithAbsences(client, {
      startDate: 20150105,
      endDate: 20150111,
    });

    expect(periodsWithAbsences[0]).toEqual({
      date: 20150105,
      startTime: 800,
      endTime: 850,
      studentId: 'stud01_k01_ext',
      subjectId: 'subject01_ext',
      teacherIds: ['teacher01_ext'],
      studentGroup: 'sg01',
      absenceReason: 'Illness',
      absentTime: 50,
      user: 'admin_ext',
      checked: true,
      invalid: true,
    });
  });
});

describe('24/25) Bemerkungskategorien', () => {
  it('getClassregCategories', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getClassregCategories.json');

    const categories = await api.getClassregCategories(client);

    expect(categories[0]).toEqual({ id: 1, name: 'disturbs', longName: 'disturbs' });
    expect(categories[1]).toEqual({ id: 6, name: 'late', longName: 'late', groupId: 2 });
    expect(categories[0]?.groupId).toBeUndefined();
  });

  it('getClassregCategoryGroups', async () => {
    const { client, transport } = makeClient();
    transport.queueFixture('getClassregCategoryGroups.json');

    const groups = await api.getClassregCategoryGroups(client);

    expect(groups).toEqual([
      { id: 1, name: 'group1' },
      { id: 2, name: 'group2' },
    ]);
  });
});
