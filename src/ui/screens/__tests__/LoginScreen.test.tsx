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
    school: null,
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

/** Tippt einen Suchbegriff ins Schulfeld und klickt das Suchergebnis mit `resultName` im Namen (siehe mock/schoolSearchMock.ts). */
async function selectSchool(user: ReturnType<typeof userEvent.setup>, query: string, resultName: string) {
  await user.type(screen.getByLabelText('Schule'), query);
  const option = await screen.findByRole('button', { name: new RegExp(resultName) });
  await user.click(option);
}

describe('LoginScreen', () => {
  it('zeigt Formularfelder fuer Schule, Benutzername und Passwort', () => {
    renderLogin();
    expect(screen.getByLabelText('Schule')).toBeInTheDocument();
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument();
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument();
  });

  it('zeigt Suchergebnisse beim Tippen und uebernimmt die Auswahl ins Feld', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Schule'), 'Mock');
    expect(await screen.findByRole('button', { name: /Mock-HTL/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mock-Realschule Steinfeld/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mock-HTL/ }));

    expect(screen.getByLabelText('Schule')).toHaveValue('Mock-HTL');
    expect(screen.queryByRole('button', { name: /Mock-Realschule Steinfeld/ })).not.toBeInTheDocument();
  });

  it('zeigt "Keine Schule gefunden" bei einem Suchbegriff ohne Treffer', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Schule'), 'xyzxyz');
    expect(await screen.findByText('Keine Schule gefunden.')).toBeInTheDocument();
  });

  it('verlangt eine ausgewaehlte Schule vor dem Anmelden', async () => {
    const user = userEvent.setup();
    renderLogin();

    // Bewusst NICHT aus der Liste ausgewaehlt, nur getippt.
    await user.type(screen.getByLabelText('Schule'), 'Mock-HTL');
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte zuerst eine Schule aus der Liste auswählen.');
    expect(useSessionStore.getState().status).toBe('idle');
  });

  it('zeigt eine Fehlermeldung bei falschen Zugangsdaten', async () => {
    const user = userEvent.setup();
    renderLogin();

    await selectSchool(user, 'Mock-HTL', 'Mock-HTL');
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'falsches-passwort');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Benutzername oder Passwort ist falsch.');
  });

  it('meldet bei richtigen Zugangsdaten erfolgreich an', async () => {
    const user = userEvent.setup();
    renderLogin();

    await selectSchool(user, 'Mock-HTL', 'Mock-HTL');
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'));
    expect(useSessionStore.getState().personId).toBe(501);
  });
});
