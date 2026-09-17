import { describe, expect, it } from 'vitest';
import { getExamsRest } from '../examsRest';
import { makeClient } from './helpers';

describe('getExamsRest', () => {
  it('ruft /api/exams mit studentId/startDate/endDate/withGrades/klasseId auf', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"data":{"exams":[]}}');

    await getExamsRest(client, { studentId: 15436, startDate: 20260901, endDate: 20260930 });

    const url = new URL(transport.getRequests[0]!.url);
    expect(url.pathname).toBe('/WebUntis/api/exams');
    expect(url.searchParams.get('studentId')).toBe('15436');
    expect(url.searchParams.get('startDate')).toBe('20260901');
    expect(url.searchParams.get('endDate')).toBe('20260930');
    expect(url.searchParams.get('withGrades')).toBe('true');
    expect(url.searchParams.get('klasseId')).toBe('-1');
  });

  it('entpackt data.exams — echte Beispielantwort vom 2026-09-17', async () => {
    const { client, transport } = makeClient();
    // Wortlaut wie vom Nutzer aus den Browser-DevTools kopiert (Name/Id entfernt, siehe examsRest.ts).
    transport.queue(
      '{"data":{"exams":[{"id":0,"examType":"SA_TE","name":"NW2","studentClass":["3BHIF"],' +
        '"examDate":20260918,"startTime":1220,"endTime":1310,"subject":"NW2",' +
        '"teachers":["MAYR"],"rooms":["N306"],"text":"Nomenklatur","grade":""}]}}',
    );

    const exams = await getExamsRest(client, { studentId: 15436, startDate: 20260901, endDate: 20260930 });

    expect(exams).toEqual([
      {
        id: 0,
        examType: 'SA_TE',
        name: 'NW2',
        studentClass: ['3BHIF'],
        examDate: 20260918,
        startTime: 1220,
        endTime: 1310,
        subject: 'NW2',
        teachers: ['MAYR'],
        rooms: ['N306'],
        text: 'Nomenklatur',
        grade: '',
      },
    ]);
  });

  it('liefert eine leere Liste, wenn keine Pruefungen im Zeitraum liegen', async () => {
    const { client, transport } = makeClient();
    transport.queue('{"data":{"exams":[]}}');

    await expect(getExamsRest(client, { studentId: 1, startDate: 20260101, endDate: 20260131 })).resolves.toEqual([]);
  });
});
