import pino from 'pino';
import { env } from './env.js';

/**
 * Logger estructurado (JSON). Nunca registra contraseñas ni tokens.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.password_hash',
    ],
    censor: '[REDACTED]',
  },
});
