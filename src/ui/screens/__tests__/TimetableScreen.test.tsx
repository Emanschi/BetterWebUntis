// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimetableScreen } from '../TimetableScreen';
import { App } from '../../App';
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
    school: null,
    username: undefined,
    personType: undefined,
    personId: undefined,
    errorMessage: undefined,
    client: null,
  });
  window.location.hash = '';
});

/** sessionStore.login baut selbst einen Client per Proxy-Pfad — fuer den Test nutzen wir
 * stattdessen createSessionStore mit Test-Client (wie in sessionStore.test.ts). */
async function loginAsStudent() {
  const { createSessionStore } = await import('../../../state/sessionStore');
  const testStore = createSessionStore({
    buildClient: (school) =>
      new WebUntisClient({
        endpoint: 'https://mock.local/WebUntis/jsonrpc.do',
        school: school.loginName,
        client: 'BetterWebUntis-Test',
        transport: new FetchTransport({ canSetCookieHeader: true }),
        minRequestGapMs: 0,
      }),
  });
  await testStore
    .getState()
    .login({ server: 'mock.local', loginName: 'mockschule', displayName: 'Mock-HTL' }, 'mmuster', 'test1234', false);
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

  it('zeigt Lehrstoff in der Detailansicht, wenn der calendar-entry-detail-Endpunkt Inhalt liefert', async () => {
    // Nutzerwunsch 2026-09-17 (siehe IDEEN.md B8): Lehrkräfte können pro Stunde Lehrstoff
    // eintragen — über einen separaten, undokumentierten Endpunkt (api/calendarEntryRest.ts),
    // hier simuliert auf dem Montags-Deutsch-Slot (mock/timetable.ts hasTeachingContent).
    const user = userEvent.setup();
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // "D" ist als einziges Fach mit "D" anfangend eindeutig — "EDV1"/"EDV2" (Räume) würden
    // ein reines /D/ sonst ebenfalls treffen.
    const cards = await screen.findAllByRole('button', { name: /^D/ });
    await user.click(cards[0]!);

    expect(await screen.findByText(/Diskussionsthemen sammeln/)).toBeInTheDocument();
  });

  it('zeigt ein Lehrstoff-Badge ("L") auf der Karte, BEVOR sie geöffnet wird (Nutzerwunsch 2026-09-24, dritte Runde)', async () => {
    // Vorabladung der ganzen sichtbaren Woche (TimetableScreen.tsx blocksWithTeachingContent)
    // — dieselbe Fixture wie oben (Montags-Deutsch-Slot, mock/timetable.ts
    // hasTeachingContent). Kein Klick nötig, das Badge muss von selbst erscheinen, sobald die
    // Vorabladung durch ist. (Zwischenzeitlich auf "nur beim Öffnen" zurückgebaut, dann auf
    // ausdrücklichen Nutzerwunsch wieder auf Vorabladung umgestellt — siehe IDEEN.md B10.)
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    expect(await screen.findByRole('img', { name: 'Lehrstoff vorhanden' })).toBeInTheDocument();
  });

  it('BUG (gemeldet 2026-09-24): zeigt KEIN Lehrstoff-Badge und KEINE leere "Lehrstoff"-Zeile bei einem Treffer ohne Lehrstoff', async () => {
    // Der Dienstag-BSP-Slot hat einen calendar-entry-detail-TREFFER (Buchungshinweis-Test
    // oben), aber keinen Lehrstoff — der Server sendet dafuer `teachingContent: null`, nicht
    // ein fehlendes Feld (siehe api/calendarEntryRest.ts). Vorher liess eine simple
    // `!== undefined`-Pruefung `null` durchrutschen: das Badge erschien faelschlich, und die
    // Detailansicht zeigte die Zeile "LEHRSTOFF" mit leerem Inhalt darunter.
    const user = userEvent.setup();
    await loginAsStudent();
    renderScreen();
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());

    // Wartet, bis die Vorabladung durch ist (am Lehrstoff-Badge der D-Karte erkennbar),
    // damit auch die BSP-Karte ihre Antwort (teachingContent: null) sicher verarbeitet hat.
    await screen.findByRole('img', { name: 'Lehrstoff vorhanden' });

    const bspCards = screen.getAllByRole('button', { name: /BSP/ });
    expect(within(bspCards[0]!).queryByRole('img', { name: 'Lehrstoff vorhanden' })).not.toBeInTheDocument();

    await user.click(bspCards[0]!);
    expect(await screen.findByText('Halle 2 reserviert')).toBeInTheDocument(); // Detail ist offen
    // "Lehrstoff" ist das Label aus PeriodDetail.tsx (CSS macht es nur optisch GROSS) — die
    // Zeile darf komplett fehlen (Row blendet bei fehlendem Wert aus), nicht mit leerem Inhalt
    // erscheinen.
    expect(screen.queryByText('Lehrstoff')).not.toBeInTheDocument();
  });

  it('springt beim Klick auf "Stundenplan" in der Hauptnavigation zurück zur aktuellen Woche (Nutzerwunsch 2026-09-17)', async () => {
    // "Anderswo im Jahr" simuliert durch eine Woche vorzublättern, dann über die
    // Hauptnavigation (nicht die Screen-eigenen Vor/Zurück-Buttons) zurückzuspringen — dafür
    // wird hier ausnahmsweise die volle App gerendert, weil die Navigation in AppShell.tsx
    // liegt, nicht in TimetableScreen selbst.
    const user = userEvent.setup();
    await loginAsStudent();
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());
    expect(await screen.findByText(/07\.09\. – 13\.09\.2026/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nächste Woche' }));
    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());
    expect(await screen.findByText(/14\.09\. – 20\.09\.2026/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Stundenplan' }));

    await waitFor(() => expect(screen.queryByText('Stundenplan wird geladen…')).not.toBeInTheDocument());
    expect(await screen.findByText(/07\.09\. – 13\.09\.2026/)).toBeInTheDocument();
  });
});
