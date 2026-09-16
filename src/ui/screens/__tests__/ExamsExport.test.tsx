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

describe('ICS-Export (M8)', () => {
  it('erzeugt beim Klick auf "Als ICS exportieren" einen text/calendar-Blob-Download', async () => {
    // Lehrer-Konto: getExamTypes ist beim echten Schueler-Konto laut Smoke-Test (M10)
    // NICHT erlaubt, der Export-Button erscheint dann gar nicht erst (siehe accounts.ts,
    // ExamsScreen — der Button wird nur bei erfolgreich geladenen Pruefungen gezeigt).
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Schule'), 'mockschule');
    await user.type(screen.getByLabelText('Benutzername'), 'aschmidt');
    await user.type(screen.getByLabelText('Passwort'), 'test1234');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stundenplan' })).toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: 'Prüfungen' }));
    const exportButton = await screen.findByRole('button', { name: 'Als ICS exportieren' });

    let capturedBlob: Blob | undefined;
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((obj: Blob | MediaSource) => {
        capturedBlob = obj as Blob;
        return 'blob:mock-url';
      });
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await user.click(exportButton);

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob).toBeDefined();
    expect(capturedBlob?.type).toBe('text/calendar;charset=utf-8');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');

    const text = await capturedBlob!.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('SUMMARY:Angewandte Mathematik — Prüfung');
    expect(text).toContain('Klasse: 3AHIF');

    createObjectUrlSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
