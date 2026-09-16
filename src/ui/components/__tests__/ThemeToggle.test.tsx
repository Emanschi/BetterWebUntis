// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '../ThemeToggle';
import { useThemeStore } from '../../../state/themeStore';

afterEach(() => {
  useThemeStore.getState().setPreference('system');
});

describe('ThemeToggle', () => {
  it('zeigt genau einen Umschalt-Button — kein separates "System"-Icon', () => {
    render(<ThemeToggle />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('wechselt bei Klick von hell auf dunkel und umgekehrt', async () => {
    const user = userEvent.setup();
    useThemeStore.getState().setPreference('light');
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: 'Zu dunklem Design wechseln' });
    await user.click(button);
    expect(useThemeStore.getState().preference).toBe('dark');

    expect(screen.getByRole('button', { name: 'Zu hellem Design wechseln' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zu hellem Design wechseln' }));
    expect(useThemeStore.getState().preference).toBe('light');
  });
});
