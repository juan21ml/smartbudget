import { query, withTransaction } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { fromCents, toCents } from '../../utils/money.js';
import * as alertsService from '../alerts/alerts.service.js';
import { findOwned as findOwnedCategory } from '../categories/categories.service.js';

const SELECT = `
  SELECT t.*, c.name AS category_name
  FROM transactions t JOIN categories c ON c.id = t.category_id
`;

// Lista blanca de columnas para ORDER BY: nunca se interpola texto del usuario en el SQL.
const SORT_COLUMNS = { date: 't.date', amount: 't.amount', createdAt: 't.created_at' };

function toDto(row) {
  return {
    id: row.id,
    type: row.type,
    amount: fromCents(toCents(row.amount)),
    date: row.date,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findOwned(userId, id, db = { query }) {
  const { rows } = await db.query(`${SELECT} WHERE t.id = $1 AND t.user_id = $2`, [id, userId]);
  if (!rows[0]) throw AppError.notFound('Transacción no encontrada');
  return rows[0];
}

async function expenseAlerts(db, { userId, transactionId, category, amount, date }) {
  if (category.type !== 'EXPENSE') return [];
  const budgetAlerts = await alertsService.evaluateForExpense(db, { userId, categoryId: category.id, date });
  const unusual = await alertsService.evaluateUnusualExpense(db, {
    userId,
    transactionId,
    categoryId: category.id,
    categoryName: category.name,
    amount,
    date,
  });
  return [...budgetAlerts, ...unusual];
}

export async function list(userId, filters) {
  const where = ['t.user_id = $1'];
  const params = [userId];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.type) add('t.type = ?', filters.type);
  if (filters.categoryId) add('t.category_id = ?', filters.categoryId);
  if (filters.from) add('t.date >= ?', filters.from);
  if (filters.to) add('t.date <= ?', filters.to);
  if (filters.minAmount !== undefined) add('t.amount >= ?', filters.minAmount);
  if (filters.maxAmount !== undefined) add('t.amount <= ?', filters.maxAmount);
  if (filters.search) {
    // Se escapan % y _ para que el texto se busque literalmente.
    add("t.description ILIKE ? ESCAPE '\\'", `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
  }

  const whereSql = where.join(' AND ');
  const orderSql = `${SORT_COLUMNS[filters.sortBy]} ${filters.order === 'asc' ? 'ASC' : 'DESC'}, t.created_at DESC, t.id`;

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total,
            COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'), 0)::text AS income,
            COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0)::text AS expense
     FROM transactions t WHERE ${whereSql}`,
    params,
  );
  const { rows } = await query(
    `${SELECT} WHERE ${whereSql} ORDER BY ${orderSql}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, (filters.page - 1) * filters.limit],
  );

  const income = toCents(countRows[0].income);
  const expense = toCents(countRows[0].expense);
  return {
    items: rows.map(toDto),
    total: countRows[0].total,
    totals: { income: fromCents(income), expense: fromCents(expense), balance: fromCents(income - expense) },
  };
}

export async function getById(userId, id) {
  return toDto(await findOwned(userId, id));
}

export async function create(userId, data) {
  return withTransaction(async (client) => {
    const category = await findOwnedCategory(userId, data.categoryId, client);
    const { rows } = await client.query(
      `INSERT INTO transactions (user_id, category_id, type, amount, date, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, category.id, category.type, data.amount, data.date, data.description ?? null],
    );

    // Si es un gasto: se revisan los presupuestos afectados (80 % / 100 %)
    // y si el monto es atípico frente al historial de la categoría.
    const alerts = await expenseAlerts(client, {
      userId,
      transactionId: rows[0].id,
      category,
      amount: data.amount,
      date: data.date,
    });

    return { transaction: toDto(await findOwned(userId, rows[0].id, client)), alerts };
  });
}

export async function update(userId, id, changes) {
  return withTransaction(async (client) => {
    const current = await findOwned(userId, id, client);
    const category = changes.categoryId
      ? await findOwnedCategory(userId, changes.categoryId, client)
      : { id: current.category_id, type: current.type };

    await client.query(
      `UPDATE transactions
       SET category_id = $3, type = $4, amount = $5, date = $6, description = $7, updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [
        id,
        userId,
        category.id,
        category.type,
        changes.amount ?? current.amount,
        changes.date ?? current.date,
        changes.description !== undefined ? changes.description : current.description,
      ],
    );

    const alerts = await expenseAlerts(client, {
      userId,
      transactionId: id,
      category: { ...category, name: category.name ?? current.category_name },
      amount: changes.amount ?? current.amount,
      date: changes.date ?? current.date,
    });

    return { transaction: toDto(await findOwned(userId, id, client)), alerts };
  });
}

export async function remove(userId, id) {
  const { rowCount } = await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, userId]);
  if (rowCount === 0) throw AppError.notFound('Transacción no encontrada');
}
