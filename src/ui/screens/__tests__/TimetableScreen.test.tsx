// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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

/** sessionStore.login baut selbst einen Client per Proxy-Pfad — fuer den Test nutzen wir
 * stattdessen createSessionStore mit Test-Client (wie in sessionStore.test.ts). */
async function loginAsStudent() {
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
}

function renderScreen(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <TimetableScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TimetableScreen', () => {
  it('zeigt Ladeanzeige, dann den Stundenplan der aktuellen Woche', async () => {
    await loginAsStudent();
    renderScreen();

    expect(screen.getByText('Stundenplan wird geladen…')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // Entfall (Mittwoch)
    expect(await screen.findByText(/Entfall/)).toBeInTheDocument();
    // Vertretung/Raumaenderung (mind. eine der beiden sichtbaren Warnungen)
    expect(screen.getAllByText(/⚠/).length).toBeGreaterThan(0);
    // Pruefung (Donnerstag): kein Badge mehr (echte Pruefungsstunden haben laut Messung
    // vom 2026-09-17 kein lstype, siehe IDEEN.md B3) — nur noch als Tooltip-Text sichtbar.
    expect(screen.getByTitle('1. Schularbeit')).toBeInTheDocument();
    // Wochentage sind da
    expect(screen.getByText(/^Mo ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Fr ·/)).toBeInTheDocument();

    // Zeitachse (Kalender-Update): Stundenmarkierungen sind sichtbar, damit Uhrzeiten
    // auf einen Blick erkennbar sind, nicht nur als Text auf der Karte.
    expect(screen.getByText('08:00')).toBeInTheDocument();

    // Der Montags-Block ist als Doppelstunde positioniert (id-Kombination beider Perioden).
    const doubleBlock = document.querySelector('[style*="height"]');
    expect(doubleBlock).not.toBeNull();

    // Ganztägiger Eintrag (M10-Fund gegen den echten Server, siehe mock/timetable.ts
    // ALL_DAY_EVENT_DATE): erscheint als eigene Zeile ÜBER dem Raster, statt die
    // Stundenachse auf 24 Stunden aufzublähen.
    expect(await screen.findByText('Schulveranstaltung (ganztägig)')).toBeInTheDocument();
    expect(screen.queryByText('23:00')).not.toBeInTheDocument();
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
  });

  it('öffnet beim Klick auf eine Stunde die Detailansicht mit Lehrkraft/Raum/Fach', async () => {
    // Nutzerwunsch 2026-09-17: Elemente des Stundenplans sollen sich oeffnen lassen, um
    // laengere Infos zu sehen (siehe TimetableBlockCard.tsx onOpen, PeriodDetail.tsx).
    const user = userEvent.setup();
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // Montag, Doppelstunde SEW (siehe mock/timetable.ts WEEKLY_TEMPLATE) — Kurzname auf
    // der Karte, Langname/Lehrkraft/Raum erst in der Detailansicht.
    const cards = await screen.findAllByRole('button', { name: /SEW/ });
    await user.click(cards[0]!);

    expect(screen.getByRole('dialog', { name: 'SEW' })).toBeInTheDocument();
    expect(screen.getByText('Software Engineering')).toBeInTheDocument();
    expect(screen.getByText('Schmidt')).toBeInTheDocument();
    expect(screen.getByText('EDV-Saal 1')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt einen Buchungshinweis in der Detailansicht, wenn showBooking Daten liefert', async () => {
    // Nutzerwunsch 2026-09-17: "Lehrer koennen Lehrstoff oder Notizen eintragen". Das
    // einzige dafuer dokumentierte Stundenplan-Feld ist bkText/bkRemark (showBooking,
    // Doku Abschnitt 15) — mock/timetable.ts bildet das auf dem Dienstag-BSP-Slot nach
    // (siehe IDEEN.md B7 zur Einordnung, ob das wirklich "Lehrstoff" ist).
    const user = userEvent.setup();
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    const cards = await screen.findAllByRole('button', { name: /BSP/ });
    await user.click(cards[0]!);

    expect(await screen.findByText('Halle 2 reserviert')).toBeInTheDocument();
    expect(screen.getByText('Geräte bitte danach wieder wegräumen')).toBeInTheDocument();
  });

  it('öffnet auch einen ganztägigen Eintrag per Klick', async () => {
    const user = userEvent.setup();
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    await user.click(await screen.findByText('Schulveranstaltung (ganztägig)'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('kann zwischen Wochen- und Tagesansicht wechseln (Nutzerwunsch 2026-09-17)', async () => {
    const user = userEvent.setup();
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // Woche ist der Default: alle fuenf Wochentage sichtbar.
    expect(screen.getByText(/^Mo ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Mi ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Fr ·/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Tag' }));

    // "Heute" ist auf Mittwoch, 09.09.2026 gepinnt — nur noch dieser eine Tag sichtbar.
    expect(screen.getByText(/^Mi ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^Mo ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fr ·/)).not.toBeInTheDocument();

    // Navigation bewegt jetzt einen Tag statt einer Woche.
    await user.click(screen.getByRole('button', { name: 'Nächster Tag' }));
    expect(await screen.findByText(/^Do ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^Mi ·/)).not.toBeInTheDocument();

    // Zurueck zur Woche zeigt wieder alle Tage.
    await user.click(screen.getByRole('tab', { name: 'Woche' }));
    expect(await screen.findByText(/^Mo ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Fr ·/)).toBeInTheDocument();
  });

  it('springt beim Ankommen mit highlightDate zur passenden Woche und hebt die Stunde hervor', async () => {
    // Simuliert den Klick auf eine Pruefung in ExamsScreen.tsx: 2. Schularbeit am
    // 19.11.2026, 10:00-10:50 (siehe mock/timetable.ts FIXED_EXAM_DATES).
    await loginAsStudent();
    renderScreen('/?highlightDate=20261119&highlightStart=1000&highlightEnd=1050');
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // Die Woche um den 19.11.2026 ist geladen, nicht die aktuelle (September-)Woche.
    expect(await screen.findByText(/16\.11\. – 22\.11\.2026/)).toBeInTheDocument();

    const highlighted = document.querySelector('.bwu-neon-highlight');
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toContain('AM');
  });
});
