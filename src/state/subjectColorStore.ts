/**
 * Nutzer-Übersteuerung der Fachfarben (Nutzerwunsch 2026-09-17) — überstimmt, was
 * `domain/colors.ts` sonst anzeigen würde (API-Farbe oder generierte Fallback-Farbe).
 * Lokal je Gerät/Browser gespeichert, kein Geheimnis — dieselbe Einstufung wie bei
 * `themeStore.ts`.
 *
 * Persistenz: `localStorage`, geschlüsselt über die Fach-Id. Funktioniert unverändert in
 * der späteren Capacitor-App (M9): Capacitor bettet eine echte WebView ein, deren
 * `localStorage` genauso persistiert wie im Desktop-Browser, ganz ohne Sonderbehandlung.
 * Falls sich das später als nicht robust genug erweist (z. B. wenn Android die WebView-
 * Daten unter Speicherdruck räumt), wäre `@capacitor/preferences` der nächste Schritt —
 * siehe IDEEN.md. Für jetzt reicht derselbe Mechanismus, der schon Theme und Schulname
 * zuverlässig merkt.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'bwu-subject-colors';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type Overrides = Record<number, string>;

function readStoredOverrides(): Overrides {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const result: Overrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (Number.isInteger(id) && typeof value === 'string' && HEX_COLOR.test(value)) {
        result[id] = value;
      }
    }
    return result;
  } catch {
    // localStorage kann in manchen Kontexten (Privater Modus, Tests) werfen; ein
    // beschädigter Eintrag darf die App ebenfalls nicht zum Absturz bringen.
    return {};
  }
}

function writeStoredOverrides(overrides: Overrides): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Nicht kritisch — die Auswahl wirkt trotzdem für die laufende Sitzung.
  }
}

export interface SubjectColorState {
  /** Fach-Id → Hex-Hintergrundfarbe. */
  overrides: Overrides;
  setOverride: (subjectId: number, hexColor: string) => void;
  clearOverride: (subjectId: number) => void;
}

export const useSubjectColorStore = create<SubjectColorState>((set, get) => ({
  overrides: readStoredOverrides(),
  setOverride: (subjectId, hexColor) => {
    const next = { ...get().overrides, [subjectId]: hexColor };
    writeStoredOverrides(next);
    set({ overrides: next });
  },
  clearOverride: (subjectId) => {
    const next = { ...get().overrides };
    delete next[subjectId];
    writeStoredOverrides(next);
    set({ overrides: next });
  },
}));
