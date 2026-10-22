import { beforeAll, describe, expect, it } from 'vitest';
import { api, categoryId, createExpense, createUser } from '../helpers/api.js';

describe('Análisis financiero y predicciones', () => {
  let user;
  beforeAll(async () => {
    user = await createUser();
    const food = await categoryId(user.auth, 'Alimentación');
    const transport = await categoryId(user.auth, 'Transporte');
    const salary = await categoryId(user.auth, 'Salario');

    // Julio, agosto y septiembre: 2.000.000 de gasto cada uno. Octubre: 1.000.000 al día 10.
    for (const m of ['07', '08', '09']) {
      await createExpense(user.auth, { categoryId: salary, amount: 4000000, date: `2026-${m}-01` });
      await createExpense(user.auth, { categoryId: food, amount: 1500000, date: `2026-${m}-05` });
      await createExpense(user.auth, { categoryId: transport, amount: 500000, date: `2026-${m}-10` });
    }
    await createExpense(user.auth, { categoryId: salary, amount: 4000000, date: '2026-10-01' });
    await createExpense(user.auth, { categoryId: food, amount: 400000, date: '2026-10-03' });
    await createExpense(user.auth, { categoryId: transport, amount: 600000, date: '2026-10-08' });
  });

  it('resumen mensual: ingresos, gastos, balance y tasa de ahorro', async () => {
    const res = await api().get('/api/v1/analytics/monthly?month=2026-09').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ income: 4000000, expense: 2000000, balance: 2000000, savingsRate: 50 });
    expect(res.body.data.topCategories[0]).toMatchObject({ categoryName: 'Alimentación', total: 1500000, percentage: 75 });
  });

  it('distribución por categoría en un rango', async () => {
    const res = await api().get('/api/v1/analytics/categories?from=2026-07-01&to=2026-09-30').set(user.auth);
    expect(res.body.data.total).toBe(6000000);
    expect(res.body.data.categories.map((c) => [c.categoryName, c.percentage])).toEqual([
      ['Alimentación', 75],
      ['Transporte', 25],
    ]);
  });

  it('comparación con el mes anterior e insights', async () => {
    const res = await api().get('/api/v1/analytics/comparison?month=2026-10').set(user.auth);
    expect(res.body.data.expense).toMatchObject({ current: 1000000, previous: 2000000, changePercentage: -50 });
    const transport = res.body.data.categories.find((c) => c.categoryName === 'Transporte');
    expect(transport.changePercentage).toBe(20);
    expect(res.body.data.insights[0]).toContain('disminuyeron 50%');
  });

  it('tendencia de los últimos meses', async () => {
    const res = await api().get('/api/v1/analytics/trend?months=4&until=2026-10').set(user.auth);
    expect(res.body.data.months.map((m) => m.expense)).toEqual([2000000, 2000000, 2000000, 1000000]);
  });

  it('predicción del mes en curso con modelo combinado (blend-v1) y la guarda', async () => {
    const res = await api().get('/api/v1/predictions/expenses?month=2026-10&asOf=2026-10-10').set(user.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.modelVersion).toBe('blend-v1');
    expect(d.spentToDate).toBe(1000000);
    expect(d.runRateEstimate).toBe(3100000);
    expect(d.historicalAverage).toBe(2000000);
    expect(d.predicted).toBeCloseTo((10 / 31) * 3100000 + (21 / 31) * 2000000, 0);
    expect(d.evolution).toHaveLength(1);

    // Un segundo cálculo otro día queda en la evolución; el mismo día se actualiza (no se duplica).
    await api().get('/api/v1/predictions/expenses?month=2026-10&asOf=2026-10-10').set(user.auth);
    const later = await api().get('/api/v1/predictions/expenses?month=2026-10&asOf=2026-10-20').set(user.auth);
    expect(later.body.data.evolution.map((e) => e.asOf)).toEqual(['2026-10-10', '2026-10-20']);
  });

  it('mes finalizado: compara predicciones guardadas con el gasto real (error y MAPE)', async () => {
    await api().get('/api/v1/predictions/expenses?month=2026-09&asOf=2026-09-15').set(user.auth);
    const res = await api().get('/api/v1/predictions/expenses?month=2026-09&asOf=2026-10-20').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('FINISHED');
    expect(res.body.data.actual).toBe(2000000);
    expect(res.body.data.predictions).toHaveLength(1);
    expect(res.body.data.predictions[0].percentageError).toBeTypeOf('number');
    expect(res.body.data.mape).toBe(res.body.data.predictions[0].percentageError);
  });

  it('rechaza predecir un mes que no ha comenzado', async () => {
    const res = await api().get('/api/v1/predictions/expenses?month=2026-12&asOf=2026-10-20').set(user.auth);
    expect(res.status).toBe(400);
  });

  it('el health check reporta la base de datos', async () => {
    const res = await api().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
