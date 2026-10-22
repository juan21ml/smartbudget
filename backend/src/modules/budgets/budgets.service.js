import { env } from '../../config/env.js';
import { query, withTransaction } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { daysInclusive, todayIn } from '../../utils/dates.js';
import { fromCents, percentage, toCents } from '../../utils/money.js';
import * as alertsService from '../alerts/alerts.service.js';
import { findOwned as findOwnedCategory } from '../categories/categories.service.js';
import { analyzeBudget, budgetStatus } from './budgetAnalysis.js';
import { MAX_PERIOD_DAYS } from './budgets.schemas.js';

// Gastado = suma de gastos de la categoría dentro del periodo del presupuesto.
const SELECT_WITH_SPENT = `
  SELECT b.*, c.name AS category_name, COALESCE(s.total, 0)::text AS spent
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(t.amount) AS total
    FROM transactions t
    WHERE t.user_id = b.user_id AND t.category_id = b.category_id
      AND t.type = 'EXPENSE' AND t.date BETWEEN b.period_start AND b.period_end
  ) s ON true
`;

export function toDto(row) {
  const limitCents = toCents(row.amount_limit);
  const spentCents = toCents(row.spent ?? 0);
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    amountLimit: fromCents(limitCents),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    spent: fromCents(spentCents),
    remaining: fromCents(limitCents - spentCents),
    percentageUsed: percentage(spentCents, limitCents),
    status: budgetStatus(spentCents, limitCents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Busca un presupuesto del usuario con su gasto acumulado. 404 si no existe o es de otro usuario. */
export async function findOwned(userId, id, db = { query }) {
  const { rows } = await db.query(`${SELECT_WITH_SPENT} WHERE b.id = $1 AND b.user_id = $2`, [id, userId]);
  if (!rows[0]) throw AppError.notFound('Presupuesto no encontrado');
  return rows[0];
}

async function validateBudget(db, userId, { categoryId, periodStart, periodEnd }, excludeId = null) {
  if (periodEnd < periodStart) {
    throw AppError.badRequest('La fecha final debe ser igual o posterior a la fecha inicial');
  }
  if (daysInclusive(periodStart, periodEnd) > MAX_PERIOD_DAYS) {
    throw AppError.badRequest(`El periodo no puede superar ${MAX_PERIOD_DAYS} días`);
  }

  // FOR UPDATE bloquea la categoría durante la transacción: dos solicitudes simultáneas
  // no pueden crear presupuestos solapados para la misma categoría.
  const category = await findOwnedCategory(userId, categoryId, db);
  await db.query('SELECT id FROM categories WHERE id = $1 FOR UPDATE', [categoryId]);

  if (category.type !== 'EXPENSE') {
    throw AppError.badRequest('El presupuesto debe asociarse a una categoría de gasto (EXPENSE)');
  }

  const { rows } = await db.query(
    `SELECT id, period_start, period_end FROM budgets
     WHERE user_id = $1 AND category_id = $2
       AND period_start <= $4 AND period_end >= $3
       AND ($5::uuid IS NULL OR id <> $5)
     LIMIT 1`,
    [userId, categoryId, periodStart, periodEnd, excludeId],
  );
  if (rows[0]) {
    throw AppError.conflict(
      `Ya existe un presupuesto para "${category.name}" que se cruza con ese periodo ` +
        `(${rows[0].period_start} a ${rows[0].period_end})`,
    );
  }
}

export async function list(userId, { page, limit, categoryId, activeOn, status }) {
  const where = ['b.user_id = $1'];
  const params = [userId];
  if (categoryId) {
    params.push(categoryId);
    where.push(`b.category_id = $${params.length}`);
  }
  if (activeOn) {
    params.push(activeOn);
    where.push(`$${params.length}::date BETWEEN b.period_start AND b.period_end`);
  }

  // Mismas reglas que budgetStatus(): se filtra con aritmética exacta en NUMERIC.
  const statusFilter = {
    EXCEEDED: 'spent::numeric >= amount_limit',
    WARNING: 'spent::numeric >= amount_limit * 0.8 AND spent::numeric < amount_limit',
    OK: 'spent::numeric < amount_limit * 0.8',
  }[status];

  const base = `WITH data AS (${SELECT_WITH_SPENT} WHERE ${where.join(' AND ')})
                SELECT * FROM data ${statusFilter ? `WHERE ${statusFilter}` : ''}`;

  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM (${base}) x`, params);
  const { rows } = await query(
    `${base} ORDER BY period_start DESC, category_name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  return { items: rows.map(toDto), total: countRows[0].total };
}

/** Presupuestos cuyo periodo se cruza con [from, to] (para el reporte mensual). */
export async function listOverlapping(userId, from, to) {
  const { rows } = await query(
    `${SELECT_WITH_SPENT} WHERE b.user_id = $1 AND b.period_start <= $3 AND b.period_end >= $2
     ORDER BY c.name, b.period_start`,
    [userId, from, to],
  );
  return rows.map(toDto);
}

export async function getById(userId, id) {
  return toDto(await findOwned(userId, id));
}

export async function create(userId, data) {
  return withTransaction(async (client) => {
    await validateBudget(client, userId, data);
    const { rows } = await client.query(
      `INSERT INTO budgets (user_id, category_id, amount_limit, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, data.categoryId, data.amountLimit, data.periodStart, data.periodEnd],
    );
    const budget = await findOwned(userId, rows[0].id, client);
    // Si ya había gastos registrados en el periodo, puede generar alertas de inmediato.
    const alerts = await alertsService.evaluateBudget(client, budget);
    return { budget: toDto(budget), alerts };
  });
}

export async function update(userId, id, changes) {
  return withTransaction(async (client) => {
    const current = await findOwned(userId, id, client);
    const merged = {
      categoryId: changes.categoryId ?? current.category_id,
      amountLimit: changes.amountLimit ?? current.amount_limit,
      periodStart: changes.periodStart ?? current.period_start,
      periodEnd: changes.periodEnd ?? current.period_end,
    };
    await validateBudget(client, userId, merged, id);

    await client.query(
      `UPDATE budgets SET category_id = $3, amount_limit = $4, period_start = $5, period_end = $6, updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [id, userId, merged.categoryId, merged.amountLimit, merged.periodStart, merged.periodEnd],
    );
    const budget = await findOwned(userId, id, client);
    const alerts = await alertsService.evaluateBudget(client, budget);
    return { budget: toDto(budget), alerts };
  });
}

export async function remove(userId, id) {
  const { rowCount } = await query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [id, userId]);
  if (rowCount === 0) throw AppError.notFound('Presupuesto no encontrado');
}

/** Gastos de la categoría dentro del periodo del presupuesto. */
export async function expensesForBudget(budget) {
  const { rows } = await query(
    `SELECT id, date, amount::text, description FROM transactions
     WHERE user_id = $1 AND category_id = $2 AND type = 'EXPENSE' AND date BETWEEN $3 AND $4
     ORDER BY date, created_at`,
    [budget.user_id, budget.category_id, budget.period_start, budget.period_end],
  );
  return rows.map((r) => ({ id: r.id, date: r.date, amountCents: toCents(r.amount), description: r.description }));
}

/** Funcionalidad especial: análisis completo del presupuesto. */
export async function analyze(userId, id, options) {
  const { transactions: _omit, ...publicResult } = await analyzeWithTransactions(userId, id, options);
  return publicResult;
}

/** Igual que analyze() pero incluye la lista de gastos (la usa el reporte Excel). */
export async function analyzeWithTransactions(userId, id, { groupBy, asOf }) {
  const budget = await findOwned(userId, id);
  const transactions = await expensesForBudget(budget);
  const newAlerts = await alertsService.evaluateBudget({ query }, budget);

  const analysis = analyzeBudget({
    limitCents: toCents(budget.amount_limit),
    periodStart: budget.period_start,
    periodEnd: budget.period_end,
    transactions,
    asOf: asOf ?? todayIn(env.APP_TIMEZONE),
    groupBy,
    categoryName: budget.category_name,
  });

  return {
    budget: toDto(budget),
    ...analysis,
    alerts: await alertsService.listForBudget(userId, id),
    newAlerts,
    transactions,
  };
}
