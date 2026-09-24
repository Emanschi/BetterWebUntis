// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupMockWebUntisServer } from '../../mock/msw/testServer';
import { useSessionStore } from '../../state/sessionStore';

setupMockWebUntisServer();

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
  window.location.hash = '';
});

describe('App', () => {
  it('zeigt ohne Session den Login-Screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'BetterWebUntis' })).toBeInTheDocument();
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument();
  });

  it('nach erfolgreichem Login: Weiterleitung zum Stundenplan mit sichtbarer Navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Schule'), 'Mock-HTL');
    await user.click(await screen.findByRole('button', { name: /Mock-HTL/ }));
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Prüfungen' })).toBeInTheDocument();
  });

  it('Abmelden fuehrt zurueck zum Login-Screen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Schule'), 'Mock-HTL');
    await user.click(await screen.findByRole('button', { name: /Mock-HTL/ }));
    await user.type(screen.getByLabelText('Benutzername'), 'mmuster');
    await user.type(screen.getByLabelText('Passwort'), 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Abmelden' }));

    await waitFor(() => expect(screen.getByLabelText('Benutzername')).toBeInTheDocument());
  });
});
