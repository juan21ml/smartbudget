/**
 * DETECCIÓN DE GASTOS ATÍPICOS (función pura, sin base de datos)
 *
 * Compara un gasto con el historial de la misma categoría usando estadística robusta:
 *   - Mediana en lugar de promedio.
 *   - MAD (desviación absoluta mediana) en lugar de desviación estándar.
 *   - Puntaje Z modificado de Iglewicz y Hoaglin: z = 0.6745 × (x − mediana) / MAD
 *     Un valor con z > 3.5 se considera atípico.
 *
 * ¿Por qué no el promedio? Porque un solo gasto enorme "contamina" el promedio y la
 * desviación estándar, y entonces el siguiente gasto enorme ya no parece raro.
 * La mediana y la MAD casi no se mueven con valores extremos.
 *
 * Solo se marcan desviaciones HACIA ARRIBA (gastar mucho más de lo habitual).
 */

export const MIN_HISTORY = 5; // mínimo de gastos previos para opinar
export const Z_THRESHOLD = 3.5; // umbral clásico del puntaje Z modificado
export const MIN_RATIO = 1.5; // además, debe ser al menos 1,5 veces la mediana
export const FALLBACK_RATIO = 2; // si MAD = 0 (historial idéntico), basta con duplicar la mediana

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Desviación absoluta mediana: mediana de |x − mediana|. */
export function mad(values, med = median(values)) {
  return median(values.map((v) => Math.abs(v - med)));
}

/**
 * @param {number} amountCents     Gasto a evaluar (centavos)
 * @param {number[]} historyCents  Gastos previos de la misma categoría (centavos)
 * @returns {{ isUnusual: boolean, reason: string, medianCents?: number, madCents?: number,
 *             score?: number|null, ratio?: number }}
 */
export function detectUnusualExpense(amountCents, historyCents) {
  if (historyCents.length < MIN_HISTORY) {
    return { isUnusual: false, reason: 'INSUFFICIENT_HISTORY', historySize: historyCents.length };
  }

  const medianCents = median(historyCents);
  const madCents = mad(historyCents, medianCents);
  const ratio = medianCents > 0 ? Math.round((amountCents / medianCents) * 100) / 100 : Infinity;

  let score = null;
  let isUnusual;
  if (madCents === 0) {
    // Todos los gastos previos son iguales: la MAD no sirve, se usa la razón contra la mediana.
    isUnusual = amountCents >= medianCents * FALLBACK_RATIO;
  } else {
    score = Math.round(((0.6745 * (amountCents - medianCents)) / madCents) * 100) / 100;
    isUnusual = score > Z_THRESHOLD && ratio >= MIN_RATIO;
  }

  return {
    isUnusual,
    reason: isUnusual ? 'ABOVE_THRESHOLD' : 'WITHIN_NORMAL_RANGE',
    historySize: historyCents.length,
    medianCents,
    madCents,
    score,
    ratio,
  };
}
