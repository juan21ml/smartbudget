/**
 * Datos de demostración: crea el usuario demo@smartbudget.com con 4 meses de
 * ingresos y gastos realistas y presupuestos para el mes actual.
 * Útil para mostrar el análisis, las alertas y los reportes en la sustentación.
 *
 * Uso: npm run seed   (se puede ejecutar varias veces: borra y recrea al usuario demo)
 */
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { addDays, monthRange, previousMonth, todayIn } from '../utils/dates.js';
import { evaluateBudget, evaluateUnusualExpense } from '../modules/alerts/alerts.service.js';
import { register } from '../modules/auth/auth.service.js';
import { pool, withTransaction } from './pool.js';

export const DEMO_USER = { name: 'Usuario Demo', email: 'demo@smartbudget.com', password: 'Demo12345' };

// Generador pseudoaleatorio con semilla fija: los datos son iguales en cada ejecución.
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const EXPENSE_PATTERNS = [
  // categoría, veces por mes, monto mínimo, monto máximo, descripciones
  ['Alimentación', 10, 25000, 120000, ['Mercado', 'Supermercado', 'Panadería', 'Restaurante', 'Domicilio']],
  ['Transporte', 12, 3000, 45000, ['Bus', 'Taxi', 'Gasolina', 'Parqueadero']],
  ['Servicios', 3, 60000, 180000, ['Energía', 'Agua', 'Internet']],
  ['Entretenimiento', 4, 15000, 90000, ['Cine', 'Streaming', 'Salida con amigos']],
  ['Salud', 1, 30000, 150000, ['Farmacia', 'Consulta médica']],
  ['Educación', 1, 50000, 200000, ['Libros', 'Curso en línea']],
];

export async function seed({ log = console.log } = {}) {
  await pool.query('DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [DEMO_USER.email]);
  await pool.query('DELETE FROM budgets WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [DEMO_USER.email]);
  await pool.query('DELETE FROM users WHERE email = $1', [DEMO_USER.email]);

  const { user } = await register(DEMO_USER);
  const { rows: cats } = await pool.query('SELECT id, name FROM categories WHERE user_id = $1', [user.id]);
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  const today = todayIn(env.APP_TIMEZONE);
  const currentMonth = today.slice(0, 7);
  const months = [currentMonth];
  while (months.length < 4) months.unshift(previousMonth(months[0]));

  const rand = seededRandom(2026);
  const rows = [];

  for (const month of months) {
    const { start, end } = monthRange(month);
    const lastDay = month === currentMonth ? today : end;
    const days = Number(lastDay.slice(8, 10));

    rows.push([catId.Salario, 'INCOME', 3500000, start, 'Salario mensual']);
    rows.push([catId.Vivienda, 'EXPENSE', 1200000, addDays(start, 4), 'Arriendo']);

    for (const [name, times, min, max, descriptions] of EXPENSE_PATTERNS) {
      // En el mes actual solo se generan los gastos de los días ya transcurridos
      const count = Math.max(1, Math.round((times * days) / 30));
      for (let i = 0; i < count; i += 1) {
        const day = 1 + Math.floor(rand() * days);
        const amount = Math.round((min + rand() * (max - min)) / 100) * 100;
        const desc = descriptions[Math.floor(rand() * descriptions.length)];
        rows.push([catId[name], 'EXPENSE', amount, addDays(start, day - 1), desc]);
      }
    }
  }

  await withTransaction(async (client) => {
    for (const [categoryId, type, amount, date, description] of rows) {
      await client.query(
        'INSERT INTO transactions (user_id, category_id, type, amount, date, description) VALUES ($1,$2,$3,$4,$5,$6)',
        [user.id, categoryId, type, amount, date, description],
      );
    }

    // Un gasto claramente atípico en el mes actual para demostrar la detección (mediana + MAD).
    const unusualDate = today;
    const { rows: unusual } = await client.query(
      `INSERT INTO transactions (user_id, category_id, type, amount, date, description)
       VALUES ($1, $2, 'EXPENSE', 420000, $3, 'Boletas concierto') RETURNING id`,
      [user.id, catId.Entretenimiento, unusualDate],
    );
    await evaluateUnusualExpense(client, {
      userId: user.id,
      transactionId: unusual[0].id,
      categoryId: catId.Entretenimiento,
      categoryName: 'Entretenimiento',
      amount: 420000,
      date: unusualDate,
    });

    // Presupuestos del mes actual: uno holgado, uno ajustado y uno que se excede.
    const { start, end } = monthRange(currentMonth);
    const budgets = [
      ['Alimentación', 700000],
      ['Transporte', 250000],
      ['Entretenimiento', 120000],
      ['Servicios', 400000],
    ];
    for (const [name, limit] of budgets) {
      const { rows: b } = await client.query(
        `INSERT INTO budgets (user_id, category_id, amount_limit, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [user.id, catId[name], limit, start, end],
      );
      await evaluateBudget(client, { ...b[0], category_name: name });
    }
  });

  log(`✔ Usuario demo creado: ${DEMO_USER.email} / ${DEMO_USER.password}`);
  log(`  ${rows.length + 1} transacciones entre ${months[0]} y ${currentMonth}, 4 presupuestos en ${currentMonth}`);
  return user;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error('Error al crear datos demo:', err.message);
      await pool.end();
      process.exit(1);
    });
}
