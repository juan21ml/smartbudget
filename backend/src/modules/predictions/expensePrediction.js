/**
 * PREDICCIÓN DEL GASTO TOTAL DEL MES (función pura, sin base de datos)
 *
 * Modelos:
 *  - runrate-v1  Ritmo de gasto: (gastado hasta hoy / días transcurridos) × días del mes.
 *                Se usa cuando hay menos de 3 meses completos de historial.
 *  - blend-v1    Combina el ritmo actual con el promedio de los meses anteriores.
 *                Al inicio del mes pesa más el historial (el ritmo de 2 días no es fiable);
 *                al final pesa más el ritmo actual. Peso del ritmo = días transcurridos / días del mes.
 *
 * Regla de sentido común: la predicción nunca es menor que lo ya gastado.
 * Todo en centavos enteros.
 */
import { daysInclusive } from '../../utils/dates.js';
import { fromCents } from '../../utils/money.js';

export const MIN_HISTORY_MONTHS = 3;
export const MAX_HISTORY_MONTHS = 6;

export function predictMonthEnd({ spentToDateCents, periodStart, periodEnd, asOf, historyCents = [] }) {
  const totalDays = daysInclusive(periodStart, periodEnd);
  const elapsedDays = Math.min(totalDays, Math.max(1, daysInclusive(periodStart, asOf)));
  const progress = elapsedDays / totalDays;

  const runRateCents = Math.round((spentToDateCents / elapsedDays) * totalDays);
  const history = historyCents.slice(-MAX_HISTORY_MONTHS);
  const historicalAverageCents =
    history.length > 0 ? Math.round(history.reduce((s, v) => s + v, 0) / history.length) : null;

  let modelVersion;
  let predictedCents;
  if (history.length >= MIN_HISTORY_MONTHS) {
    modelVersion = 'blend-v1';
    predictedCents = Math.round(progress * runRateCents + (1 - progress) * historicalAverageCents);
  } else {
    modelVersion = 'runrate-v1';
    predictedCents = runRateCents;
  }
  predictedCents = Math.max(predictedCents, spentToDateCents);

  let confidence = 'MEDIUM';
  if (elapsedDays < 7 && history.length < MIN_HISTORY_MONTHS) confidence = 'LOW';
  else if (elapsedDays >= 15 && history.length >= MIN_HISTORY_MONTHS) confidence = 'HIGH';

  const limitations = [];
  if (elapsedDays < 7) {
    limitations.push(`Solo han transcurrido ${elapsedDays} días del periodo: el ritmo de gasto todavía es poco representativo.`);
  }
  if (history.length < MIN_HISTORY_MONTHS) {
    limitations.push(
      `Hay ${history.length} mes(es) completos de historial; se necesitan ${MIN_HISTORY_MONTHS} para combinar con el promedio histórico.`,
    );
  }
  limitations.push('La estimación supone que el gasto futuro sigue el patrón observado; gastos únicos grandes la distorsionan.');

  return {
    modelVersion,
    predicted: fromCents(predictedCents),
    predictedCents,
    spentToDate: fromCents(spentToDateCents),
    remainingToSpend: fromCents(predictedCents - spentToDateCents),
    runRateEstimate: fromCents(runRateCents),
    historicalAverage: historicalAverageCents === null ? null : fromCents(historicalAverageCents),
    weights: modelVersion === 'blend-v1' ? { currentPace: round4(progress), history: round4(1 - progress) } : { currentPace: 1, history: 0 },
    historyMonthsUsed: history.length,
    elapsedDays,
    totalDays,
    confidence,
    limitations,
  };
}

/**
 * Error de una predicción frente al gasto real.
 * percentageError = |real − predicho| / real × 100 (base del MAPE).
 */
export function predictionError(predictedCents, actualCents) {
  const absoluteCents = Math.abs(actualCents - predictedCents);
  return {
    absoluteError: fromCents(absoluteCents),
    percentageError: actualCents > 0 ? Math.round((absoluteCents / actualCents) * 10000) / 100 : null,
    direction: predictedCents > actualCents ? 'OVERESTIMATED' : predictedCents < actualCents ? 'UNDERESTIMATED' : 'EXACT',
  };
}

/** Error porcentual absoluto medio (MAPE) de una lista de errores porcentuales. */
export function mape(percentageErrors) {
  const valid = percentageErrors.filter((v) => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
