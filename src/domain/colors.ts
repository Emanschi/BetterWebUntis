/**
 * Farbe je Fach: Nutzer-Override zuerst (state/subjectColorStore.ts), sonst `foreColor`/
 * `backColor` aus der API (Doku Abschnitt 6), sonst ein deterministisches Eigenfarbschema
 * (UI/UX-Anforderung im Projektauftrag: "Fächer farblich unterschieden — wo vorhanden
 * foreColor/backColor aus der API nutzen, sonst ein sinnvolles eigenes Farbschema pro Fach
 * generieren").
 *
 * Das generierte Schema ist deterministisch (gleiches Fach → gleiche Farbe, stabil über
 * Sitzungen hinweg). Die Textfarbe wird per WCAG-Kontrastformel gewählt, außer die API
 * liefert selbst ein foreColor — das wird unverändert übernommen (die Schule hat es sich
 * vermutlich bewusst so ausgesucht).
 */

import { wuColorToCss } from '../api/format';

export interface SubjectColorInput {
  id: number;
  name?: string | undefined;
  foreColor?: string | undefined;
  backColor?: string | undefined;
}

export type ColorSource = 'custom' | 'api' | 'generated';

export interface ResolvedColor {
  /** CSS-Hintergrundfarbe, z. B. "#ee7f00". */
  background: string;
  /** CSS-Textfarbe mit ausreichendem Kontrast zur Hintergrundfarbe. */
  foreground: string;
  source: ColorSource;
}

/** Einfacher, deterministischer String-Hash (djb2) — kein Kryptohash nötig, nur Streuung. */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * HSL → CSS-Hex, damit Konsumenten nicht zwischen Formaten unterscheiden müssen.
 * `s` und `l` als Prozentwerte (0–100), wie in CSS `hsl()` üblich.
 */
function hslToHex(h: number, s: number, l: number): string {
  const sFrac = s / 100;
  const lFrac = l / 100;
  const a = sFrac * Math.min(lFrac, 1 - lFrac);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lFrac - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Relative Luminanz nach WCAG 2.x (sRGB-Gamma-Korrektur + Gewichtung je Kanal). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (rl ?? 0) + 0.7152 * (gl ?? 0) + 0.0722 * (bl ?? 0);
}

/** WCAG-Kontrastverhältnis zwischen zwei Luminanzwerten (1–21). */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Wählt Schwarz oder Weiß als Textfarbe — je nachdem, was auf `backgroundHex` den
 * höheren WCAG-Kontrast ergibt. Für generierte und selbst gewählte Farben gedacht, wo es
 * keine von der Schule vorgegebene Textfarbe gibt.
 */
export function contrastForeground(backgroundHex: string): string {
  const bgLuminance = relativeLuminance(backgroundHex);
  return contrastRatio(bgLuminance, 0) >= contrastRatio(bgLuminance, 1) ? '#111114' : '#ffffff';
}

/** Generiert eine Fachfarbe aus id+name — stabil, gut lesbar in Light und Dark Mode. */
function generateSubjectColor(input: SubjectColorInput): ResolvedColor {
  const seed = hashString(`${input.id}:${input.name ?? ''}`);
  const hue = seed % 360;
  // Moderate Sättigung/Helligkeit: kräftig genug zum Unterscheiden, hell genug für
  // schwarzen Text in den meisten Fällen — contrastForeground() entscheidet trotzdem
  // dynamisch, statt Schwarz anzunehmen.
  const background = hslToHex(hue, 62, 82);
  return { background, foreground: contrastForeground(background), source: 'generated' };
}

/**
 * Liefert die anzuzeigende Farbe für ein Fach.
 * Reihenfolge: `overrideBackground` (Nutzer-Auswahl) → API-Farbe → generiert.
 */
export function subjectColor(input: SubjectColorInput, overrideBackground?: string): ResolvedColor {
  if (overrideBackground !== undefined) {
    return { background: overrideBackground, foreground: contrastForeground(overrideBackground), source: 'custom' };
  }

  const apiBackground = wuColorToCss(input.backColor);
  if (apiBackground !== undefined) {
    const apiForeground = wuColorToCss(input.foreColor);
    return { background: apiBackground, foreground: apiForeground ?? contrastForeground(apiBackground), source: 'api' };
  }

  return generateSubjectColor(input);
}
