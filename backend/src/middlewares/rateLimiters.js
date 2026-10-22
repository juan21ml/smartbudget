import { rateLimit } from 'express-rate-limit';

function limitHandler(message) {
  return (_req, res) => {
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message } });
  };
}

/** Límite estricto para login y registro: frena ataques de fuerza bruta. */
export function createAuthLimiter({ max, windowMin }) {
  return rateLimit({
    windowMs: windowMin * 60_000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limitHandler(`Demasiados intentos. Intente de nuevo en ${windowMin} minutos.`),
  });
}

/** Límite general para toda la API. */
export function createGlobalLimiter({ max }) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limitHandler('Demasiadas solicitudes. Intente más tarde.'),
  });
}
