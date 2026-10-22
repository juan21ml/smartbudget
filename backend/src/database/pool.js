import fs from 'node:fs';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// DATE (OID 1082) se devuelve como texto 'YYYY-MM-DD' para evitar
// desfases de zona horaria al convertirlo en objeto Date de JavaScript.
pg.types.setTypeParser(1082, (value) => value);
// NUMERIC (OID 1700) se mantiene como texto para conservar la precisión
// decimal; la conversión a centavos se hace en utils/money.js.

function sslConfig() {
  if (env.DB_SSL === 'disable') return false;
  if (env.DB_SSL === 'verify') {
    return {
      rejectUnauthorized: true,
      ca: env.DB_SSL_CA_PATH ? fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8') : undefined,
    };
  }
  // 'require': conexión cifrada sin verificar la cadena del certificado.
  return { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslConfig(),
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en una conexión inactiva del pool');
});

/** Consulta parametrizada. Nunca concatenar valores del usuario en el SQL. */
export function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Ejecuta `fn` dentro de una transacción SQL. Si `fn` lanza un error se hace
 * ROLLBACK; de lo contrario COMMIT.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
