import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ConfirmModal, Empty, ErrorBox, Field, Loading, Modal, PageHeader } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, apiError } from '../services/api.js';
import { dayShort, money, today } from '../utils/format.js';

const EMPTY_FILTERS = { type: '', categoryId: '', from: '', to: '', search: '', sortBy: 'date', order: 'desc' };

export default function Transactions() {
  const { refreshUnread } = useOutletContext();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | transacción
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState(null);

  const categories = useApi(() => api.categories().then((r) => r.data), []);

  // La búsqueda espera a que dejes de escribir.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === search ? f : { ...f, search })), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [filters]);

  const list = useApi(() => {
    const params = Object.fromEntries(Object.entries({ ...filters, page, limit: 15 }).filter(([, v]) => v !== ''));
    return api.transactions(params);
  }, [filters, page]);

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  const filtered = Object.entries(filters).some(([k, v]) => v !== EMPTY_FILTERS[k]);

  function saved(result, wasNew) {
    setEditing(null);
    const alerts = result.alerts ?? [];
    setNotice({
      tone: alerts.length ? 'warn' : 'ok',
      text: alerts.length ? alerts.map((a) => a.message).join(' ') : wasNew ? 'Movimiento registrado.' : 'Cambios guardados.',
    });
    if (alerts.length) api.alerts({ unread: 'true', limit: 1 }).then((r) => refreshUnread(r.meta.unreadCount));
    list.reload();
  }

  return (
    <div className="page">
      <PageHeader title="Movimientos" lead="Todo lo que entra y sale. Los gastos se comparan con tus presupuestos al registrarlos.">
        <button className="btn btn--primary" onClick={() => setEditing('new')}>Registrar movimiento</button>
      </PageHeader>

      {notice && (
        <div className={`notice notice--${notice.tone}`} role="status">
          <p>{notice.text}</p>
          <button className="link-button" onClick={() => setNotice(null)}>Cerrar</button>
        </div>
      )}

      <form className="filters" onSubmit={(e) => e.preventDefault()} aria-label="Filtros">
        <Field label="Buscar">
          <input type="search" placeholder="Descripción" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Tipo">
          <select value={filters.type} onChange={set('type')}>
            <option value="">Todos</option>
            <option value="EXPENSE">Gastos</option>
            <option value="INCOME">Ingresos</option>
          </select>
        </Field>
        <Field label="Categoría">
          <select value={filters.categoryId} onChange={set('categoryId')}>
            <option value="">Todas</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Desde"><input type="date" value={filters.from} onChange={set('from')} /></Field>
        <Field label="Hasta"><input type="date" value={filters.to} onChange={set('to')} /></Field>
        <Field label="Ordenar">
          <select value={`${filters.sortBy}:${filters.order}`} onChange={(e) => { const [sortBy, order] = e.target.value.split(':'); setFilters({ ...filters, sortBy, order }); }}>
            <option value="date:desc">Más recientes</option>
            <option value="date:asc">Más antiguos</option>
            <option value="amount:desc">Mayor monto</option>
            <option value="amount:asc">Menor monto</option>
          </select>
        </Field>
        {filtered && (
          <button type="button" className="link-button filters-clear" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); }}>
            Quitar filtros
          </button>
        )}
      </form>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}

      {list.data && (
        <>
          <dl className="totals">
            <div><dt>Ingresos</dt><dd className="num tone-ok">{money(list.data.meta.totals.income)}</dd></div>
            <div><dt>Gastos</dt><dd className="num">{money(list.data.meta.totals.expense)}</dd></div>
            <div><dt>Balance</dt><dd className={`num ${list.data.meta.totals.balance < 0 ? 'tone-over' : ''}`}>{money(list.data.meta.totals.balance)}</dd></div>
            <div><dt>Movimientos</dt><dd className="num">{list.data.meta.total}</dd></div>
          </dl>

          {list.data.data.length === 0 ? (
            <Empty
              title={filtered ? 'Ningún movimiento coincide con los filtros' : 'Aún no has registrado movimientos'}
              action={!filtered && <button className="btn btn--primary" onClick={() => setEditing('new')}>Registrar el primero</button>}
            />
          ) : (
            <div className={`table-wrap ${list.loading ? 'is-loading' : ''}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Descripción</th>
                    <th scope="col">Categoría</th>
                    <th scope="col" className="num">Monto</th>
                    <th scope="col"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{dayShort(t.date)}</td>
                      <td>{t.description || <span className="muted">Sin descripción</span>}</td>
                      <td>{t.categoryName}</td>
                      <td className={`num nowrap ${t.type === 'INCOME' ? 'tone-ok' : ''}`}>{t.type === 'INCOME' ? '+' : '−'} {money(t.amount)}</td>
                      <td className="row-actions">
                        <button className="link-button" onClick={() => setEditing(t)}>Editar</button>
                        <button className="link-button danger" onClick={() => setDeleting(t)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {list.data.meta.totalPages > 1 && (
            <nav className="pager" aria-label="Paginación">
              <button className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span className="num">Página {page} de {list.data.meta.totalPages}</span>
              <button className="btn btn--ghost" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
            </nav>
          )}
        </>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Registrar movimiento' : 'Editar movimiento'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TransactionForm
            initial={editing === 'new' ? null : editing}
            categories={categories.data ?? []}
            onCancel={() => setEditing(null)}
            onSaved={(r) => saved(r, editing === 'new')}
          />
        )}
      </Modal>

      <DeleteTransaction t={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setNotice({ tone: 'ok', text: 'Movimiento eliminado.' }); list.reload(); }} />
    </div>
  );
}

function TransactionForm({ initial, categories, onCancel, onSaved }) {
  const [type, setType] = useState(initial?.type ?? 'EXPENSE');
  const [form, setForm] = useState({
    categoryId: initial?.categoryId ?? '',
    amount: initial ? String(initial.amount) : '',
    date: initial?.date ?? today(),
    description: initial?.description ?? '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = categories.filter((c) => c.type === type);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      categoryId: form.categoryId,
      amount: Number(form.amount.replace(/\./g, '').replace(',', '.')),
      date: form.date,
      description: form.description.trim() || null,
    };
    try {
      onSaved(initial ? await api.updateTransaction(initial.id, body) : await api.createTransaction(body));
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented" role="radiogroup" aria-label="Tipo de movimiento">
        {[['EXPENSE', 'Gasto'], ['INCOME', 'Ingreso']].map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={type === v}
            className={type === v ? 'is-active' : ''}
            onClick={() => { setType(v); setForm({ ...form, categoryId: '' }); }}
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="Categoría">
        <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="" disabled>Elige una categoría</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Monto (COP)">
          <input inputMode="decimal" required placeholder="150000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="Fecha">
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
      </div>
      <Field label="Descripción (opcional)">
        <input maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Registrar'}</button>
      </div>
    </form>
  );
}

function DeleteTransaction({ t, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setError(null), [t]);

  async function confirm() {
    setBusy(true);
    try {
      await api.deleteTransaction(t.id);
      onDeleted();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmModal open={!!t} title="Eliminar movimiento" onClose={onClose} onConfirm={confirm} busy={busy} error={error}>
      {t && <p>Se eliminará «{t.description || t.categoryName}» por {money(t.amount)} del {dayShort(t.date)}. No se puede deshacer.</p>}
    </ConfirmModal>
  );
}
