import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import './shared-controls.css';

/** In-app confirmation for destructive actions. Never uses window.confirm, which blocks automation. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: {
  title: string; children?: ReactNode; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="confirm-dialog" role="alertdialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2>
    {children && <div className="confirm-dialog-body">{children}</div>}
    <div className="confirm-dialog-actions">
      <button type="button" autoFocus onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>;
}
