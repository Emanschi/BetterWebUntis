// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('zeigt Titel und Inhalt', () => {
    render(
      <Modal title="Details" onClose={() => undefined}>
        <p>Inhalt</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('schließt beim Klick auf ✕', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Details" onClose={onClose}>
        <p>Inhalt</p>
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('schließt bei Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="Details" onClose={onClose}>
        <p>Inhalt</p>
      </Modal>,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('schließt beim Klick auf den Hintergrund', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Modal title="Details" onClose={onClose}>
        <p>Inhalt</p>
      </Modal>,
    );

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
