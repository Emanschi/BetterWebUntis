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

async function login(user: ReturnType<typeof userEvent.setup>, name = 'mmuster', password = 'test1234') {
  await user.type(screen.getByLabelText('Schule'), 'mockschule');
  await user.type(screen.getByLabelText('Benutzername'), name);
  await user.type(screen.getByLabelText('Passwort'), password);
  await user.click(screen.getByRole('button', { name: 'Anmelden' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());
}

describe('Elementwechsel (M6)', () => {
  it('zeigt ueber "Anderen Plan ansehen" eine Klassenliste und wechselt beim Klick die Ansicht', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);

    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));

    // Klasse ist der Default-Tab — 2BHIF aus schoolData.ts sollte in der Liste stehen.
    expect(await screen.findByRole('button', { name: /2BHIF/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2BHIF/ }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /Stundenplan · Klasse/ })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '← Mein Plan' })).toBeInTheDocument();
  });

  it('"Mein Plan" fuehrt zurueck zum eigenen Stundenplan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);

    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));
    await user.click(await screen.findByRole('button', { name: /2BHIF/ }));
    await waitFor(() => expect(screen.getByRole('link', { name: '← Mein Plan' })).toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: '← Mein Plan' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: '← Mein Plan' })).not.toBeInTheDocument();
  });

  it('kann zwischen Klasse/Lehrer/Fach/Raum wechseln und filtern', async () => {
    // Lehrer-Konto: getTeachers ist beim echten Schueler-Konto laut Smoke-Test (M10)
    // NICHT erlaubt (siehe accounts.ts) — dafuer eigener Test unten.
    const user = userEvent.setup();
    render(<App />);
    await login(user, 'aschmidt', 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));

    await user.click(screen.getByRole('tab', { name: 'Lehrer' }));
    expect(await screen.findByRole('button', { name: /Huber/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Lehrer suchen'), 'Weber');
    expect(screen.getByRole('button', { name: /Weber/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Huber/ })).not.toBeInTheDocument();
  });

  it('Schueler-Konto sieht einen Rechte-Hinweis statt eines Absturzes auf dem Lehrer-Tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user); // Default: mmuster (Schueler)
    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));

    await user.click(screen.getByRole('tab', { name: 'Lehrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht die nötigen Rechte');
  });
});
