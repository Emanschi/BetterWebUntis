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

describe('Prüfungen (Nachbesserung: REST-Workaround statt getExams, IDEEN.md B3)', () => {
  it('Schueler-Konto sieht Pruefungen ueber den REST-Workaround', async () => {
    // getExamTypes/getExams sind fuer echte Schueler-Konten gesperrt (Code -8509), UND
    // Pruefungsstunden im Stundenplan haben kein lstype/code (gemessen 2026-09-17, siehe
    // TESTING.md). Der Workaround ruft stattdessen /WebUntis/api/exams auf (siehe
    // api/examsRest.ts, mock/examsRestMock.ts liefert dieselben fuenf Fixtermine wie die
    // "Schularbeit"-Randfaelle im Stundenplan-Mock).
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));

    expect((await screen.findAllByText('AM')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('SA_TE').length).toBeGreaterThan(0);
    // Erster Fixtermin ist testweise benotet (mock/examsRestMock.ts) — zeigt, dass die
    // UI eine vorhandene Note anzeigen kann.
    expect(screen.getByText(/Note: 2 Gut/)).toBeInTheDocument();
  });

  it('Schuljahr-Wechsel filtert die Liste (2025/2026 hat keine Fixtermine)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));
    await screen.findAllByText('AM');

    await user.selectOptions(screen.getByLabelText('Schuljahr'), '2025/2026');

    expect(await screen.findByText('Keine Prüfungen in diesem Schuljahr.')).toBeInTheDocument();
  });

  it('Klick auf eine Pruefung springt im Stundenplan zur passenden Woche und hebt sie hervor (Nutzerwunsch 2026-09-17)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));
    const examCards = await screen.findAllByRole('button', { name: /Im Stundenplan anzeigen/ });
    // examCards[0] (10.09.2026) liegt in derselben Woche wie "heute" (gepinnt auf
    // 09.09.2026) — waere kein aussagekraeftiger Sprung-Test. examCards[1] ist der
    // 2. Fixtermin (19.11.2026), eine andere Woche.
    await user.click(examCards[1]!);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());
    // Erst warten, bis die Perioden geladen sind — sonst gibt es noch keine Karten, gegen
    // die der Highlight-Match ueberhaupt pruefen koennte.
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());
    expect(await screen.findByText(/16\.11\. – 22\.11\.2026/)).toBeInTheDocument();

    await waitFor(() => expect(document.querySelector('.bwu-neon-highlight')).not.toBeNull());
  });
});
