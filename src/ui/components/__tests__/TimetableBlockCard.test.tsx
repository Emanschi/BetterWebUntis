// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TimetableBlockCard } from '../TimetableBlockCard';
import type { TimetableBlock } from '../../../domain/timetable';

/**
 * Minimale Basis-Periode. `info` wird pro Test einzeln gesetzt/weggelassen — genau das
 * Feld, das den Info-Badge steuert (Nutzerwunsch 2026-09-22, siehe IDEEN.md B8: das
 * dokumentierte `Period.info`-Feld trägt an dieser Schule kurze Hinweise wie "Test"/"MÜ",
 * gemessenes Beispiel "SMÜ Nomenklatur" in TESTING.md).
 */
function makeBlock(overrides: Partial<TimetableBlock> = {}): TimetableBlock {
  return {
    periodIds: [1],
    date: 20260921,
    startTime: 800,
    endTime: 850,
    subject: { id: 1, name: 'D' },
    ...overrides,
  };
}

describe('TimetableBlockCard — Info-Badge', () => {
  it('zeigt einen Info-Badge, wenn die Periode ein info-Feld hat', () => {
    render(<TimetableBlockCard block={makeBlock({ info: 'SMÜ Nomenklatur' })} />);
    expect(screen.getByRole('img', { name: 'Zusatzinfo vorhanden' })).toBeInTheDocument();
  });

  it('zeigt KEINEN Info-Badge ohne info-Feld', () => {
    render(<TimetableBlockCard block={makeBlock()} />);
    expect(screen.queryByRole('img', { name: 'Zusatzinfo vorhanden' })).not.toBeInTheDocument();
  });

  it('zeigt KEINEN Info-Badge bei leerem info-String', () => {
    render(<TimetableBlockCard block={makeBlock({ info: '' })} />);
    expect(screen.queryByRole('img', { name: 'Zusatzinfo vorhanden' })).not.toBeInTheDocument();
  });

  it('der Volltext steht weiterhin nur im Tooltip/Titel der Karte, nicht im Badge selbst', () => {
    render(<TimetableBlockCard block={makeBlock({ info: 'SMÜ Nomenklatur' })} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'SMÜ Nomenklatur');
  });

  it('Klick auf die Karte (auch auf den Badge-Bereich) öffnet weiterhin die Detailansicht', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const block = makeBlock({ info: 'SMÜ Nomenklatur' });
    render(<TimetableBlockCard block={block} onOpen={onOpen} />);

    await user.click(screen.getByRole('button'));

    expect(onOpen).toHaveBeenCalledWith(block);
  });

  it('funktioniert auch neben dem lstype-Badge (beide sichtbar)', () => {
    render(<TimetableBlockCard block={makeBlock({ info: 'SMÜ Nomenklatur', lstype: 'ex' })} />);
    expect(screen.getByRole('img', { name: 'Zusatzinfo vorhanden' })).toBeInTheDocument();
    expect(screen.getByText('Prüfung')).toBeInTheDocument();
  });
});
