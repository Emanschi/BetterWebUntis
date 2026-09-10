import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../../state/sessionStore';
import { api } from '../../api/index';
import { addWuDays, formatWuDate, formatWuTime, toWuDate } from '../../api/format';
import type { Exam } from '../../api/types';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';

/** Ganzes Schuljahr grob angenähert: 6 Monate zurück bis 6 Monate voraus (kein extra Request nötig). */
function examRange() {
  const today = toWuDate(new Date());
  return { startDate: addWuDays(today, -180), endDate: addWuDays(today, 180) };
}

/**
 * Doku Abschnitt 21/22. `getExams` verlangt `examTypeId` als Pflichtparameter — es gibt
 * keine Abfrage über alle Typen hinweg (PLAN.md R5). Deshalb: erst `getExamTypes`, dann
 * parallel `getExams` je Typ, und die Ergebnisse zusammenführen.
 *
 * ICS-Export folgt in M8 — dieser Screen zeigt nur die Liste.
 */
export function ExamsScreen() {
  const client = useSessionStore((s) => s.client);
  const { startDate, endDate } = examRange();

  const examTypesQuery = useQuery({
    queryKey: ['examTypes'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getExamTypes(client);
    },
  });

  const examsQuery = useQuery({
    queryKey: ['exams', examTypesQuery.data?.map((t) => t.id), startDate, endDate],
    enabled: client !== null && examTypesQuery.data !== undefined,
    queryFn: async () => {
      if (client === null || examTypesQuery.data === undefined) throw new Error('Keine aktive Sitzung.');
      const perType = await Promise.all(
        examTypesQuery.data.map((type) =>
          api.getExams(client, { examTypeId: type.id as number, startDate, endDate }),
        ),
      );
      return perType.flat().sort((a, b) => a.date - b.date || a.startTime - b.startTime);
    },
  });

  const subjectsQuery = useQuery({
    queryKey: ['subjects'],
    enabled: client !== null,
    queryFn: () => {
      if (client === null) throw new Error('Keine aktive Sitzung.');
      return api.getSubjects(client);
    },
  });

  const subjectName = (subjectId: number): string =>
    subjectsQuery.data?.find((s) => s.id === subjectId)?.longName ?? `Fach ${subjectId}`;

  const isLoading = examTypesQuery.isPending || (examTypesQuery.isSuccess && examsQuery.isPending);
  const error = examTypesQuery.error ?? examsQuery.error;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Prüfungen</h1>
        <p className="text-sm text-fg-muted">
          {formatWuDate(startDate, 'de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })} –{' '}
          {formatWuDate(endDate, 'de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </p>
      </div>

      {isLoading && <Spinner label="Prüfungen werden geladen…" />}
      {(examTypesQuery.isError || examsQuery.isError) && <ErrorState error={error} />}

      {examsQuery.isSuccess && examsQuery.data.length === 0 && (
        <Card className="text-sm text-fg-muted">Keine Prüfungen in diesem Zeitraum.</Card>
      )}

      {examsQuery.isSuccess && examsQuery.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {examsQuery.data.map((exam: Exam) => (
            <Card key={exam.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium text-fg">{subjectName(exam.subject)}</div>
                <div className="text-fg-muted">
                  {formatWuDate(exam.date)} · {formatWuTime(exam.startTime)}–{formatWuTime(exam.endTime)}
                </div>
              </div>
              <div className="text-xs text-fg-muted">{exam.students.length} Schüler:innen</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
