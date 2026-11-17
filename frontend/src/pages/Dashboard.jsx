import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BudgetMeter, { idealFromPeriod } from '../components/BudgetMeter.jsx';
import { Empty, ErrorBox, Loading, MonthPicker, StatusTag } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import { currentMonth, money, moneyShort, monthName, monthShort, percent, timeAgo, today } from '../utils/format.js';

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const isCurrent = month === currentMonth();
  const start = `${month}-01`;

  const { data, error, loading, reload } = useApi(async () => {
    const [monthly, comparison, trend, budgets, alerts, prediction] = await Promise.all([
      api.monthly(month),
      api.comparison(month),
      api.trend(6),
      api.budgets({ activeOn: start, limit: 50 }),
      api.alerts({ unread: 'true', limit: 4 }),
      isCurrent ? api.prediction(month).catch(() => null) : Promise.resolve(null),
    ]);
    return { monthly: monthly.data, comparison: comparison.data, trend: trend.data, budgets: budgets.data, alerts: alerts.data, prediction: prediction?.data };
  }, [month]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Cómo vas en {monthName(month)}</h1>
          {data && <Headline monthly={data.monthly} isCurrent={isCurrent} />}
        </div>
        <div className="page-actions">
          <MonthPicker value={month} onChange={setMonth} max={currentMonth()} />
        </div>
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          <section className="budgets-board" aria-labelledby="h-presupuestos">
            <div className="section-head">
              <h2 id="h-presupuestos">Presupuestos del mes</h2>
              <Link to="/presupuestos">Administrar</Link>
            </div>
            {data.budgets.length === 0 ? (
              <Empty title="No tienes presupuestos para este mes" action={<Link className="btn btn--primary" to="/presupuestos?nuevo=1">Crear presupuesto</Link>}>
                Ponle un límite a una categoría y la app te avisa antes de pasarte.
              </Empty>
            ) : (
              <ul className="board-list">
                {data.budgets.map((b) => (
                  <li key={b.id}>
                    <Link to={`/presupuestos/${b.id}`} className="board-row">
                      <span className="board-name">{b.categoryName}</span>
                      <span className="board-amount num">
                        {money(b.spent)} <span className="muted">de {money(b.amountLimit)}</span>
                      </span>
                      <BudgetMeter
                        percentageUsed={b.percentageUsed}
                        status={b.status}
                        idealPercentage={isCurrent ? idealFromPeriod(b.periodStart, b.periodEnd, today()) : undefined}
                      />
                      <span className="board-foot">
                        <StatusTag status={b.status} />
                        <span className="num muted">
                          {b.remaining >= 0 ? `Quedan ${money(b.remaining)}` : `Excedido por ${money(-b.remaining)}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {isCurrent && data.budgets.length > 0 && (
              <p className="legend-note">
                <span className="legend-ideal" aria-hidden="true" /> La línea vertical marca dónde deberías ir hoy si gastaras parejo todo el mes.
              </p>
            )}
          </section>

          <div className="grid-2">
            <section className="panel" aria-labelledby="h-categorias">
              <h2 id="h-categorias">En qué se fue el dinero</h2>
              <CategoryBars categories={data.monthly.topCategories} total={data.monthly.expense} />
            </section>

            <section className="panel" aria-labelledby="h-tendencia">
              <h2 id="h-tendencia">Últimos 6 meses</h2>
              <TrendChart months={data.trend.months} />
            </section>
          </div>

          <div className="grid-2">
            {data.prediction ? (
              <section className="panel" aria-labelledby="h-prediccion">
                <h2 id="h-prediccion">Gasto estimado al cerrar el mes</h2>
                <Prediction p={data.prediction} />
              </section>
            ) : (
              <section className="panel" aria-labelledby="h-comparacion">
                <h2 id="h-comparacion">Frente al mes anterior</h2>
                <ComparisonList c={data.comparison} />
              </section>
            )}

            <section className="panel" aria-labelledby="h-avisos">
              <div className="section-head">
                <h2 id="h-avisos">Avisos sin leer</h2>
                <Link to="/alertas">Ver todos</Link>
              </div>
              {data.comparison.insights.length > 0 && (
                <ul className="insights">
                  {data.comparison.insights.map((i) => <li key={i}>{i}</li>)}
                </ul>
              )}
              {data.alerts.length === 0 ? (
                <p className="muted">No tienes avisos pendientes.</p>
              ) : (
                <ul className="alert-mini">
                  {data.alerts.map((a) => (
                    <li key={a.id} className={`alert-mini-item alert--${a.type}`}>
                      <span>{a.message}</span>
                      <span className="muted small">{timeAgo(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Headline({ monthly, isCurrent }) {
  const positive = monthly.balance >= 0;
  return (
    <p className="headline">
      Entraron <strong className="num">{money(monthly.income)}</strong> y salieron{' '}
      <strong className="num">{money(monthly.expense)}</strong>.{' '}
      {positive ? (
        <>Te {isCurrent ? 'quedan' : 'quedaron'} <strong className="num tone-ok">{money(monthly.balance)}</strong> ({percent(monthly.savingsRate)} de ahorro).</>
      ) : (
        <>Gastaste <strong className="num tone-over">{money(-monthly.balance)}</strong> más de lo que entró.</>
      )}
    </p>
  );
}

function CategoryBars({ categories, total }) {
  if (!categories.length) return <p className="muted">Sin gastos registrados en este mes.</p>;
  const max = categories[0].total;
  return (
    <ul className="cat-bars">
      {categories.map((c) => (
        <li key={c.categoryId}>
          <span className="cat-name">{c.categoryName}</span>
          <span className="cat-track"><span className="cat-fill" style={{ width: `${(c.total / max) * 100}%` }} /></span>
          <span className="num cat-value">{money(c.total)}</span>
          <span className="num muted cat-pct">{percent(c.percentage)}</span>
        </li>
      ))}
      <li className="cat-total">
        <span>Total de gastos</span>
        <span className="num">{money(total)}</span>
      </li>
    </ul>
  );
}

function TrendChart({ months }) {
  // Se omiten los meses vacíos anteriores al primer registro.
  const first = months.findIndex((m) => m.income > 0 || m.expense > 0);
  const rows = (first === -1 ? months : months.slice(first)).map((m) => ({ ...m, label: monthShort(m.month) }));
  return (
    <div className="chart" role="img" aria-label="Ingresos y gastos de los últimos seis meses">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis tickFormatter={moneyShort} tickLine={false} axisLine={false} width={52} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Tooltip formatter={(v) => money(v)} cursor={{ fill: 'var(--bg-sunk)' }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Bar maxBarSize={36} dataKey="income" name="Ingresos" fill="var(--ok-deep)" radius={[3, 3, 0, 0]} />
          <Bar maxBarSize={36} dataKey="expense" name="Gastos" fill="var(--ink-soft)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Prediction({ p }) {
  return (
    <div className="prediction">
      <p className="prediction-value num">{money(Math.round(p.predicted))}</p>
      <p>
        Llevas {money(p.spentToDate)} en {p.elapsedDays} de {p.totalDays} días.{' '}
        {p.modelVersion === 'blend-v1'
          ? `La estimación combina tu ritmo actual con el promedio de los ${p.historyMonthsUsed} meses anteriores (${money(Math.round(p.historicalAverage))}).`
          : 'La estimación usa tu ritmo de gasto de este mes.'}
      </p>
      <p className="muted small">
        Confianza {p.confidence === 'HIGH' ? 'alta' : p.confidence === 'MEDIUM' ? 'media' : 'baja'}. {p.limitations.at(-1)}
      </p>
    </div>
  );
}

function ComparisonList({ c }) {
  const rows = [
    ['Ingresos', c.income],
    ['Gastos', c.expense],
    ['Balance', c.balance],
  ];
  return (
    <table className="compare">
      <thead>
        <tr><th scope="col">Concepto</th><th scope="col" className="num">{monthShort(c.month)}</th><th scope="col" className="num">{monthShort(c.previousMonth)}</th><th scope="col" className="num">Cambio</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, r]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td className="num">{money(r.current)}</td>
            <td className="num muted">{money(r.previous)}</td>
            <td className="num">{r.changePercentage === null ? '—' : `${r.changePercentage > 0 ? '+' : ''}${percent(r.changePercentage)}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
