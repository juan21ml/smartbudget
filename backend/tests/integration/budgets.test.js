import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, categoryId, createExpense, createUser } from '../helpers/api.js';

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function readWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe('Presupuestos (CRUD y reglas)', () => {
  let user;
  let food;
  beforeAll(async () => {
    user = await createUser();
    food = await categoryId(user.auth, 'Alimentación');
  });

  it('crea un presupuesto mensual con el atajo "month"', async () => {
    const res = await api().post('/api/v1/budgets').set(user.auth).send({ categoryId: food, amountLimit: 500000, month: '2026-11' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      amountLimit: 500000,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      spent: 0,
      remaining: 500000,
      percentageUsed: 0,
      status: 'OK',
    });
  });

  it('rechaza presupuestos solapados para la misma categoría (409)', async () => {
    const res = await api()
      .post('/api/v1/budgets')
      .set(user.auth)
      .send({ categoryId: food, amountLimit: 100000, periodStart: '2026-11-15', periodEnd: '2026-12-15' });
    expect(res.status).toBe(409);
  });

  it.each([
    [{ amountLimit: -5 }, 'Ingrese un monto positivo'],
    [{ periodStart: '2026-12-10', periodEnd: '2026-12-01' }, 'La fecha final debe ser igual o posterior a la fecha inicial'],
    [{ periodStart: undefined, periodEnd: undefined }, 'Indique el periodo con "month" (YYYY-MM) o con "periodStart" y "periodEnd"'],
  ])('valida los datos (%o) → 400', async (override, message) => {
    const body = { categoryId: food, amountLimit: 1000, periodStart: '2027-01-01', periodEnd: '2027-01-31', ...override };
    const res = await api().post('/api/v1/budgets').set(user.auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(message);
  });

  it('no permite presupuestos sobre categorías de ingreso', async () => {
    const salary = await categoryId(user.auth, 'Salario');
    const res = await api().post('/api/v1/budgets').set(user.auth).send({ categoryId: salary, amountLimit: 1000, month: '2027-02' });
    expect(res.status).toBe(400);
  });

  it('consulta, actualiza, lista y elimina', async () => {
    const transport = await categoryId(user.auth, 'Transporte');
    const { body } = await api().post('/api/v1/budgets').set(user.auth).send({ categoryId: transport, amountLimit: 200000, month: '2027-03' });
    const { id } = body.data;

    expect((await api().get(`/api/v1/budgets/${id}`).set(user.auth)).body.data.amountLimit).toBe(200000);
    const upd = await api().put(`/api/v1/budgets/${id}`).set(user.auth).send({ amountLimit: 250000 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.amountLimit).toBe(250000);

    const list = await api().get(`/api/v1/budgets?categoryId=${transport}`).set(user.auth);
    expect(list.body.data.map((b) => b.id)).toContain(id);

    expect((await api().delete(`/api/v1/budgets/${id}`).set(user.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/budgets/${id}`).set(user.auth)).status).toBe(404);
  });
});

describe('Funcionalidad especial: análisis inteligente del presupuesto', () => {
  let user;
  let food;
  let budgetId;

  beforeAll(async () => {
    user = await createUser();
    food = await categoryId(user.auth, 'Alimentación');
    const res = await api().post('/api/v1/budgets').set(user.auth).send({ categoryId: food, amountLimit: 500000, month: '2026-10' });
    budgetId = res.body.data.id;
  });

  it('caso de referencia: 150.000 + 200.000 + 100.000 de 500.000 → 90 % WARNING', async () => {
    const a = await createExpense(user.auth, { categoryId: food, amount: 150000, date: '2026-10-02', description: 'Mercado' });
    expect(a.body.alerts).toEqual([]);
    await createExpense(user.auth, { categoryId: food, amount: 200000, date: '2026-10-08', description: 'Supermercado' });

    // El tercer gasto cruza el 80 %: la respuesta trae la alerta generada.
    const c = await createExpense(user.auth, { categoryId: food, amount: 100000, date: '2026-10-15', description: 'Restaurante' });
    expect(c.body.alerts).toHaveLength(1);
    expect(c.body.alerts[0]).toMatchObject({ type: 'BUDGET_WARNING', budgetId });

    const res = await api().get(`/api/v1/budgets/${budgetId}/analysis?asOf=2026-10-20&groupBy=week`).set(user.auth);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.summary).toMatchObject({ limit: 500000, spent: 450000, remaining: 50000, percentageUsed: 90, status: 'WARNING' });
    expect(d.period).toMatchObject({ state: 'IN_PROGRESS', elapsedDays: 20, totalDays: 31, remainingDays: 11 });
    expect(d.pace.dailyAverage).toBe(22500);
    expect(d.pace.projectedSpend).toBe(697500);
    expect(d.pace.projectedStatus).toBe('EXCEEDED');
    expect(d.breakdown.items).toHaveLength(5);
    expect(d.messages.map((m) => m.code)).toEqual(expect.arrayContaining(['BUDGET_WARNING', 'PROJECTED_OVERSPEND']));
    expect(d.alerts.map((x) => x.type)).toEqual(['BUDGET_WARNING']);
  });

  it('no duplica la alerta del 80 % aunque se consulte o se registren más gastos', async () => {
    await api().get(`/api/v1/budgets/${budgetId}/analysis?asOf=2026-10-20`).set(user.auth);
    await api().get(`/api/v1/budgets/${budgetId}/analysis?asOf=2026-10-21`).set(user.auth);
    const small = await createExpense(user.auth, { categoryId: food, amount: 1000, date: '2026-10-16' });
    expect(small.body.alerts).toEqual([]);

    const alerts = await api().get('/api/v1/alerts?type=BUDGET_WARNING').set(user.auth);
    expect(alerts.body.meta.total).toBe(1);
  });

  it('genera la alerta del 100 % una sola vez al exceder el límite', async () => {
    const over = await createExpense(user.auth, { categoryId: food, amount: 60000, date: '2026-10-18' });
    expect(over.body.alerts.map((a) => a.type)).toEqual(['BUDGET_EXCEEDED']);

    const again = await createExpense(user.auth, { categoryId: food, amount: 5000, date: '2026-10-19' });
    expect(again.body.alerts).toEqual([]);

    const res = await api().get(`/api/v1/budgets/${budgetId}/analysis?asOf=2026-10-20`).set(user.auth);
    expect(res.body.data.summary.status).toBe('EXCEEDED');
    expect(res.body.data.messages[0].code).toBe('BUDGET_EXCEEDED');
  });

  it('desglosa por día y por mes', async () => {
    const day = await api().get(`/api/v1/budgets/${budgetId}/analysis?groupBy=day&asOf=2026-10-20`).set(user.auth);
    expect(day.body.data.breakdown.items).toHaveLength(31);
    const month = await api().get(`/api/v1/budgets/${budgetId}/analysis?groupBy=month&asOf=2026-10-20`).set(user.auth);
    expect(month.body.data.breakdown.items).toHaveLength(1);
    expect(month.body.data.breakdown.items[0].spent).toBe(month.body.data.summary.spent);
  });

  it('valida groupBy', async () => {
    const res = await api().get(`/api/v1/budgets/${budgetId}/analysis?groupBy=year`).set(user.auth);
    expect(res.status).toBe(400);
  });

  it('presupuesto sin gastos: 200 con aviso informativo', async () => {
    const fresh = await createUser();
    const cat = await categoryId(fresh.auth, 'Salud');
    const { body } = await api().post('/api/v1/budgets').set(fresh.auth).send({ categoryId: cat, amountLimit: 100000, month: '2026-10' });
    const res = await api().get(`/api/v1/budgets/${body.data.id}/analysis?asOf=2026-10-20`).set(fresh.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.spent).toBe(0);
    expect(res.body.data.messages.map((m) => m.code)).toContain('NO_EXPENSES');
  });

  it('marca como leídas las alertas', async () => {
    const list = await api().get('/api/v1/alerts?unread=true').set(user.auth);
    const unreadBefore = list.body.meta.unreadCount;
    const read = await api().patch(`/api/v1/alerts/${list.body.data[0].id}/read`).set(user.auth);
    expect(read.status).toBe(200);
    expect(read.body.data.read).toBe(true);
    expect((await api().get('/api/v1/alerts').set(user.auth)).body.meta.unreadCount).toBe(unreadBefore - 1);

    const all = await api().patch('/api/v1/alerts/read-all').set(user.auth);
    expect(all.body.data.updated).toBe(unreadBefore - 1);
  });
});

describe('Funcionalidad especial: gasto atípico', () => {
  it('genera una alerta UNUSUAL_EXPENSE cuando el gasto se sale del patrón', async () => {
    const user = await createUser();
    const cat = await categoryId(user.auth, 'Entretenimiento');
    for (const [amount, date] of [
      [30000, '2026-09-02'],
      [28000, '2026-09-09'],
      [32000, '2026-09-16'],
      [29000, '2026-09-23'],
      [31000, '2026-10-01'],
      [30000, '2026-10-05'],
    ]) {
      await createExpense(user.auth, { categoryId: cat, amount, date });
    }

    const normal = await createExpense(user.auth, { categoryId: cat, amount: 33000, date: '2026-10-08' });
    expect(normal.body.alerts).toEqual([]);

    const big = await createExpense(user.auth, { categoryId: cat, amount: 250000, date: '2026-10-10', description: 'Concierto' });
    expect(big.body.alerts).toHaveLength(1);
    expect(big.body.alerts[0]).toMatchObject({ type: 'UNUSUAL_EXPENSE', transactionId: big.body.data.id });
    expect(big.body.alerts[0].metadata.usualAmount).toBe(30000);
    expect(big.body.alerts[0].message).toContain('Gasto atípico en Entretenimiento');
  });
});

describe('Funcionalidad especial: reportes Excel', () => {
  let user;
  let budgetId;
  beforeAll(async () => {
    user = await createUser();
    const food = await categoryId(user.auth, 'Alimentación');
    const salary = await categoryId(user.auth, 'Salario');
    await createExpense(user.auth, { categoryId: salary, amount: 3000000, date: '2026-10-01' });
    await createExpense(user.auth, { categoryId: food, amount: 150000, date: '2026-10-02', description: 'Mercado' });
    await createExpense(user.auth, { categoryId: food, amount: 200000, date: '2026-10-08', description: '=HYPERLINK("http://malo")' });
    await createExpense(user.auth, { categoryId: food, amount: 100000, date: '2026-10-15', description: 'Restaurante' });
    const res = await api().post('/api/v1/budgets').set(user.auth).send({ categoryId: food, amountLimit: 500000, month: '2026-10' });
    budgetId = res.body.data.id;
  });

  it('descarga el reporte del presupuesto con sus hojas y valores', async () => {
    const res = await api().get(`/api/v1/budgets/${budgetId}/report?asOf=2026-10-20`).set(user.auth).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="presupuesto-alimentacion-2026-10-01\.xlsx"/);

    const wb = await readWorkbook(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Desglose', 'Movimientos', 'Alertas']);

    const resumen = wb.getWorksheet('Resumen');
    expect(resumen.getCell('B9').value).toBe(500000);
    expect(resumen.getCell('B10').value).toMatchObject({ result: 450000 });
    expect(resumen.getCell('B11').value).toMatchObject({ formula: 'B9-B10', result: 50000 });
    expect(resumen.getCell('B12').value).toMatchObject({ result: 0.9 });
    expect(resumen.getCell('B13').value).toMatchObject({ result: 'Advertencia' });

    // Protección contra inyección de fórmulas: la descripción maliciosa queda como texto.
    const mov = wb.getWorksheet('Movimientos');
    const descriptions = mov.getColumn(2).values.filter(Boolean);
    expect(descriptions).toContain('\'=HYPERLINK("http://malo")');
  });

  it('descarga el reporte mensual general', async () => {
    const res = await api().get('/api/v1/reports/monthly?month=2026-10').set(user.auth).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const wb = await readWorkbook(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Por categoría', 'Presupuestos', 'Movimientos', 'Alertas']);
    const resumen = wb.getWorksheet('Resumen');
    expect(resumen.getCell('B4').value).toMatchObject({ result: 3000000 });
    expect(resumen.getCell('B5').value).toMatchObject({ result: 450000 });
    expect(resumen.getCell('B6').value).toMatchObject({ formula: 'B4-B5', result: 2550000 });
  });

  it('valida el mes del reporte', async () => {
    const res = await api().get('/api/v1/reports/monthly?month=2026-13').set(user.auth);
    expect(res.status).toBe(400);
  });
});
