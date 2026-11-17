import { useEffect, useRef } from 'react';
import { STATUS } from '../utils/format.js';

export function StatusTag({ status }) {
  const s = STATUS[status] ?? STATUS.OK;
  return <span className={`tag tag--${s.tone}`}>{s.label}</span>;
}

export function PageHeader({ title, children, lead }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }) {
  return <p className="state state--loading" role="status">{label}</p>;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      {onRetry && <button className="btn btn--ghost" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="state state--empty">
      <p className="state-title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** Diálogo modal nativo (<dialog>): Esc lo cierra y el foco queda dentro. */
export function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose} aria-labelledby="modal-title">
      {open && (
        <div className="modal-body">
          <div className="modal-head">
            <h2 id="modal-title">{title}</h2>
            <button className="link-button" onClick={onClose} aria-label="Cerrar">Cerrar</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Confirmación antes de borrar. */
export function ConfirmModal({ open, title, children, confirmLabel = 'Eliminar', onConfirm, onClose, busy, error }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="confirm-text">{children}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onClose} type="button">Cancelar</button>
        <button className="btn btn--danger" onClick={onConfirm} disabled={busy} type="button">
          {busy ? 'Eliminando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function MonthPicker({ value, onChange, max }) {
  return (
    <label className="month-picker">
      <span className="sr-only">Mes</span>
      <input type="month" value={value} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}
