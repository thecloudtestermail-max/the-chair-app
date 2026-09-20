// src/components/ui/Modal.tsx
'use client';
import { ReactNode, useEffect, useRef } from 'react';
import styles from './Modal.module.css';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Every caller passes onClose as an inline arrow function, so it's a new
  // reference on every render of the parent — including every keystroke in
  // a controlled input inside this modal (the input's onChange sets state,
  // the parent re-renders, a new onClose is created). A ref sidesteps that:
  // the keydown handler always reads the latest onClose via the ref, so
  // the effect below never needs onClose in its own dependency array and
  // never has to re-run just because the parent re-rendered.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Bug fix: this used to run on [open, onClose], so it refired — and
  // called dialogRef.current.focus() — on every keystroke, not just when
  // the dialog opened. Moving focus off the input a keystroke had just
  // landed in, back to the dialog wrapper, dismisses the on-screen
  // keyboard on mobile after a single character. Depending on [open]
  // alone means this runs exactly once per open/close, which is the only
  // time focus actually needs moving.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.title}>
            {title}
          </h2>
          <button className={styles.close} onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
