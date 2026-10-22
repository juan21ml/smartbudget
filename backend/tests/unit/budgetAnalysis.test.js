import { describe, expect, it } from 'vitest';
import { analyzeBudget, budgetStatus, buildBuckets, periodProgress } from '../../src/modules/budgets/budgetAnalysis.js';

const tx = (date, pesos, description) => ({ date, amountCents: Math.round(pesos * 100), description });

// Caso de referencia del proyecto: límite 500.000, gastos 150.000 + 200.000 + 100.000
const BASE = {
  limitCents: 500000_00,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  transactions: [tx('2026-10-02', 150000, 'Mercado'), tx('2026-10-08', 200000, 'Supermercado'), tx('2026-10-15', 100000, 'Restaurante')],
  asOf: '2026-10-20',
  categoryName: 'Alimentación',
};

describe('budgetStatus (umbrales 80 % y 100 %)', () => {
  it.each([
    [0, 'OK'],
    [79_99, 'OK'],
    [79_996, 'OK'], // 79,996 % no debe redondearse a 80 %
    [80_00, 'WARNING'],
    [99_99, 'WARNING'],
    [100_00, 'EXCEEDED'],
    [120_00, 'EXCEEDED'],
  ])('gastado %i de 10000 → %s', (spentScaled, expected) => {
    // límite 100.00 en unidades escaladas para probar los bordes exactos
    const limit = spentScaled === 79_996 ? 100_000 : 100_00;
    expect(budgetStatus(spentScaled, limit)).toBe(expected);
  });
});

