// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setupMockWebUntisServer } from '../../../mock/msw/testServer';
import { useSessionStore } from '../../../state/sessionStore';

setupMockWebUntisServer();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 9));
});

afterEach(() => {
  vi.useRealTimers();
  useSessionStore.setState({
    status: 'idle',
    school: '',
    username: undefined,
    personType: undefined,
    personId: undefined,
    errorMessage: undefined,
    client: null,
  });
  window.location.hash = '';
});

async function loginAs(user: ReturnType<typeof userEvent.setup>, name: string, password: string) {
  await user.type(screen.getByLabelText('Schule'), 'mockschule');
  await user.type(screen.getByLabelText('Benutzername'), name);
  await user.type(screen.getByLabelText('Passwort'), password);
  await user.click(screen.getByRole('button', { name: 'Anmelden' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());
}

describe('Abwesenheiten (M7)', () => {
  it('Schueler-Konto sieht eine Fehlermeldung statt eines Absturzes (fehlendes Recht)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Abwesenheiten' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht die nötigen Rechte');
  });

  it('Lehrer-Konto sieht die Abwesenheitsliste', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'aschmidt', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Abwesenheiten' }));

    expect((await screen.findAllByText(/entschuldigt/)).length).toBeGreaterThan(0);
  });
});

describe('Prüfungen (Nachbesserung nach echtem Server-Test, IDEEN.md B3)', () => {
  it('Schueler-Konto sieht Pruefungen — ueber lstype "ex" im Stundenplan, nicht getExams', async () => {
    // getExamTypes/getExams sind fuer echte Schueler-Konten gesperrt (Code -8509, siehe
    // TESTING.md). Der Workaround liest stattdessen den Stundenplan des Schuljahres und
    // filtert auf lstype "ex" — das mmuster-Konto sieht seine eigene Klasse, exam-Slot ist
    // Donnerstag/3. Stunde, subjectId 5 "Angewandte Mathematik" (siehe mock/timetable.ts).
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));

    expect((await screen.findAllByText('Angewandte Mathematik')).length).toBeGreaterThan(0);
  });

  it('Lehrer-Konto, das den Pruefungs-Slot nicht selbst unterrichtet, sieht den Leer-Hinweis', async () => {
    // aschmidt (Lehrer-Id 11) unterrichtet den Mock-Exam-Slot nicht (Lehrer-Id 10) — die
    // eigene Lehrer-Sicht auf den Stundenplan enthaelt ihn deshalb korrekt nicht.
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'aschmidt', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));

    expect(await screen.findByText('Keine Prüfungen in diesem Schuljahr.')).toBeInTheDocument();
  });
});
