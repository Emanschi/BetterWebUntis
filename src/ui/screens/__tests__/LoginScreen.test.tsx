// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginScreen } from '../LoginScreen';
import { setupMockWebUntisServer } from '../../../mock/msw/testServer';
import { useSessionStore } from '../../../state/sessionStore';

setupMockWebUntisServer();

// Die Screens nutzen den Singleton-Store (useSessionStore) — vor jedem Fall zuruecksetzen,
// damit Tests sich nicht gegenseitig beeinflussen.
afterEach(() => {
  useSessionStore.setState({
    status: 'idle',
    school: '',
    username: undefined,
    personType: undefined,
    personId: undefined,
    errorMessage: undefined,
    client: null,
  });
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginScreen />
    </MemoryRouter>,
  );
}

describe('LoginScreen', () => {
  it('zeigt Formularfelder fuer Schule, Benutzername und Passwort', () => {
    renderLogin();
    expect(screen.getByLabelText('Schule')).toBeInTheDocument();
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument();
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung bei falschen Zugangsdaten', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Schule'), 'mockschule');
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'falsches-passwort');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Benutzername oder Passwort ist falsch.');
  });

  it('meldet bei richtigen Zugangsdaten erfolgreich an', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Schule'), 'mockschule');
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'));
    expect(useSessionStore.getState().personId).toBe(501);
  });
});
