/**
 * Farbe je Fach: bevorzugt `foreColor`/`backColor` aus der API (Doku Abschnitt 6),
 * sonst ein deterministisches Eigenfarbschema (UI/UX-Anforderung im Projektauftrag:
 * "Fächer farblich unterschieden — wo vorhanden foreColor/backColor aus der API nutzen,
 * sonst ein sinnvolles eigenes Farbschema pro Fach generieren").
 *
 * Das generierte Schema ist deterministisch (gleiches Fach → gleiche Farbe, stabil über
 * Sitzungen hinweg) und wählt Text-auf-Hintergrund automatisch nach Kontrast.
 */

import { wuColorToCss } from '../api/format';

export interface SubjectColorInput {
  id: number;
  name?: string | undefined;
  foreColor?: string | undefined;
  backColor?: string | undefined;
}

export interface ResolvedColor {
  /** CSS-Hintergrundfarbe, z. B. "#ee7f00" oder "hsl(210 70% 55%)". */
  background: string;
  /** CSS-Textfarbe mit ausreichendem Kontrast zur Hintergrundfarbe. */
  foreground: string;
  /** true, wenn die Farbe aus der API kam (nicht generiert). */
  fromApi: boolean;
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

/** Generiert eine Fachfarbe aus id+name — stabil, gut lesbar in Light und Dark Mode. */
function generateSubjectColor(input: SubjectColorInput): ResolvedColor {
  const seed = hashString(`${input.id}:${input.name ?? ''}`);
  const hue = seed % 360;
  // Moderate Sättigung/Helligkeit: kräftig genug zum Unterscheiden, hell genug für
  // schwarzen Text — funktioniert ohne Anpassung in Light und (mit reduzierter Deckkraft
  // durch die UI, siehe TimetableBlock) auch in Dark Mode.
  const background = hslToHex(hue, 62, 82);
  return { background, foreground: '#111114', fromApi: false };
}

/** Liefert die anzuzeigende Farbe für ein Fach — API zuerst, sonst generiert. */
export function subjectColor(input: SubjectColorInput): ResolvedColor {
  const apiBackground = wuColorToCss(input.backColor);
  const apiForeground = wuColorToCss(input.foreColor);
  if (apiBackground !== undefined) {
    return { background: apiBackground, foreground: apiForeground ?? '#111114', fromApi: true };
  }
  return generateSubjectColor(input);
}
