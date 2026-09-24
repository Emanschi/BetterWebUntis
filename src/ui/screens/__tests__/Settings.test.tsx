// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setupMockWebUntisServer } from '../../../mock/msw/testServer';
import { useSessionStore } from '../../../state/sessionStore';
import { useSubjectColorStore } from '../../../state/subjectColorStore';

setupMockWebUntisServer();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 9));
});

afterEach(() => {
  vi.useRealTimers();
  useSessionStore.setState({
    status: 'idle',
    school: null,
    username: undefined,
    personType: undefined,
    personId: undefined,
    errorMessage: undefined,
    client: null,
  });
  useSubjectColorStore.setState({ overrides: {} });
  localStorage.clear();
  window.location.hash = '';
});

async function loginAs(user: ReturnType<typeof userEvent.setup>, name: string, password: string) {
  await user.type(screen.getByLabelText('Schule'), 'Mock-HTL');
  await user.click(await screen.findByRole('button', { name: /Mock-HTL/ }));
  await user.type(screen.getByLabelText('Benutzername'), name);
  await user.type(screen.getByLabelText('Passwort'), password);
  await user.click(screen.getByRole('button', { name: 'Anmelden' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());
}

describe('Einstellungen: Fachfarben anpassen (Nutzerwunsch 2026-09-17)', () => {
  it('zeigt nur Fächer, die im eigenen Stundenplan vorkommen, nicht den ganzen Schulkatalog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Einstellungen' }));

    // SEW kommt im Mock-Stundenplan der 3AHIF vor (mock/timetable.ts).
    expect(await screen.findByText('Software Engineering')).toBeInTheDocument();
    // "Physik" (id 8) existiert in schoolData.SUBJECTS, ist aber bewusst nirgends fuer die
    // Klasse verplant — muss deshalb hier fehlen (nur "meine" Faecher, nicht der Katalog).
    expect(screen.queryByText('Physik')).not.toBeInTheDocument();
  });

  it('waehlt eine Farbe aus der Palette, speichert sie im Store und zeigt "Zuruecksetzen"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Einstellungen' }));
    await screen.findByText('Software Engineering');

    const sewGroup = screen.getByRole('group', { name: 'Farbe für SEW wählen' });
    const sewCard = sewGroup.parentElement!;
    await user.click(within(sewGroup).getByRole('button', { name: '#ef4444' }));

    expect(useSubjectColorStore.getState().overrides[4]).toBe('#ef4444');
    expect(await within(sewCard).findByRole('button', { name: 'Zurücksetzen' })).toBeInTheDocument();
  });

  it('"Zuruecksetzen" entfernt die eigene Farbe wieder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAs(user, 'mmuster', 'test1234');

    await user.click(screen.getByRole('link', { name: 'Einstellungen' }));
    await screen.findByText('Software Engineering');

    const sewGroup = screen.getByRole('group', { name: 'Farbe für SEW wählen' });
    const sewCard = sewGroup.parentElement!;
    await user.click(within(sewGroup).getByRole('button', { name: '#ef4444' }));
    await user.click(await within(sewCard).findByRole('button', { name: 'Zurücksetzen' }));

    expect(useSubjectColorStore.getState().overrides[4]).toBeUndefined();
    expect(within(sewCard).queryByRole('button', { name: 'Zurücksetzen' })).not.toBeInTheDocument();
  });
});
