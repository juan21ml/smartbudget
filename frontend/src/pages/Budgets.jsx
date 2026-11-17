import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BudgetMeter, { idealFromPeriod } from '../components/BudgetMeter.jsx';
import { ConfirmModal, Empty, ErrorBox, Field, Loading, Modal, MonthPicker, PageHeader, StatusTag } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, apiError } from '../services/api.js';
import { currentMonth, dayShort, money, monthName, percent, today } from '../utils/format.js';

export default function Budgets() {
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState(params.get('nuevo') ? 'new' : null);
  const [deleting, setDeleting] = useState(null);
  const isCurrent = month === currentMonth();

  const categories = useApi(() => api.categories({ type: 'EXPENSE' }).then((r) => r.data), []);
  const list = useApi(() => api.budgets({ activeOn: `${month}-01`, limit: 50 }).then((r) => r.data), [month]);

  useEffect(() => {
    if (params.get('nuevo')) setParams({}, { replace: true });
  }, [params, setParams]);

  const totals = list.data?.reduce((acc, b) => ({ limit: acc.limit + b.amountLimit, spent: acc.spent + b.spent }), { limit: 0, spent: 0 });

  return (
    <div className="page">
      <PageHeader title="Presupuestos" lead="Un límite de gasto por categoría. Te avisamos al llegar al 80 % y al 100 %.">
        <MonthPicker value={month} onChange={setMonth} />
        <button className="btn btn--primary" onClick={() => setEditing('new')}>Nuevo presupuesto</button>
      </PageHeader>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}

      {list.data && list.data.length === 0 && (
        <Empty title={`No hay presupuestos en ${monthName(month)}`} action={<button className="btn btn--primary" onClick={() => setEditing('new')}>Crear presupuesto</button>}>
          Elige una categoría de gasto, ponle un límite y empieza a medir.
        </Empty>
      )}

      {list.data && list.data.length > 0 && (
        <>
          <p className="summary-line">
            En {monthName(month)} llevas <strong className="num">{money(totals.spent)}</strong> de{' '}
            <strong className="num">{money(totals.limit)}</strong> presupuestados ({percent((totals.spent / totals.limit) * 100)}).
          </p>
          <ul className="budget-cards">
            {list.data.map((b) => (
              <li key={b.id} className={`budget-card budget-card--${b.status}`}>
                <div className="budget-card-head">
                  <h2><Link to={`/presupuestos/${b.id}`}>{b.categoryName}</Link></h2>
                  <StatusTag status={b.status} />
                </div>
                <p className="budget-card-amount num">
                  {money(b.spent)} <span className="muted">de {money(b.amountLimit)}</span>
                </p>
                <BudgetMeter
                  percentageUsed={b.percentageUsed}
                  status={b.status}
                  size="lg"
                  idealPercentage={isCurrent ? idealFromPeriod(b.periodStart, b.periodEnd, today()) : undefined}
                />
                <p className="budget-card-meta num">
                  <span>{percent(b.percentageUsed)} usado</span>
                  <span>{dayShort(b.periodStart)} – {dayShort(b.periodEnd)}</span>
                </p>
                <div className="budget-card-actions">
                  <Link className="btn btn--ghost" to={`/presupuestos/${b.id}`}>Ver análisis</Link>
                  <button className="link-button" onClick={() => setEditing(b)}>Editar</button>
                  <button className="link-button danger" onClick={() => setDeleting(b)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Nuevo presupuesto' : 'Editar presupuesto'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <BudgetForm
            initial={editing === 'new' ? null : editing}
            defaultMonth={month}
            categories={categories.data ?? []}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); list.reload(); }}
          />
        )}
      </Modal>

      <DeleteBudget b={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); list.reload(); }} />
    </div>
  );
}

export function BudgetForm({ initial, defaultMonth, categories, onCancel, onSaved }) {
  const wholeMonth = !initial || (initial.periodStart.endsWith('-01') && initial.periodStart.slice(0, 7) === initial.periodEnd.slice(0, 7));
  const [mode, setMode] = useState(wholeMonth ? 'month' : 'range');
  const [form, setForm] = useState({
    categoryId: initial?.categoryId ?? '',
    amountLimit: initial ? String(initial.amountLimit) : '',
    month: initial?.periodStart.slice(0, 7) ?? defaultMonth,
    periodStart: initial?.periodStart ?? `${defaultMonth}-01`,
    periodEnd: initial?.periodEnd ?? '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      categoryId: form.categoryId,
      amountLimit: Number(form.amountLimit.replace(/\./g, '').replace(',', '.')),
      ...(mode === 'month' ? { month: form.month } : { periodStart: form.periodStart, periodEnd: form.periodEnd }),
    };
    try {
      await (initial ? api.updateBudget(initial.id, body) : api.createBudget(body));
      onSaved();
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Categoría de gasto">
        <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="" disabled>Elige una categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Límite (COP)">
        <input inputMode="decimal" required placeholder="500000" value={form.amountLimit} onChange={(e) => setForm({ ...form, amountLimit: e.target.value })} />
      </Field>
      <div className="segmented" role="radiogroup" aria-label="Periodo">
        {[['month', 'Mes completo'], ['range', 'Fechas exactas']].map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} className={mode === v ? 'is-active' : ''} onClick={() => setMode(v)}>{label}</button>
        ))}
      </div>
      {mode === 'month' ? (
        <Field label="Mes">
          <input type="month" required value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
        </Field>
      ) : (
        <div className="form-row">
          <Field label="Desde"><input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></Field>
          <Field label="Hasta"><input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></Field>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear presupuesto'}</button>
      </div>
    </form>
  );
}

export function DeleteBudget({ b, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setError(null), [b]);

  async function confirm() {
    setBusy(true);
    try {
      await api.deleteBudget(b.id);
      onDeleted();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmModal open={!!b} title="Eliminar presupuesto" onClose={onClose} onConfirm={confirm} busy={busy} error={error}>
      {b && <p>Se eliminará el presupuesto de {b.categoryName} ({dayShort(b.periodStart)} – {dayShort(b.periodEnd)}) y sus alertas. Los movimientos no se borran.</p>}
    </ConfirmModal>
  );
}
