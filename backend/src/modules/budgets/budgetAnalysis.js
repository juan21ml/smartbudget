/**
 * ANÁLISIS INTELIGENTE DE PRESUPUESTO (funcionalidad especial)
 *
 * Función pura: recibe datos y devuelve el análisis, sin tocar la base de datos.
 * Por eso se puede probar con casos exactos (ej. 450.000 de 500.000 → 90 % → WARNING).
 *
 * Todos los montos se manejan en CENTAVOS ENTEROS para evitar errores de punto flotante.
 */
import { addDays, daysInclusive, maxDate, minDate, monthRange } from '../../utils/dates.js';
import { formatMoney, shortDate } from '../../utils/format.js';
import { fromCents, percentage } from '../../utils/money.js';

export const THRESHOLDS = { WARNING: 80, EXCEEDED: 100 };

/**
 * OK (< 80 %), WARNING (80 % – 99,99 %), EXCEEDED (≥ 100 %).
 * Se compara con enteros (gastado × 100 ≥ límite × umbral) en lugar del porcentaje
 * redondeado, para que 79,996 % no se convierta en 80 % por redondeo.
 */
export function budgetStatus(spentCents, limitCents) {
  if (spentCents * 100 >= limitCents * THRESHOLDS.EXCEEDED) return 'EXCEEDED';
  if (spentCents * 100 >= limitCents * THRESHOLDS.WARNING) return 'WARNING';
  return 'OK';
}

/** Estado del periodo respecto a la fecha de análisis (asOf). */
export function periodProgress(periodStart, periodEnd, asOf) {
  const totalDays = daysInclusive(periodStart, periodEnd);
  let state;
  let elapsedDays;

  if (asOf < periodStart) {
    state = 'NOT_STARTED';
    elapsedDays = 0;
  } else if (asOf > periodEnd) {
    state = 'FINISHED';
    elapsedDays = totalDays;
  } else {
    state = 'IN_PROGRESS';
    elapsedDays = daysInclusive(periodStart, asOf); // incluye el día de hoy
  }

  return { state, totalDays, elapsedDays, remainingDays: totalDays - elapsedDays };
}

/** Construye los intervalos del desglose: por día, por semana (bloques de 7 días) o por mes. */
export function buildBuckets(periodStart, periodEnd, groupBy) {
  const buckets = [];

  if (groupBy === 'day') {
    for (let d = periodStart; d <= periodEnd; d = addDays(d, 1)) {
      buckets.push({ label: shortDate(d), from: d, to: d });
    }
  } else if (groupBy === 'week') {
    let n = 1;
    for (let from = periodStart; from <= periodEnd; from = addDays(from, 7), n += 1) {
      const to = minDate(addDays(from, 6), periodEnd);
      buckets.push({ label: `Semana ${n} (${shortDate(from)} - ${shortDate(to)})`, from, to });
    }
  } else if (groupBy === 'month') {
    let month = periodStart.slice(0, 7);
    while (`${month}-01` <= periodEnd) {
      const range = monthRange(month);
      buckets.push({ label: month, from: maxDate(range.start, periodStart), to: minDate(range.end, periodEnd) });
      month = addDays(range.end, 1).slice(0, 7);
    }
  } else {
    throw new Error(`groupBy no soportado: ${groupBy}`);
  }

  return buckets;
}

/**
 * @param {object} input
 * @param {number} input.limitCents         Límite del presupuesto en centavos
 * @param {string} input.periodStart        'YYYY-MM-DD'
 * @param {string} input.periodEnd          'YYYY-MM-DD'
 * @param {Array<{id?:string,date:string,amountCents:number,description?:string}>} input.transactions
 *        Gastos de la categoría dentro del periodo
 * @param {string} input.asOf               Fecha de referencia del análisis ('hoy')
 * @param {'day'|'week'|'month'} [input.groupBy='week']
 * @param {string} [input.categoryName]
 */
