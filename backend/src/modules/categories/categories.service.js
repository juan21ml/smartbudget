import { query } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';

function toDto(row) {
  return { id: row.id, name: row.name, type: row.type, createdAt: row.created_at, updatedAt: row.updated_at };
}

const DUPLICATE_MSG = 'Ya existe una categoría con ese nombre y tipo';

export async function list(userId, { type }) {
  const { rows } = await query(
    `SELECT * FROM categories
     WHERE user_id = $1 AND ($2::text IS NULL OR type = $2)
     ORDER BY type, name`,
    [userId, type ?? null],
  );
  return rows.map(toDto);
}

/** Busca una categoría del usuario. Si es de otro usuario responde 404 (no se revela que existe). */
export async function findOwned(userId, id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rows[0]) throw AppError.notFound('Categoría no encontrada');
  return rows[0];
}

export async function getById(userId, id) {
  return toDto(await findOwned(userId, id));
}

export async function create(userId, { name, type }) {
  try {
    const { rows } = await query(
      'INSERT INTO categories (user_id, name, type) VALUES ($1, $2, $3) RETURNING *',
      [userId, name, type],
    );
    return toDto(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw AppError.conflict(DUPLICATE_MSG);
    throw err;
  }
}

export async function update(userId, id, changes) {
  const current = await findOwned(userId, id);

  if (changes.type && changes.type !== current.type) {
    const { rows } = await query(
      `SELECT (SELECT count(*) FROM transactions WHERE category_id = $1)
            + (SELECT count(*) FROM budgets WHERE category_id = $1) AS used`,
      [id],
    );
    if (Number(rows[0].used) > 0) {
      throw AppError.conflict('No se puede cambiar el tipo de una categoría que tiene transacciones o presupuestos');
    }
  }

  try {
    const { rows } = await query(
      `UPDATE categories SET name = $3, type = $4, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, changes.name ?? current.name, changes.type ?? current.type],
    );
    return toDto(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw AppError.conflict(DUPLICATE_MSG);
    throw err;
  }
}

export async function remove(userId, id) {
  await findOwned(userId, id);
  try {
    await query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
  } catch (err) {
    if (err.code === '23503') {
      throw AppError.conflict('No se puede eliminar: la categoría tiene transacciones o presupuestos asociados');
    }
    throw err;
  }
}
