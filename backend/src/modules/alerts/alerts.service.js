import { query } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { formatMoney } from '../../utils/format.js';
import { fromCents, percentage, toCents } from '../../utils/money.js';
import { THRESHOLDS, budgetStatus } from '../budgets/budgetAnalysis.js';
import { detectUnusualExpense } from './anomalyDetection.js';

// Ventana del historial usado para detectar gastos atípicos.
const HISTORY_DAYS = 180;
const HISTORY_LIMIT = 50;

function toDto(row) {
  return {
    id: row.id,
    budgetId: row.budget_id,
    transactionId: row.transaction_id ?? null,
    type: row.type,
    message: row.message,
    metadata: row.metadata,
    read: row.read_at !== null,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Suma de gastos de la categoría del presupuesto dentro de su periodo. */
export async function spentCentsForBudget(db, budget) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
     FROM transactions
     WHERE user_id = $1 AND category_id = $2 AND type = 'EXPENSE' AND date BETWEEN $3 AND $4`,
    [budget.user_id, budget.category_id, budget.period_start, budget.period_end],
  );
  return toCents(rows[0].total);
}

/**
 * Evalúa un presupuesto y genera las alertas que correspondan (80 % y 100 %).
 * ON CONFLICT DO NOTHING + índice único (budget_id, type) garantizan que
 * la misma alerta no se cree dos veces, aunque lleguen solicitudes simultáneas.
 * Devuelve solo las alertas NUEVAS creadas en esta evaluación.
 */
export async function evaluateBudget(db, budget) {
  const limitCents = toCents(budget.amount_limit);
  const spentCents = await spentCentsForBudget(db, budget);
  const pct = percentage(spentCents, limitCents);
  const category = budget.category_name ?? 'la categoría';

  const status = budgetStatus(spentCents, limitCents);
  const candidates = [];
  if (status === 'WARNING' || status === 'EXCEEDED') {
    candidates.push({
      type: 'BUDGET_WARNING',
      message:
        `Alcanzaste el ${THRESHOLDS.WARNING}% del presupuesto de ${category}: llevas ${pct}% ` +
        `(${formatMoney(spentCents)} de ${formatMoney(limitCents)}).`,
    });
  }
  if (status === 'EXCEEDED') {
    candidates.push({
      type: 'BUDGET_EXCEEDED',
      message:
        `Superaste el presupuesto de ${category}: llevas ${formatMoney(spentCents)} de ${formatMoney(limitCents)} (${pct}%).`,
    });
  }

  const created = [];
  for (const c of candidates) {
    const metadata = {
      percentage: pct,
      spent: fromCents(spentCents),
      limit: fromCents(limitCents),
      threshold: c.type === 'BUDGET_EXCEEDED' ? THRESHOLDS.EXCEEDED : THRESHOLDS.WARNING,
      periodStart: budget.period_start,
      periodEnd: budget.period_end,
    };
    const { rows } = await db.query(
      `INSERT INTO alerts (user_id, budget_id, type, message, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (budget_id, type) WHERE budget_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [budget.user_id, budget.id, c.type, c.message, metadata],
    );
    if (rows[0]) created.push(toDto(rows[0]));
  }
  return created;
}

/** Evalúa todos los presupuestos afectados por un gasto (misma categoría y fecha dentro del periodo). */
export async function evaluateForExpense(db, { userId, categoryId, date }) {
  const { rows: budgets } = await db.query(
    `SELECT b.*, c.name AS category_name
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = $1 AND b.category_id = $2 AND $3::date BETWEEN b.period_start AND b.period_end`,
    [userId, categoryId, date],
  );
  const created = [];
  for (const budget of budgets) created.push(...(await evaluateBudget(db, budget)));
  return created;
}

/**
 * Revisa si un gasto es atípico frente al historial de su categoría y, si lo es,
 * crea una alerta UNUSUAL_EXPENSE (una sola por transacción).
 */
export async function evaluateUnusualExpense(db, { userId, transactionId, categoryId, categoryName, amount, date }) {
  const { rows } = await db.query(
    `SELECT amount::text FROM transactions
     WHERE user_id = $1 AND category_id = $2 AND type = 'EXPENSE' AND id <> $3
       AND date <= $4::date AND date > $4::date - $5::int
     ORDER BY date DESC, created_at DESC
     LIMIT $6`,
    [userId, categoryId, transactionId, date, HISTORY_DAYS, HISTORY_LIMIT],
  );
  const amountCents = toCents(amount);
  const result = detectUnusualExpense(amountCents, rows.map((r) => toCents(r.amount)));
  if (!result.isUnusual) return [];

  const times = Number.isFinite(result.ratio) ? `${result.ratio.toLocaleString('es-CO')} veces` : 'muy por encima de';
  const message =
    `Gasto atípico en ${categoryName}: ${formatMoney(amountCents)} es ${times} tu gasto habitual ` +
    `(${formatMoney(result.medianCents)}) en esa categoría.`;
  const metadata = {
    amount: fromCents(amountCents),
    usualAmount: fromCents(result.medianCents),
    ratio: Number.isFinite(result.ratio) ? result.ratio : null,
    score: result.score,
    historySize: result.historySize,
    method: 'Puntaje Z modificado (mediana y MAD), umbral 3.5',
    date,
  };

  const { rows: inserted } = await db.query(
    `INSERT INTO alerts (user_id, transaction_id, type, message, metadata)
     VALUES ($1, $2, 'UNUSUAL_EXPENSE', $3, $4)
     ON CONFLICT (transaction_id, type) WHERE transaction_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [userId, transactionId, message, metadata],
  );
  return inserted.map(toDto);
}

export async function list(userId, { page, limit, unread, type }) {
  const where = ['user_id = $1'];
  const params = [userId];
  if (unread !== undefined) where.push(unread ? 'read_at IS NULL' : 'read_at IS NOT NULL');
  if (type) {
    params.push(type);
    where.push(`type = $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM alerts WHERE ${whereSql}`, params);
  const { rows } = await query(
    `SELECT * FROM alerts WHERE ${whereSql}
     ORDER BY created_at DESC, id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  const { rows: unreadRows } = await query(
    'SELECT count(*)::int AS n FROM alerts WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return { items: rows.map(toDto), total: countRows[0].total, unreadCount: unreadRows[0].n };
}

export async function markRead(userId, id) {
  const { rows } = await query(
    `UPDATE alerts SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId],
  );
  if (!rows[0]) throw AppError.notFound('Alerta no encontrada');
  return toDto(rows[0]);
}

export async function markAllRead(userId) {
  const { rowCount } = await query(
    'UPDATE alerts SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return { updated: rowCount };
}

export async function remove(userId, id) {
  const { rowCount } = await query('DELETE FROM alerts WHERE id = $1 AND user_id = $2', [id, userId]);
  if (rowCount === 0) throw AppError.notFound('Alerta no encontrada');
}

export async function listForBudget(userId, budgetId) {
  const { rows } = await query(
    'SELECT * FROM alerts WHERE user_id = $1 AND budget_id = $2 ORDER BY created_at',
    [userId, budgetId],
  );
  return rows.map(toDto);
}
