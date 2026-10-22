import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { DEFAULT_CATEGORIES } from '../categories/categories.defaults.js';

// Hash ficticio para comparar cuando el email no existe:
// así el login tarda lo mismo exista o no el usuario (evita enumerar cuentas por tiempo de respuesta).
let dummyHash;
async function getDummyHash() {
  dummyHash ??= await bcrypt.hash('dummy-password-for-timing', env.BCRYPT_ROUNDS);
  return dummyHash;
}

export function toPublicUser(row) {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}

export function signToken(user) {
  return jwt.sign({ tv: user.token_version }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

function authResponse(user) {
  const token = signToken(user);
  const { exp } = jwt.decode(token);
  return {
    user: toPublicUser(user),
    token,
    tokenType: 'Bearer',
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function register({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  try {
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, token_version, created_at`,
        [name, email, passwordHash],
      );
      const created = rows[0];

      // Categorías iniciales para que el usuario pueda empezar a registrar de inmediato.
      for (const cat of DEFAULT_CATEGORIES) {
        await client.query('INSERT INTO categories (user_id, name, type) VALUES ($1, $2, $3)', [
          created.id,
          cat.name,
          cat.type,
        ]);
      }
      return created;
    });

    return authResponse(user);
  } catch (err) {
    if (err.code === '23505') throw AppError.conflict('El email ya está registrado');
    throw err;
  }
}

export async function login({ email, password }) {
  const { rows } = await query(
    'SELECT id, name, email, password_hash, token_version, created_at FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];

  const valid = await bcrypt.compare(password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !valid) {
    // Mismo mensaje en ambos casos: no se revela si el email existe.
    throw AppError.unauthorized('Credenciales inválidas');
  }

  return authResponse(user);
}

/** Cierra sesión invalidando todos los tokens emitidos al usuario. */
export async function logout(userId) {
  await query('UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1', [userId]);
}

export async function getMe(userId) {
  const { rows } = await query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw AppError.notFound('Usuario no encontrado');
  return toPublicUser(rows[0]);
}
