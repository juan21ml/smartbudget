import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BudgetMeter from '../components/BudgetMeter.jsx';
import { ErrorBox, Loading, Modal, StatusTag } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, apiError, downloadFile } from '../services/api.js';
import { dateLong, dayShort, money, moneyShort, percent } from '../utils/format.js';
import { BudgetForm, DeleteBudget } from './Budgets.jsx';

const GROUPS = [['day', 'Por día'], ['week', 'Por semana'], ['month', 'Por mes']];

export default function BudgetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState('week');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [download, setDownload] = useState({ busy: false, error: null });

  const categories = useApi(() => api.categories({ type: 'EXPENSE' }).then((r) => r.data), []);
  const { data, error, loading, reload } = useApi(() => api.analysis(id, { groupBy }).then((r) => r.data), [id, groupBy]);

  async function downloadReport() {
    setDownload({ busy: true, error: null });
    try {
      await downloadFile(`/budgets/${id}/report`, { groupBy }, 'presupuesto.xlsx');
      setDownload({ busy: false, error: null });
    } catch (err) {
      setDownload({ busy: false, error: apiError(err) });
    }
  }

  if (error) return <div className="page"><Back /><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Back /><Loading label="Analizando el presupuesto…" /></div>;

  const { budget, summary, period, pace, breakdown, topExpenses, messages, alerts } = data;
  const idealPct = period.state === 'IN_PROGRESS' ? (period.elapsedDays / period.totalDays) * 100 : undefined;

  return (
    <div className="page">
      <Back />
      <div className="page-header">
        <div>
          <h1>{budget.categoryName}</h1>
          <p className="lead">
            {dateLong(period.start)} – {dateLong(period.end)} ·{' '}
            {period.state === 'IN_PROGRESS' ? `día ${period.elapsedDays} de ${period.totalDays}` : period.state === 'FINISHED' ? 'periodo terminado' : 'aún no empieza'}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn--ghost" onClick={downloadReport} disabled={download.busy}>{download.busy ? 'Generando…' : 'Descargar Excel'}</button>
          <button className="btn btn--ghost" onClick={() => setEditing(true)}>Editar</button>
          <button className="link-button danger" onClick={() => setDeleting(true)}>Eliminar</button>
        </div>
      </div>
      {download.error && <p className="form-error" role="alert">{download.error}</p>}

      <section className="analysis-hero" aria-labelledby="h-consumo">
        <h2 id="h-consumo" className="sr-only">Consumo</h2>
        <div className="analysis-figures">
          <div>
            <p className="figure num">{percent(summary.percentageUsed)}</p>
            <p className="figure-label">consumido <StatusTag status={summary.status} /></p>
          </div>
          <dl className="figure-list">
            <div><dt>Gastado</dt><dd className="num">{money(summary.spent)}</dd></div>
            <div><dt>Límite</dt><dd className="num">{money(summary.limit)}</dd></div>
            <div><dt>{summary.remaining >= 0 ? 'Disponible' : 'Excedido'}</dt><dd className={`num ${summary.remaining < 0 ? 'tone-over' : ''}`}>{money(Math.abs(summary.remaining))}</dd></div>
          </dl>
        </div>
        <BudgetMeter percentageUsed={summary.percentageUsed} status={summary.status} idealPercentage={idealPct} size="xl" />
        {idealPct !== undefined && (
          <p className="legend-note">
            <span className="legend-ideal" aria-hidden="true" /> Gastando parejo, hoy irías en {money(pace.idealSpentToDate)} ({percent(idealPct)}).{' '}
            {pace.deviationFromIdeal > 0 ? `Vas ${money(pace.deviationFromIdeal)} por encima.` : `Vas ${money(-pace.deviationFromIdeal)} por debajo.`}
          </p>
        )}
      </section>

      <ul className="messages" aria-label="Mensajes del análisis">
        {messages.map((m) => (
          <li key={m.code} className={`message message--${m.level}`}>{m.message}</li>
        ))}
      </ul>

      <div className="grid-2">
        <section className="panel" aria-labelledby="h-ritmo">
          <h2 id="h-ritmo">Ritmo de gasto</h2>
          <dl className="pace">
            <div><dt>Promedio diario</dt><dd className="num">{money(Math.round(pace.dailyAverage))}</dd></div>
            <div><dt>Proyección al cierre</dt><dd className="num">{money(Math.round(pace.projectedSpend))} <StatusTag status={pace.projectedStatus} /></dd></div>
            {pace.recommendedDailySpend !== null && (
              <div><dt>Máximo por día para no pasarte</dt><dd className="num">{money(Math.round(pace.recommendedDailySpend))}</dd></div>
            )}
            {pace.estimatedExhaustionDate && (
              <div><dt>Se agotaría el</dt><dd className="tone-over">{dateLong(pace.estimatedExhaustionDate)}</dd></div>
            )}
          </dl>
          <p className="muted small">{pace.method}.</p>
        </section>

        <section className="panel" aria-labelledby="h-top">
          <h2 id="h-top">Gastos más grandes</h2>
          {topExpenses.length === 0 ? (
            <p className="muted">Aún no hay gastos en este periodo.</p>
          ) : (
            <table className="table table--compact">
              <tbody>
                {topExpenses.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap muted">{dayShort(t.date)}</td>
                    <td>{t.description || 'Sin descripción'}</td>
                    <td className="num nowrap">{money(t.amount)}</td>
                    <td className="num muted nowrap">{percent(t.percentageOfSpent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="h-desglose">
        <div className="section-head">
          <h2 id="h-desglose">Desglose del gasto</h2>
          <div className="segmented segmented--small" role="radiogroup" aria-label="Agrupar">
            {GROUPS.map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={groupBy === v} className={groupBy === v ? 'is-active' : ''} onClick={() => setGroupBy(v)}>{label}</button>
            ))}
          </div>
        </div>
        <Breakdown items={breakdown.items} groupBy={breakdown.groupBy} limit={summary.limit} totalDays={period.totalDays} loading={loading} />
      </section>

      {alerts.length > 0 && (
        <section className="panel" aria-labelledby="h-alertas">
          <h2 id="h-alertas">Alertas de este presupuesto</h2>
          <ul className="alert-mini">
            {alerts.map((a) => <li key={a.id} className={`alert-mini-item alert--${a.type}`}><span>{a.message}</span></li>)}
          </ul>
        </section>
      )}

      <Modal open={editing} title="Editar presupuesto" onClose={() => setEditing(false)}>
        {editing && (
          <BudgetForm initial={budget} categories={categories.data ?? []} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
        )}
      </Modal>
      <DeleteBudget b={deleting ? budget : null} onClose={() => setDeleting(false)} onDeleted={() => navigate('/presupuestos')} />
    </div>
  );
}

function Back() {
  return <Link to="/presupuestos" className="back-link">Volver a presupuestos</Link>;
}

/** Barras de gasto por periodo. La línea punteada es la cuota pareja de cada barra. */
function Breakdown({ items, groupBy, limit, totalDays, loading }) {
  const rows = items.map((i) => ({
    ...i,
    short: groupBy === 'day' ? String(Number(i.from.slice(8))) : groupBy === 'week' ? `S${i.label.match(/\d+/)?.[0]}` : i.label,
  }));
  const days = (r) => (Date.parse(r.to) - Date.parse(r.from)) / 864e5 + 1;
  const even = groupBy === 'month' ? null : (limit / totalDays) * (rows[0] ? days(rows[0]) : 1);

  return (
    <div className={`chart ${loading ? 'is-loading' : ''}`} role="img" aria-label={`Gasto ${groupBy === 'day' ? 'diario' : groupBy === 'week' ? 'semanal' : 'mensual'} del presupuesto`}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="short" tickLine={false} axisLine={false} interval={groupBy === 'day' ? 2 : 0} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis tickFormatter={moneyShort} tickLine={false} axisLine={false} width={52} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: 'var(--bg-sunk)' }}
            formatter={(v) => [money(v), 'Gastado']}
            labelFormatter={(_, p) => p?.[0]?.payload.label ?? ''}
          />
          {even && <ReferenceLine y={even} stroke="var(--ink)" strokeDasharray="4 4" label={{ value: 'cuota pareja', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 12 }} />}
          <Bar dataKey="spent" radius={[3, 3, 0, 0]} maxBarSize={56}>
            {rows.map((r) => <Cell key={r.from} fill={even && r.spent > even ? 'var(--warn)' : 'var(--ok-deep)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {even && <p className="muted small">Las barras en ámbar superan la cuota pareja del periodo ({money(Math.round(even))} por {groupBy === 'day' ? 'día' : 'semana'}).</p>}
    </div>
  );
}
