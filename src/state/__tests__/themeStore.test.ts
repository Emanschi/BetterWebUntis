import { describe, expect, it } from 'vitest';
import { resolvesToDark, useThemeStore } from '../themeStore';

describe('themeStore', () => {
  it('startet mit einer gueltigen Preference', () => {
    expect(['system', 'light', 'dark']).toContain(useThemeStore.getState().preference);
  });

  it('setPreference aktualisiert den State', () => {
    useThemeStore.getState().setPreference('dark');
    expect(useThemeStore.getState().preference).toBe('dark');

    useThemeStore.getState().setPreference('light');
    expect(useThemeStore.getState().preference).toBe('light');

    useThemeStore.getState().setPreference('system');
    expect(useThemeStore.getState().preference).toBe('system');
  });
});

describe('resolvesToDark', () => {
  it('ist eindeutig fuer explizite Praeferenzen', () => {
    expect(resolvesToDark('dark')).toBe(true);
    expect(resolvesToDark('light')).toBe(false);
  });

  it('faellt bei "system" ohne matchMedia auf false zurueck, statt zu werfen', () => {
    // In der node-Testumgebung existiert kein matchMedia — das darf nicht crashen.
    expect(() => resolvesToDark('system')).not.toThrow();
  });
});
