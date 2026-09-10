// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimetableScreen } from '../TimetableScreen';
import { setupMockWebUntisServer } from '../../../mock/msw/testServer';
import { WebUntisClient } from '../../../api/client';
import { FetchTransport } from '../../../api/transport';
import { useSessionStore } from '../../../state/sessionStore';

setupMockWebUntisServer();

// "Heute" auf einen festen Tag in unserer Testwoche (Mo 20260907 – So 20260913) pinnen,
// damit der Test unabhaengig vom tatsaechlichen Ausfuehrungsdatum immer dieselbe Woche
// mit allen Randfaellen zeigt (siehe mock/timetable.ts).
beforeEach(() => {
  // Nur Date faken, nicht setTimeout/Intervals — sonst haengt der echte fetch (MSW) fest.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 9)); // 9. September 2026 (Monat 0-basiert)
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
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TimetableScreen />
    </QueryClientProvider>,
  );
}

describe('TimetableScreen', () => {
  it('zeigt Ladeanzeige, dann den Stundenplan der aktuellen Woche', async () => {
    // sessionStore.login baut selbst einen Client per Proxy-Pfad — fuer den Test nutzen
    // wir stattdessen createSessionStore mit Test-Client (wie in sessionStore.test.ts).
    const { createSessionStore } = await import('../../../state/sessionStore');
    const testStore = createSessionStore({
      buildClient: (school) =>
        new WebUntisClient({
          endpoint: 'https://mock.local/WebUntis/jsonrpc.do',
          school,
          client: 'BetterWebUntis-Test',
          transport: new FetchTransport({ canSetCookieHeader: true }),
          minRequestGapMs: 0,
        }),
    });
    await testStore.getState().login('mockschule', 'mmuster', 'test1234');

    useSessionStore.setState(testStore.getState());

    renderScreen();

    expect(screen.getByText('Stundenplan wird geladen…')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // Entfall (Mittwoch)
    expect(await screen.findByText(/Entfall/)).toBeInTheDocument();
    // Vertretung/Raumaenderung (mind. eine der beiden sichtbaren Warnungen)
    expect(screen.getAllByText(/⚠/).length).toBeGreaterThan(0);
    // Pruefung (Donnerstag, lstype ex)
    expect(screen.getByText('Prüfung')).toBeInTheDocument();
    // Wochentage sind da
    expect(screen.getByText(/^Mo ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Fr ·/)).toBeInTheDocument();
  });
});
