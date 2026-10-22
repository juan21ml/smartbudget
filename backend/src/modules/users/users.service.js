import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { signToken, toPublicUser } from '../auth/auth.service.js';

async function verifyPassword(userId, password) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw AppError.unauthorized('La contraseña es incorrecta');
}

export async function updateProfile(userId, { name }) {
  const { rows } = await query(
    `UPDATE users SET name = $2, updated_at = now() WHERE id = $1
     RETURNING id, name, email, created_at`,
    [userId, name],
  );
  return toPublicUser(rows[0]);
}

/**
 * Cambia la contraseña y revoca todas las sesiones anteriores.
 * Devuelve un token nuevo para que el usuario siga conectado.
 */
export async function changePassword(userId, { currentPassword, newPassword }) {
  await verifyPassword(userId, currentPassword);
  const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  const { rows } = await query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1, updated_at = now()
     WHERE id = $1 RETURNING id, token_version`,
    [userId, hash],
  );
  return { token: signToken(rows[0]), tokenType: 'Bearer' };
}

/** Elimina la cuenta y, en cascada, todas sus categorías, transacciones, presupuestos y alertas. */
export async function deleteAccount(userId, { password }) {
  await verifyPassword(userId, password);
  // Transacciones y presupuestos referencian categorías con RESTRICT,
  // por eso se borran primero, todo dentro de una misma transacción SQL.
  await withTransaction(async (client) => {
    await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM budgets WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });
}
