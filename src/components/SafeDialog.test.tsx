import { forwardRef, useState, type DialogHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@digdir/designsystemet-react', () => ({
  Dialog: forwardRef<HTMLDialogElement, DialogHTMLAttributes<HTMLDialogElement>>(
    function MockDialog(props, ref) {
      return <dialog ref={ref} {...props} />;
    }
  )
}));

import { SafeDialog } from './SafeDialog';

function Harness({ onUserClose }: { onUserClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>Skjul</button>
      <SafeDialog open={open} onClose={() => { onUserClose?.(); setOpen(false); }}>
        <p>Bokinformasjon</p>
      </SafeDialog>
    </>
  );
}

describe('SafeDialog', () => {
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  const showModal = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    showModal.mockReset();
    close.mockReset();
    showModal.mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    close.mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: showModal
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value: close
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: originalShowModal
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value: originalClose
    });
  });

  it('opens with showModal and closes with close()', () => {
    render(<Harness />);
    expect(showModal).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Skjul' }));
    expect(close).toHaveBeenCalled();
  });

  it('does not treat a programmatic close as a user dismiss', () => {
    const onUserClose = vi.fn();
    render(<Harness onUserClose={onUserClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skjul' }));
    expect(onUserClose).not.toHaveBeenCalled();
  });
});
