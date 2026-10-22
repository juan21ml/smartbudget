import { query } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { daysInclusive, monthRange, previousMonth } from '../../utils/dates.js';
import { formatMoney } from '../../utils/format.js';
import { fromCents, percentage, toCents } from '../../utils/money.js';

async function totals(userId, from, to) {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)::text  AS income,
       COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense,
       count(*)::int AS count
     FROM transactions WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
    [userId, from, to],
  );
  return { incomeCents: toCents(rows[0].income), expenseCents: toCents(rows[0].expense), count: rows[0].count };
}

async function byCategoryCents(userId, from, to, type) {
  const { rows } = await query(
    `SELECT c.id, c.name, COALESCE(SUM(t.amount), 0)::text AS total, count(t.id)::int AS count
     FROM categories c
     LEFT JOIN transactions t
       ON t.category_id = c.id AND t.user_id = c.user_id AND t.date BETWEEN $2 AND $3
     WHERE c.user_id = $1 AND c.type = $4
     GROUP BY c.id, c.name`,
    [userId, from, to, type],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, cents: toCents(r.total), count: r.count }));
}

/** Distribución por categoría: monto, porcentaje del total y número de movimientos. */
export async function categories(userId, { from, to, type }) {
  if (to < from) throw AppError.badRequest('La fecha final debe ser igual o posterior a la fecha inicial');
  const rows = (await byCategoryCents(userId, from, to, type)).filter((r) => r.cents > 0);
  const totalCents = rows.reduce((s, r) => s + r.cents, 0);
  return {
    from,
    to,
    type,
    total: fromCents(totalCents),
    categories: rows
      .sort((a, b) => b.cents - a.cents)
      .map((r) => ({
        categoryId: r.id,
        categoryName: r.name,
        total: fromCents(r.cents),
        percentage: percentage(r.cents, totalCents),
        transactionCount: r.count,
      })),
  };
}

/** Resumen financiero de un mes: ingresos, gastos, balance, tasa de ahorro y top de categorías. */
export async function monthly(userId, { month }) {
  const { start, end } = monthRange(month);
  const t = await totals(userId, start, end);
  const balanceCents = t.incomeCents - t.expenseCents;
  const dist = await categories(userId, { from: start, to: end, type: 'EXPENSE' });

  return {
    month,
    periodStart: start,
    periodEnd: end,
    income: fromCents(t.incomeCents),
    expense: fromCents(t.expenseCents),
    balance: fromCents(balanceCents),
    // Porcentaje del ingreso que no se gastó
    savingsRate: t.incomeCents > 0 ? percentage(balanceCents, t.incomeCents) : null,
    dailyAverageExpense: fromCents(Math.round(t.expenseCents / daysInclusive(start, end))),
    transactionCount: t.count,
    topCategories: dist.categories.slice(0, 5),
  };
}

/** Compara un mes con el anterior, por totales y por categoría, y genera observaciones. */
export async function comparison(userId, { month }) {
  const prev = previousMonth(month);
  const cur = monthRange(month);
  const old = monthRange(prev);

  const [curTotals, prevTotals, curCats, prevCats] = await Promise.all([
    totals(userId, cur.start, cur.end),
    totals(userId, old.start, old.end),
    byCategoryCents(userId, cur.start, cur.end, 'EXPENSE'),
    byCategoryCents(userId, old.start, old.end, 'EXPENSE'),
  ]);

  const change = (now, before) => ({
    current: fromCents(now),
    previous: fromCents(before),
    difference: fromCents(now - before),
    changePercentage: before > 0 ? percentage(now - before, before) : null,
  });

  const prevById = new Map(prevCats.map((c) => [c.id, c.cents]));
  const categoriesCmp = curCats
    .map((c) => ({ categoryId: c.id, categoryName: c.name, ...change(c.cents, prevById.get(c.id) ?? 0) }))
    .filter((c) => c.current > 0 || c.previous > 0)
    .sort((a, b) => b.difference - a.difference);

  const insights = [];
  const expenseChange = change(curTotals.expenseCents, prevTotals.expenseCents);
  if (expenseChange.changePercentage !== null) {
    const verb = expenseChange.difference >= 0 ? 'aumentaron' : 'disminuyeron';
    insights.push(
      `Tus gastos ${verb} ${Math.abs(expenseChange.changePercentage)}% respecto a ${prev} ` +
        `(${formatMoney(Math.abs(toCents(expenseChange.difference)))}).`,
    );
  }
  for (const c of categoriesCmp) {
    if (c.changePercentage !== null && c.changePercentage >= 30 && c.difference > 0) {
      insights.push(`En ${c.categoryName} gastaste ${c.changePercentage}% más que el mes anterior.`);
    }
    if (c.previous === 0 && c.current > 0) {
      insights.push(`Este mes tuviste gastos nuevos en ${c.categoryName} (${formatMoney(toCents(c.current))}).`);
    }
  }

  return {
    month,
    previousMonth: prev,
    income: change(curTotals.incomeCents, prevTotals.incomeCents),
    expense: expenseChange,
    balance: change(curTotals.incomeCents - curTotals.expenseCents, prevTotals.incomeCents - prevTotals.expenseCents),
    categories: categoriesCmp,
    insights,
  };
}

/** Serie mensual de los últimos N meses (para gráficas de tendencia). */
export async function trend(userId, { months, until }) {
  const list = [until];
  while (list.length < months) list.unshift(previousMonth(list[0]));
  const from = monthRange(list[0]).start;
  const to = monthRange(until).end;

  const { rows } = await query(
    `SELECT to_char(date, 'YYYY-MM') AS month,
            COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)::text  AS income,
            COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense
     FROM transactions WHERE user_id = $1 AND date BETWEEN $2 AND $3
     GROUP BY 1`,
    [userId, from, to],
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));

  const series = list.map((m) => {
    const r = byMonth.get(m);
    const inc = toCents(r?.income ?? 0);
    const exp = toCents(r?.expense ?? 0);
    return { month: m, income: fromCents(inc), expense: fromCents(exp), balance: fromCents(inc - exp) };
  });

  const withExpense = series.filter((s) => s.expense > 0);
  const avgExpenseCents = withExpense.length
    ? Math.round(withExpense.reduce((s, x) => s + toCents(x.expense), 0) / withExpense.length)
    : 0;

  return { months: series, averageMonthlyExpense: fromCents(avgExpenseCents) };
}
