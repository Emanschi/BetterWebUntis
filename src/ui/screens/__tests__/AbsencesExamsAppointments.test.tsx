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

describe('Prüfungen (M7)', () => {
  it('zeigt Pruefungen mit aufgeloestem Fachnamen', async () => {
    // Lehrer-Konto: getExamTypes ist beim echten Schueler-Konto laut Smoke-Test (M10)
    // NICHT erlaubt — dafuer eigener Test unten.
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'aschmidt', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));

    // Die Mock-Pruefung ist "Angewandte Mathematik" (subjectId 5, siehe schoolData.ts).
    expect((await screen.findAllByText('Angewandte Mathematik')).length).toBeGreaterThan(0);
  });

  it('Schueler-Konto sieht einen Rechte-Hinweis statt eines Absturzes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht die nötigen Rechte');
  });
});

describe('Meine Termine (M7)', () => {
  it('Lehrer-Konto sieht die Sprechstunde', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'aschmidt', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Termine' }));

    expect((await screen.findAllByText('Sprechstunde')).length).toBeGreaterThan(0);
  });

  it('Schueler-Konto ohne eigene Sprechstunden sieht den Leer-Hinweis', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Termine' }));

    expect(await screen.findByText(/Keine Sprechstunden/)).toBeInTheDocument();
  });
});
