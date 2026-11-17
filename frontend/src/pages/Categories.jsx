import { useEffect, useState } from 'react';
import { ConfirmModal, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, apiError } from '../services/api.js';

export default function Categories() {
  const list = useApi(() => api.categories().then((r) => r.data), []);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const groups = [
    ['EXPENSE', 'Gastos'],
    ['INCOME', 'Ingresos'],
  ];

  return (
    <div className="page page--narrow">
      <PageHeader title="Categorías" lead="Cada movimiento pertenece a una categoría, y cada presupuesto mide una categoría de gasto.">
        <button className="btn btn--primary" onClick={() => setEditing('new')}>Nueva categoría</button>
      </PageHeader>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}

      {list.data && (
        <div className="grid-2">
          {groups.map(([type, title]) => (
            <section key={type} className="panel" aria-labelledby={`h-${type}`}>
              <h2 id={`h-${type}`}>{title}</h2>
              <ul className="cat-list">
                {list.data.filter((c) => c.type === type).map((c) => (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    <span className="row-actions">
                      <button className="link-button" onClick={() => setEditing(c)}>Renombrar</button>
                      <button className="link-button danger" onClick={() => setDeleting(c)}>Eliminar</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Nueva categoría' : 'Renombrar categoría'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <CategoryForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />
        )}
      </Modal>

      <DeleteCategory c={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); list.reload(); }} />
    </div>
  );
}

function CategoryForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState({ name: initial?.name ?? '', type: initial?.type ?? 'EXPENSE' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (initial ? api.updateCategory(initial.id, { name: form.name.trim() }) : api.createCategory({ name: form.name.trim(), type: form.type }));
      onSaved();
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Nombre">
        <input required minLength={2} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      {!initial && (
        <Field label="Tipo">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="EXPENSE">Gasto</option>
            <option value="INCOME">Ingreso</option>
          </select>
        </Field>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : initial ? 'Guardar' : 'Crear categoría'}</button>
      </div>
    </form>
  );
}

function DeleteCategory({ c, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setError(null), [c]);

  async function confirm() {
    setBusy(true);
    try {
      await api.deleteCategory(c.id);
      onDeleted();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmModal open={!!c} title="Eliminar categoría" onClose={onClose} onConfirm={confirm} busy={busy} error={error}>
      {c && <p>Se eliminará la categoría «{c.name}». Si tiene movimientos o presupuestos, la API no lo permitirá.</p>}
    </ConfirmModal>
  );
}
