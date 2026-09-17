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

describe('Abwesenheiten (Nachbesserung: REST-Workaround statt getTimetableWithAbsences, IDEEN.md B3b)', () => {
  it('Schueler-Konto sieht Abwesenheiten ueber den REST-Workaround', async () => {
    // getTimetableWithAbsences ist fuer echte Schueler-Konten gesperrt (Code -8509) und
    // hat kein Stundenplan-Aequivalent. Der Workaround ruft stattdessen
    // /WebUntis/api/classreg/absences/students auf (siehe api/absencesRest.ts,
    // mock/absencesRestMock.ts liefert einen Fixtermin, Fr 11.09.2026, unentschuldigt).
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Abwesenheiten' }));

    expect(await screen.findByText(/11\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByText('nicht entschuldigt')).toBeInTheDocument();
  });

  it('Schuljahr-Wechsel filtert die Liste (2025/2026 hat keine Fixtermine)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Abwesenheiten' }));
    await screen.findByText(/11\.09\.2026/);

    await user.selectOptions(screen.getByLabelText('Schuljahr'), '2025/2026');

    expect(await screen.findByText('Keine Abwesenheiten in diesem Schuljahr.')).toBeInTheDocument();
  });
});
