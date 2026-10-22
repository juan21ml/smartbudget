import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Las pruebas de integración usan una base de datos SEPARADA definida en .env.test (TEST_DATABASE_URL).
dotenv.config({ path: '.env.test', quiet: true });

const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://sin-configurar@localhost:5432/smartbudget_test',
  DB_SSL: process.env.TEST_DB_SSL ?? 'false',
  JWT_SECRET: 'test-secret-key-for-automated-tests-only-0123456789',
  JWT_EXPIRES_IN: '1h',
  BCRYPT_ROUNDS: '4', // rápido en pruebas; en producción 12
  AUTH_RATE_LIMIT_MAX: '1000',
  GLOBAL_RATE_LIMIT_MAX: '100000',
  CORS_ORIGINS: 'http://localhost:5173',
  APP_TIMEZONE: 'America/Bogota',
};

// globalSetup corre en este mismo proceso, por eso también se asignan aquí.
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    environment: 'node',
    env: testEnv,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: { include: ['src/**'], exclude: ['src/server.js', 'src/database/seed.js'] },
    projects: [
      {
        // Lógica pura (cálculos, utilidades): no necesita base de datos.
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.js'] },
      },
      {
        // API completa contra PostgreSQL real.
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          globalSetup: ['./tests/helpers/globalSetup.js'],
          fileParallelism: false, // todas las pruebas comparten la base de datos de pruebas
        },
      },
    ],
  },
});