export function analyzeBudget({ limitCents, periodStart, periodEnd, transactions, asOf, groupBy = 'week', categoryName = '' }) {
  // 1. Totales
  const spentCents = transactions.reduce((sum, t) => sum + t.amountCents, 0);
  const remainingCents = limitCents - spentCents;
  const percentageUsed = percentage(spentCents, limitCents);
  const status = budgetStatus(spentCents, limitCents);

  // 2. Ritmo de gasto y proyección al final del periodo
  const period = periodProgress(periodStart, periodEnd, asOf);
  const dailyAverageCents = period.elapsedDays > 0 ? spentCents / period.elapsedDays : 0;

  let projectedCents;
  if (period.state === 'IN_PROGRESS') {
    projectedCents = Math.round(dailyAverageCents * period.totalDays);
  } else {
    projectedCents = spentCents; // periodo terminado o sin iniciar: no hay nada que proyectar
  }
  const projectedPercentage = percentage(projectedCents, limitCents);

  // Lo que "debería" llevar gastado si el gasto fuera uniforme en el periodo
  const idealSpentCents = Math.round((limitCents * period.elapsedDays) / period.totalDays);

  const recommendedDailyCents =
    period.state !== 'FINISHED' && remainingCents > 0 && period.remainingDays > 0
      ? Math.floor(remainingCents / period.remainingDays)
      : null;

  let exhaustionDate = null;
  if (period.state === 'IN_PROGRESS' && dailyAverageCents > 0 && remainingCents > 0) {
    const candidate = addDays(asOf, Math.ceil(remainingCents / dailyAverageCents));
    if (candidate <= periodEnd) exhaustionDate = candidate;
  }

  // 3. Desglose por día / semana / mes
  const breakdown = buildBuckets(periodStart, periodEnd, groupBy).map((bucket) => {
    const inBucket = transactions.filter((t) => t.date >= bucket.from && t.date <= bucket.to);
    const bucketCents = inBucket.reduce((sum, t) => sum + t.amountCents, 0);
    return {
      ...bucket,
      spent: fromCents(bucketCents),
      percentageOfLimit: percentage(bucketCents, limitCents),
      transactionCount: inBucket.length,
    };
  });

  // 4. Gastos más grandes
  const topExpenses = [...transactions]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description ?? null,
      amount: fromCents(t.amountCents),
      percentageOfSpent: percentage(t.amountCents, spentCents),
    }));

  // 5. Mensajes y avisos en lenguaje natural
  const messages = buildMessages({
    categoryName,
    status,
    percentageUsed,
    spentCents,
    remainingCents,
    limitCents,
    projectedCents,
    period,
    recommendedDailyCents,
    exhaustionDate,
    topExpense: topExpenses[0],
    transactionCount: transactions.length,
  });

  return {
    period: {
      start: periodStart,
      end: periodEnd,
      asOf,
      state: period.state,
      totalDays: period.totalDays,
      elapsedDays: period.elapsedDays,
      remainingDays: period.remainingDays,
    },
    summary: {
      limit: fromCents(limitCents),
      spent: fromCents(spentCents),
      remaining: fromCents(remainingCents),
      percentageUsed,
      status,
      transactionCount: transactions.length,
    },
    pace: {
      dailyAverage: fromCents(Math.round(dailyAverageCents)),
      idealSpentToDate: fromCents(idealSpentCents),
      deviationFromIdeal: fromCents(spentCents - idealSpentCents),
      projectedSpend: fromCents(projectedCents),
      projectedPercentage,
      projectedStatus: budgetStatus(projectedCents, limitCents),
      recommendedDailySpend: recommendedDailyCents === null ? null : fromCents(recommendedDailyCents),
      estimatedExhaustionDate: exhaustionDate,
      method: 'Ritmo de gasto del periodo actual (promedio diario × días del periodo)',
    },
    breakdown: { groupBy, items: breakdown },
    topExpenses,
    messages,
  };
}

function buildMessages(ctx) {
  const messages = [];
  const add = (level, code, message) => messages.push({ level, code, message });
  const name = ctx.categoryName ? ` de ${ctx.categoryName}` : '';

  if (ctx.transactionCount === 0) {
    add('INFO', 'NO_EXPENSES', `No hay gastos registrados en este periodo para el presupuesto${name}.`);
  }

  if (ctx.status === 'EXCEEDED') {
    add(
      'DANGER',
      'BUDGET_EXCEEDED',
      `Superaste el presupuesto${name}: gastaste ${formatMoney(ctx.spentCents)} de ${formatMoney(ctx.limitCents)} ` +
        `(${ctx.percentageUsed}%), un exceso de ${formatMoney(-ctx.remainingCents)}.`,
    );
  } else if (ctx.status === 'WARNING') {
    add(
      'WARNING',
      'BUDGET_WARNING',
      `Has consumido el ${ctx.percentageUsed}% del presupuesto${name}. Te quedan ${formatMoney(ctx.remainingCents)}.`,
    );
  }

  if (ctx.period.state === 'IN_PROGRESS' && ctx.status !== 'EXCEEDED' && ctx.transactionCount > 0) {
    if (ctx.projectedCents > ctx.limitCents) {
      const when = ctx.exhaustionDate ? ` Al ritmo actual el dinero se agotaría el ${ctx.exhaustionDate}.` : '';
      add(
        'WARNING',
        'PROJECTED_OVERSPEND',
        `A este ritmo gastarás ${formatMoney(ctx.projectedCents)} al final del periodo, ` +
          `superando el límite en ${formatMoney(ctx.projectedCents - ctx.limitCents)}.${when}`,
      );
    } else {
      add(
        'INFO',
        'ON_TRACK',
        `Vas bien: a este ritmo terminarás el periodo con ${formatMoney(ctx.limitCents - ctx.projectedCents)} disponibles.`,
      );
    }
  }

  if (ctx.recommendedDailyCents !== null && ctx.period.state === 'IN_PROGRESS') {
    add(
      'INFO',
      'DAILY_RECOMMENDATION',
      `Para no exceder el presupuesto, gasta máximo ${formatMoney(ctx.recommendedDailyCents)} por día ` +
        `durante los ${ctx.period.remainingDays} días restantes.`,
    );
  }

  if (ctx.topExpense && ctx.transactionCount > 1 && ctx.topExpense.percentageOfSpent >= 40) {
    const desc = ctx.topExpense.description ? ` (${ctx.topExpense.description})` : '';
    add(
      'INFO',
      'CONCENTRATED_SPENDING',
      `Tu gasto más grande${desc} representa el ${ctx.topExpense.percentageOfSpent}% de lo gastado en el periodo.`,
    );
  }

  if (ctx.period.state === 'NOT_STARTED') {
    add('INFO', 'PERIOD_NOT_STARTED', 'El periodo del presupuesto aún no ha comenzado.');
  }

  if (ctx.period.state === 'FINISHED') {
    const result =
      ctx.remainingCents >= 0
        ? `cumpliste el presupuesto y ahorraste ${formatMoney(ctx.remainingCents)}`
        : `excediste el presupuesto en ${formatMoney(-ctx.remainingCents)}`;
    add('INFO', 'PERIOD_FINISHED', `El periodo finalizó: ${result}.`);
  }

  return messages;
}
