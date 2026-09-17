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

describe('Elementwechsel (M6, seit 2026-09-17 nur noch Klassen — siehe IDEEN.md)', () => {
  it('zeigt ueber "Anderen Plan ansehen" eine Klassenliste und wechselt beim Klick die Ansicht', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);

    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));

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

  it('filtert die Klassenliste', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));
    await screen.findByRole('button', { name: /2BHIF/ });

    await user.type(screen.getByLabelText('Klasse suchen'), '2BHIF');
    expect(screen.getByRole('button', { name: /2BHIF/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /3AHIF/ })).not.toBeInTheDocument();
  });

  it('zeigt keine Lehrer-/Fach-/Raum-Tabs mehr an', async () => {
    // Nicht pauschal "kein Tab auf der Seite" pruefen — TimetableScreen hat seit der
    // Tag-/Wochenansicht (2026-09-17) selbst einen Tab-Umschalter, der nichts mit dem
    // ElementPicker zu tun hat.
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.click(screen.getByRole('button', { name: 'Anderen Plan ansehen' }));
    await screen.findByRole('button', { name: /2BHIF/ });

    expect(screen.queryByRole('tab', { name: 'Lehrer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Fach' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Raum' })).not.toBeInTheDocument();
  });
});
