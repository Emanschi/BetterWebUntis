import { describe, expect, it } from 'vitest';
import { getAbsencesRest } from '../absencesRest';
import { makeClient } from './helpers';

describe('getAbsencesRest', () => {
  it('ruft /api/classreg/absences/students mit studentId/startDate/endDate/excuseStatusId auf', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"data":{"absences":[]}}');

    await getAbsencesRest(client, { studentId: 15436, startDate: 20260907, endDate: 20270704 });

    const url = new URL(transport.getRequests[0]!.url);
    expect(url.pathname).toBe('/WebUntis/api/classreg/absences/students');
    expect(url.searchParams.get('studentId')).toBe('15436');
    expect(url.searchParams.get('startDate')).toBe('20260907');
    expect(url.searchParams.get('endDate')).toBe('20270704');
    expect(url.searchParams.get('excuseStatusId')).toBe('-1');
  });

  it('entpackt data.absences — echte Beispielantwort vom 2026-09-17', async () => {
    const { client, transport } = makeClient();
    // Wortlaut wie vom Nutzer aus den Browser-DevTools kopiert (Name entfernt, siehe
    // absencesRest.ts). Enthaelt bewusst mehr Felder (reasonId, excuse-Objekt, ...) als
    // RestAbsence deklariert — die Pruefung unten beschraenkt sich auf den getypten
    // Ausschnitt, der tatsaechliche Vertrag dieser Funktion.
    transport.queue(
      '{"data":{"absences":[{"id":1350715,"startDate":20260911,"endDate":20260911,' +
        '"startTime":750,"endTime":915,"reasonId":0,"reason":"","text":"",' +
        '"isExcused":false,"excuseStatus":null,"excuse":{"id":-1,"text":"","excuseDate":0,' +
        '"excuseStatus":"","isExcused":false,"userId":-1,"username":""}}],' +
        '"absenceReasons":[],"excuseStatuses":null,"showAbsenceReasonChange":false,"showCreateAbsence":false}}',
    );

    const absences = await getAbsencesRest(client, { studentId: 15436, startDate: 20260907, endDate: 20270704 });

    expect(absences).toHaveLength(1);
    expect(absences[0]).toMatchObject({
      id: 1350715,
      startDate: 20260911,
      endDate: 20260911,
      startTime: 750,
      endTime: 915,
      reason: '',
      text: '',
      isExcused: false,
      excuseStatus: null,
    });
  });

  it('liefert eine leere Liste, wenn keine Abwesenheiten im Zeitraum liegen', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"data":{"absences":[]}}');

    await expect(getAbsencesRest(client, { studentId: 1, startDate: 20260101, endDate: 20260131 })).resolves.toEqual([]);
  });
});