describe('analyzeBudget · caso de referencia (450.000 de 500.000)', () => {
  const result = analyzeBudget(BASE);

  it('calcula gastado, disponible, porcentaje y estado', () => {
    expect(result.summary).toEqual({
      limit: 500000,
      spent: 450000,
      remaining: 50000,
      percentageUsed: 90,
      status: 'WARNING',
      transactionCount: 3,
    });
  });

  it('calcula el progreso del periodo', () => {
    expect(result.period).toMatchObject({ state: 'IN_PROGRESS', totalDays: 31, elapsedDays: 20, remainingDays: 11 });
  });

  it('proyecta el gasto al final del mes según el ritmo actual', () => {
    // 450.000 / 20 días = 22.500 diarios × 31 días = 697.500
    expect(result.pace.dailyAverage).toBe(22500);
    expect(result.pace.projectedSpend).toBe(697500);
    expect(result.pace.projectedPercentage).toBe(139.5);
    expect(result.pace.projectedStatus).toBe('EXCEEDED');
  });

  it('recomienda un gasto diario máximo y estima cuándo se agota', () => {
    // 50.000 / 11 días restantes = 4.545,45
    expect(result.pace.recommendedDailySpend).toBe(4545.45);
    // 50.000 / 22.500 = 2,2 → 3 días después del 20 de octubre
    expect(result.pace.estimatedExhaustionDate).toBe('2026-10-23');
  });

  it('genera los mensajes esperados', () => {
    const codes = result.messages.map((m) => m.code);
    expect(codes).toEqual(['BUDGET_WARNING', 'PROJECTED_OVERSPEND', 'DAILY_RECOMMENDATION', 'CONCENTRATED_SPENDING']);
    expect(result.messages[0].message).toContain('90%');
    expect(result.messages[0].level).toBe('WARNING');
  });

  it('desglosa por semana y la suma coincide con el total', () => {
    const items = result.breakdown.items;
    expect(items).toHaveLength(5); // 31 días → 4 semanas completas + 3 días
    expect(items[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-07', spent: 150000 });
    expect(items[4]).toMatchObject({ from: '2026-10-29', to: '2026-10-31', spent: 0 });
    expect(items.reduce((s, i) => s + i.spent, 0)).toBe(450000);
  });

  it('ordena los gastos más grandes', () => {
    expect(result.topExpenses.map((t) => t.amount)).toEqual([200000, 150000, 100000]);
    expect(result.topExpenses[0].percentageOfSpent).toBe(44.44);
  });
});

describe('analyzeBudget · otros escenarios', () => {
  it('presupuesto sin gastos: todo en cero y aviso informativo', () => {
    const r = analyzeBudget({ ...BASE, transactions: [] });
    expect(r.summary).toMatchObject({ spent: 0, remaining: 500000, percentageUsed: 0, status: 'OK' });
    expect(r.pace.projectedSpend).toBe(0);
    expect(r.pace.estimatedExhaustionDate).toBeNull();
    expect(r.messages[0].code).toBe('NO_EXPENSES');
  });

  it('presupuesto excedido: remaining negativo y mensaje DANGER', () => {
    const r = analyzeBudget({ ...BASE, transactions: [...BASE.transactions, tx('2026-10-18', 100000)] });
    expect(r.summary).toMatchObject({ spent: 550000, remaining: -50000, percentageUsed: 110, status: 'EXCEEDED' });
    expect(r.messages[0]).toMatchObject({ level: 'DANGER', code: 'BUDGET_EXCEEDED' });
    expect(r.pace.recommendedDailySpend).toBeNull();
  });

  it('exactamente el 80 % genera WARNING', () => {
    const r = analyzeBudget({ ...BASE, transactions: [tx('2026-10-05', 400000)] });
    expect(r.summary.percentageUsed).toBe(80);
    expect(r.summary.status).toBe('WARNING');
  });

  it('ritmo controlado: mensaje ON_TRACK', () => {
    const r = analyzeBudget({ ...BASE, transactions: [tx('2026-10-05', 100000)] });
    expect(r.pace.projectedStatus).toBe('OK');
    expect(r.messages.map((m) => m.code)).toContain('ON_TRACK');
  });

  it('periodo terminado: no proyecta, informa el resultado final', () => {
    const r = analyzeBudget({ ...BASE, asOf: '2026-11-05' });
    expect(r.period).toMatchObject({ state: 'FINISHED', elapsedDays: 31, remainingDays: 0 });
    expect(r.pace.projectedSpend).toBe(450000);
    expect(r.messages.at(-1).code).toBe('PERIOD_FINISHED');
    expect(r.messages.at(-1).message).toContain('ahorraste');
  });

  it('periodo sin iniciar', () => {
    const r = analyzeBudget({ ...BASE, transactions: [], asOf: '2026-09-15' });
    expect(r.period).toMatchObject({ state: 'NOT_STARTED', elapsedDays: 0 });
    expect(r.messages.map((m) => m.code)).toContain('PERIOD_NOT_STARTED');
  });

  it('mantiene la precisión decimal (0,10 + 0,20 = 0,30)', () => {
    const r = analyzeBudget({ ...BASE, limitCents: 100, transactions: [tx('2026-10-01', 0.1), tx('2026-10-02', 0.2)] });
    expect(r.summary.spent).toBe(0.3);
    expect(r.summary.remaining).toBe(0.7);
  });
});

describe('periodProgress y buildBuckets', () => {
  it('cuenta los días incluyendo inicio y fin', () => {
    expect(periodProgress('2026-10-01', '2026-10-31', '2026-10-01')).toMatchObject({ elapsedDays: 1, totalDays: 31 });
    expect(periodProgress('2026-10-01', '2026-10-31', '2026-10-31')).toMatchObject({ elapsedDays: 31, remainingDays: 0 });
  });

  it('agrupa por día', () => {
    expect(buildBuckets('2026-02-01', '2026-02-28', 'day')).toHaveLength(28);
  });

  it('agrupa por mes respetando los límites del periodo', () => {
    const b = buildBuckets('2026-01-15', '2026-03-10', 'month');
    expect(b.map((x) => [x.label, x.from, x.to])).toEqual([
      ['2026-01', '2026-01-15', '2026-01-31'],
      ['2026-02', '2026-02-01', '2026-02-28'],
      ['2026-03', '2026-03-01', '2026-03-10'],
    ]);
  });
});
