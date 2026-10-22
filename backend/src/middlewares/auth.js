import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../database/pool.js';
import { AppError } from '../utils/AppError.js';

/**
 * Protege rutas privadas.
 * 1. Exige el encabezado "Authorization: Bearer <token>".
 * 2. Verifica firma, expiración, emisor y audiencia del JWT (solo HS256: evita el ataque "alg: none").
 * 3. Comprueba que el usuario siga existiendo y que el token no haya sido revocado
 *    (token_version cambia al cerrar sesión, cambiar contraseña o eliminar la cuenta).
 */
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Token de autenticación requerido'));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'El token ha expirado' : 'Token inválido';
    return next(AppError.unauthorized(message));
  }

  const { rows } = await query('SELECT id, name, email, token_version FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];

  if (!user || user.token_version !== payload.tv) {
    return next(AppError.unauthorized('La sesión ya no es válida, inicie sesión nuevamente'));
  }

  req.user = { id: user.id, name: user.name, email: user.email, tokenVersion: user.token_version };
  next();
}
