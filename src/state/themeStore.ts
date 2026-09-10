/**
 * Dark/Light-Theme, automatisch passend zur Systemeinstellung (UI/UX-Anforderung im
 * Projektauftrag), mit manuellem Override.
 *
 * `preference` kennt drei Zustände:
 *   "system" — folgt prefers-color-scheme (Standard)
 *   "light"  — erzwingt Light, unabhängig vom System
 *   "dark"   — erzwingt Dark, unabhängig vom System
 *
 * Die Wahl wird in localStorage gemerkt (kein Geheimnis, unproblematisch zu persistieren —
 * anders als die WebUntis-Session, siehe sessionStore.ts). Alle Zugriffe auf `document`
 * und `localStorage` sind defensiv, damit der Store auch außerhalb eines Browsers
 * (Unit-Tests in Node) benutzbar bleibt, ohne zu crashen.
 */

import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'bwu-theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    // localStorage kann in manchen Kontexten (Privater Modus, Tests) werfen.
    return 'system';
  }
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Nicht kritisch — die Einstellung wirkt trotzdem für die laufende Sitzung.
  }
}

/** Setzt (oder entfernt) das data-theme-Attribut, das index.css für den Override auswertet. */
function applyToDocument(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

export interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const initial = readStoredPreference();
applyToDocument(initial);

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initial,
  setPreference: (preference) => {
    writeStoredPreference(preference);
    applyToDocument(preference);
    set({ preference });
  },
}));

/** Für Screens, die wissen wollen, ob gerade tatsächlich dunkel dargestellt wird. */
export function resolvesToDark(preference: ThemePreference): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}
