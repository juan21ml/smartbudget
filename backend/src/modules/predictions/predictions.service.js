import { query } from '../../database/pool.js';
import { AppError } from '../../utils/AppError.js';
import { monthRange, previousMonth } from '../../utils/dates.js';
import { centsToDb, fromCents, toCents } from '../../utils/money.js';
import { MAX_HISTORY_MONTHS, mape, predictMonthEnd, predictionError } from './expensePrediction.js';

async function expenseTotal(userId, from, to) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
     FROM transactions WHERE user_id = $1 AND type = 'EXPENSE' AND date BETWEEN $2 AND $3`,
    [userId, from, to],
  );
  return toCents(rows[0].total);
}

/**
 * Totales de gasto de los meses completos anteriores a `month`, del más antiguo al más reciente.
 * Se omiten los meses previos al primer gasto registrado (no son "meses en cero", son meses sin datos).
 */
async function monthlyHistory(userId, month) {
  const months = [];
  let m = month;
  for (let i = 0; i < MAX_HISTORY_MONTHS; i += 1) {
    m = previousMonth(m);
    months.unshift(m);
  }
  const from = monthRange(months[0]).start;
  const to = monthRange(months[months.length - 1]).end;

  const { rows } = await query(
    `SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount)::text AS total
     FROM transactions WHERE user_id = $1 AND type = 'EXPENSE' AND date BETWEEN $2 AND $3
     GROUP BY 1`,
    [userId, from, to],
  );
  const byMonth = new Map(rows.map((r) => [r.month, toCents(r.total)]));
  const firstWithData = months.findIndex((mm) => byMonth.has(mm));
  if (firstWithData === -1) return [];
  return months.slice(firstWithData).map((mm) => ({ month: mm, cents: byMonth.get(mm) ?? 0 }));
}

function toStoredDto(row) {
  return {
    asOf: row.as_of,
    predicted: fromCents(toCents(row.predicted_amount)),
    spentToDate: fromCents(toCents(row.spent_to_date)),
    modelVersion: row.model_version,
    createdAt: row.created_at,
  };
}

async function storedPredictions(userId, start, end) {
  const { rows } = await query(
    `SELECT * FROM expense_predictions
     WHERE user_id = $1 AND period_start = $2 AND period_end = $3
     ORDER BY as_of, model_version`,
    [userId, start, end],
  );
  return rows;
}

/**
 * GET /predictions/expenses
 * - Mes en curso: calcula la predicción, la guarda (una por día) y devuelve su evolución.
 * - Mes pasado: devuelve el gasto real y el error de cada predicción guardada.
 */
export async function expenses(userId, { month, asOf }) {
  const { start, end } = monthRange(month);

  if (asOf < start) {
    throw AppError.badRequest('No se puede predecir un mes que aún no ha comenzado');
  }

  if (asOf > end) {
    // Mes finalizado → evaluación de las predicciones que se hicieron.
    const actualCents = await expenseTotal(userId, start, end);
    const stored = await storedPredictions(userId, start, end);
    const evaluated = stored.map((row) => ({
      ...toStoredDto(row),
      ...predictionError(toCents(row.predicted_amount), actualCents),
    }));
    return {
      month,
      periodStart: start,
      periodEnd: end,
      state: 'FINISHED',
      actual: fromCents(actualCents),
      predictions: evaluated,
      mape: mape(evaluated.map((e) => e.percentageError)),
      note:
        evaluated.length === 0
          ? 'No se guardaron predicciones durante este mes.'
          : 'MAPE = promedio del error porcentual absoluto de las predicciones del mes.',
    };
  }

  const spentToDateCents = await expenseTotal(userId, start, asOf);
  const history = await monthlyHistory(userId, month);
  const prediction = predictMonthEnd({
    spentToDateCents,
    periodStart: start,
    periodEnd: end,
    asOf,
    historyCents: history.map((h) => h.cents),
  });

  await query(
    `INSERT INTO expense_predictions (user_id, period_start, period_end, as_of, spent_to_date, predicted_amount, model_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, period_start, period_end, as_of, model_version)
     DO UPDATE SET spent_to_date = EXCLUDED.spent_to_date, predicted_amount = EXCLUDED.predicted_amount, created_at = now()`,
    [userId, start, end, asOf, centsToDb(spentToDateCents), centsToDb(prediction.predictedCents), prediction.modelVersion],
  );

  const { predictedCents: _omit, ...publicPrediction } = prediction;
  return {
    month,
    periodStart: start,
    periodEnd: end,
    asOf,
    state: 'IN_PROGRESS',
    ...publicPrediction,
    history: history.map((h) => ({ month: h.month, expense: fromCents(h.cents) })),
    evolution: (await storedPredictions(userId, start, end)).map(toStoredDto),
    disclaimer: 'Estimación orientativa basada en los datos registrados; no es una recomendación financiera.',
  };
}

/** GET /predictions/accuracy — error de la última predicción de cada mes finalizado. */
export async function accuracy(userId, { months, until }) {
  const list = [until];
  while (list.length < months) list.unshift(previousMonth(list[0]));

  const results = [];
  for (const m of list) {
    const { start, end } = monthRange(m);
    const { rows } = await query(
      `SELECT * FROM expense_predictions
       WHERE user_id = $1 AND period_start = $2 AND period_end = $3
       ORDER BY as_of DESC LIMIT 1`,
      [userId, start, end],
    );
    if (!rows[0]) continue;
    const actualCents = await expenseTotal(userId, start, end);
    results.push({
      month: m,
      actual: fromCents(actualCents),
      lastPrediction: toStoredDto(rows[0]),
      ...predictionError(toCents(rows[0].predicted_amount), actualCents),
    });
  }

  return {
    months: results,
    mape: mape(results.map((r) => r.percentageError)),
    note: 'Se compara la última predicción guardada de cada mes con su gasto real.',
  };
}
