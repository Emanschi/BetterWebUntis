import { describe, expect, it } from 'vitest';
import { subjectColor } from '../colors';

describe('subjectColor', () => {
  it('nutzt die API-Farbe, wenn vorhanden', () => {
    const result = subjectColor({ id: 1, name: 'M', foreColor: '000000', backColor: 'ee7f00' });
    expect(result.fromApi).toBe(true);
    expect(result.background).toBe('#ee7f00');
    expect(result.foreground).toBe('#000000');
  });

  it('generiert eine Farbe, wenn API-Farben fehlen', () => {
    const result = subjectColor({ id: 42, name: 'SEW' });
    expect(result.fromApi).toBe(false);
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
});
