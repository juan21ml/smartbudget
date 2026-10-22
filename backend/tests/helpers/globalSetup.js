/**
 * Se ejecuta una vez antes de todas las pruebas:
 * borra las tablas de la base de PRUEBAS y aplica las migraciones desde cero.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  // Protección: evita borrar por error una base que no sea de pruebas.
  if (!/test/i.test(url) && process.env.ALLOW_TEST_DB_RESET !== 'true') {
    throw new Error(
      'La URL de la base de pruebas no contiene "test". Por seguridad no se borrará. ' +
        'Si estás seguro de que es una base de pruebas, define ALLOW_TEST_DB_RESET=true.',
    );
  }

  const { pool } = await import('../../src/database/pool.js');
  const { runMigrations } = await import('../../src/database/migrate.js');

  // Solo se eliminan las tablas del proyecto (no el esquema completo, que en Supabase tiene permisos propios).
  await pool.query(
    'DROP TABLE IF EXISTS expense_predictions, alerts, budgets, transactions, categories, users, schema_migrations CASCADE',
  );
  await runMigrations({ log: () => {} });

  return async () => {
    await pool.end();
  };
}
