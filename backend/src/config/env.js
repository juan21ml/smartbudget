import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuración centralizada. Se valida al arrancar: si falta una variable
 * crítica (por ejemplo JWT_SECRET o DATABASE_URL) la aplicación no inicia.
 */

// DB_SSL acepta: false | true | require | verify
//   false   → sin cifrado (PostgreSQL local)
//   true / require → cifrado TLS sin verificar el certificado (Supabase rápido)
//   verify  → cifrado TLS verificando el certificado con DB_SSL_CA_PATH (recomendado en producción)
const sslMode = z
  .string()
  .default('false')
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(['false', 'disable', 'true', 'require', 'verify']))
  .transform((v) => (v === 'false' || v === 'disable' ? 'disable' : v === 'verify' ? 'verify' : 'require'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DB_SSL: sslMode,
  DB_SSL_CA_PATH: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_ISSUER: z.string().default('smartbudget-api'),
  JWT_AUDIENCE: z.string().default('smartbudget-client'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MIN: z.coerce.number().positive().default(15),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // Número de proxies delante de la API (Render = 1). Necesario para que el rate limit use la IP real.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  APP_TIMEZONE: z.string().default('America/Bogota'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Configuración inválida en las variables de entorno:\n${issues}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && /cambia-esto/i.test(parsed.data.JWT_SECRET)) {
  console.error('JWT_SECRET sigue con el valor de ejemplo. Genera uno aleatorio antes de desplegar.');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
