import { useEffect, useRef, type ComponentProps } from 'react';
import { Dialog } from '@digdir/designsystemet-react';

type DialogProps = ComponentProps<typeof Dialog>;

type SafeDialogProps = Omit<DialogProps, 'open'> & {
  open: boolean;
};

/**
 * Designsystemet's controlled `open` closes with `dialog.open = false`.
 * After `showModal()`, that can leave the dialog in the top layer and freeze
 * the rest of the page. Always open/close through `showModal()` / `close()`.
 */
export function SafeDialog({
  open,
  onClose,
  modal = true,
  ...rest
}: SafeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const skipCloseEventRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }

    if (open) {
      if (!dialog.open) {
        dialog[modal ? 'showModal' : 'show']();
      }
    } else if (dialog.open) {
      skipCloseEventRef.current = true;
      dialog.close();
      skipCloseEventRef.current = false;
    }

    return () => {
      if (dialog.open) {
        skipCloseEventRef.current = true;
        dialog.close();
        skipCloseEventRef.current = false;
      }
    };
  }, [open, modal]);

  return (
    <Dialog
      {...rest}
      ref={dialogRef}
      modal={modal}
      onClose={(event) => {
        if (skipCloseEventRef.current) {
          return;
        }
        onClose?.(event);
      }}
    />
  );
}
