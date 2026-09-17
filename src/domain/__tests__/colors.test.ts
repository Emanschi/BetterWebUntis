import { describe, expect, it } from 'vitest';
import { contrastForeground, subjectColor } from '../colors';

describe('subjectColor', () => {
  it('nutzt die API-Farbe, wenn vorhanden', () => {
    const result = subjectColor({ id: 1, name: 'M', foreColor: '000000', backColor: 'ee7f00' });
    expect(result.source).toBe('api');
    expect(result.background).toBe('#ee7f00');
    expect(result.foreground).toBe('#000000');
  });

  it('generiert eine Farbe, wenn API-Farben fehlen', () => {
    const result = subjectColor({ id: 42, name: 'SEW' });
    expect(result.source).toBe('generated');
    expect(result.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.foreground).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ist deterministisch: gleiches Fach ergibt immer dieselbe generierte Farbe', () => {
    const a = subjectColor({ id: 7, name: 'REL' });
    const b = subjectColor({ id: 7, name: 'REL' });
    expect(a.background).toBe(b.background);
  });

  it('unterscheidet verschiedene Faecher meistens farblich', () => {
    const colors = [1, 2, 3, 4, 5, 6, 7].map((id) => subjectColor({ id, name: `Fach${id}` }).background);
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it('generiert auch ohne foreColor eine gueltige Textfarbe, wenn nur backColor da ist', () => {
    const result = subjectColor({ id: 1, backColor: 'ee7f00' });
    expect(result.foreground).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ein Override gewinnt gegen API-Farbe und generierte Farbe', () => {
    const withApi = subjectColor({ id: 1, name: 'M', foreColor: '000000', backColor: 'ee7f00' }, '#ff00ff');
    expect(withApi.source).toBe('custom');
    expect(withApi.background).toBe('#ff00ff');

    const withoutApi = subjectColor({ id: 99, name: 'X' }, '#00ffff');
    expect(withoutApi.source).toBe('custom');
    expect(withoutApi.background).toBe('#00ffff');
  });

  it('berechnet fuer einen Override eine kontrastreiche Textfarbe statt sie zu raten', () => {
    const dark = subjectColor({ id: 1 }, '#101014');
    expect(dark.foreground).toBe('#ffffff');

    const light = subjectColor({ id: 1 }, '#fef9c3');
    expect(light.foreground).toBe('#111114');
  });
});

describe('contrastForeground', () => {
  it('waehlt Weiss auf sehr dunklem Hintergrund', () => {
    expect(contrastForeground('#000000')).toBe('#ffffff');
  });

  it('waehlt Schwarz auf sehr hellem Hintergrund', () => {
    expect(contrastForeground('#ffffff')).toBe('#111114');
  });

  it('liefert immer einen gueltigen Hex-Wert', () => {
    for (const hex of ['#ee7f00', '#7dd3fc', '#111114', '#a855f7']) {
      expect(contrastForeground(hex)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
