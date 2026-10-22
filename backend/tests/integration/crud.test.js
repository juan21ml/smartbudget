import { beforeAll, describe, expect, it } from 'vitest';
import { api, categoryId, createExpense, createUser } from '../helpers/api.js';

describe('Categorías (CRUD)', () => {
  let user;
  beforeAll(async () => {
    user = await createUser();
  });

  it('crea, consulta, actualiza y elimina una categoría', async () => {
    const created = await api().post('/api/v1/categories').set(user.auth).send({ name: 'Mascotas', type: 'EXPENSE' });
    expect(created.status).toBe(201);
    const { id } = created.body.data;

    const got = await api().get(`/api/v1/categories/${id}`).set(user.auth);
    expect(got.status).toBe(200);
    expect(got.body.data).toMatchObject({ id, name: 'Mascotas', type: 'EXPENSE' });

    const updated = await api().put(`/api/v1/categories/${id}`).set(user.auth).send({ name: 'Mascotas y veterinario' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Mascotas y veterinario');

    expect((await api().delete(`/api/v1/categories/${id}`).set(user.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/categories/${id}`).set(user.auth)).status).toBe(404);
  });

  it('filtra por tipo', async () => {
    const res = await api().get('/api/v1/categories?type=INCOME').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.every((c) => c.type === 'INCOME')).toBe(true);
  });

  it('rechaza nombres duplicados (sin distinguir mayúsculas) con 409', async () => {
    const res = await api().post('/api/v1/categories').set(user.auth).send({ name: 'alimentación', type: 'EXPENSE' });
    expect(res.status).toBe(409);
  });

  it('no permite eliminar una categoría con transacciones (409)', async () => {
    const cat = await categoryId(user.auth, 'Salud');
    await createExpense(user.auth, { categoryId: cat, amount: 40000, date: '2026-10-05' });
    const res = await api().delete(`/api/v1/categories/${cat}`).set(user.auth);
    expect(res.status).toBe(409);
  });
});

describe('Transacciones (CRUD)', () => {
  let user;
  let food;
  let salary;
  beforeAll(async () => {
    user = await createUser();
    food = await categoryId(user.auth, 'Alimentación');
    salary = await categoryId(user.auth, 'Salario');
  });

  it('crea un gasto y toma el tipo de la categoría', async () => {
    const res = await createExpense(user.auth, { categoryId: food, amount: 45000.5, date: '2026-10-03', description: 'Mercado' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'EXPENSE', amount: 45000.5, date: '2026-10-03', categoryName: 'Alimentación' });
    expect(res.body.alerts).toEqual([]);
  });

  it('crea un ingreso', async () => {
    const res = await createExpense(user.auth, { categoryId: salary, amount: 3500000, date: '2026-10-01' });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('INCOME');
  });

  it.each([
    [{ amount: -100 }, 'Ingrese un monto positivo'],
    [{ amount: 0 }, 'Ingrese un monto positivo'],
    [{ amount: 'abc' }, 'El monto debe ser un número'],
    [{ amount: 10.555 }, 'El monto admite máximo 2 decimales'],
    [{ date: '2026-02-30' }, 'La fecha debe tener formato YYYY-MM-DD y ser válida'],
  ])('valida los datos (%o) → 400', async (override, message) => {
    const res = await createExpense(user.auth, { categoryId: food, amount: 1000, date: '2026-10-01', ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(message);
  });

  it('exige los campos obligatorios', async () => {
    const res = await createExpense(user.auth, {});
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.categoryId', 'body.amount', 'body.date']));
  });

  it('consulta, actualiza y elimina por ID', async () => {
    const { body } = await createExpense(user.auth, { categoryId: food, amount: 20000, date: '2026-10-04' });
    const { id } = body.data;

    expect((await api().get(`/api/v1/transactions/${id}`).set(user.auth)).body.data.amount).toBe(20000);

    const upd = await api().put(`/api/v1/transactions/${id}`).set(user.auth).send({ amount: 25000, description: 'Editado' });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ amount: 25000, description: 'Editado', date: '2026-10-04' });

    expect((await api().delete(`/api/v1/transactions/${id}`).set(user.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/transactions/${id}`).set(user.auth)).status).toBe(404);
    expect((await api().delete(`/api/v1/transactions/${id}`).set(user.auth)).status).toBe(404);
  });

  it('rechaza una actualización vacía', async () => {
    const { body } = await createExpense(user.auth, { categoryId: food, amount: 1000, date: '2026-10-04' });
    const res = await api().put(`/api/v1/transactions/${body.data.id}`).set(user.auth).send({});
    expect(res.status).toBe(400);
  });

  it('lista con filtros, orden, paginación y totales', async () => {
    const fresh = await createUser();
    const cat = await categoryId(fresh.auth, 'Transporte');
    for (const [amount, date, description] of [
      [5000, '2026-09-30', 'Bus'],
      [12000, '2026-10-02', 'Taxi'],
      [80000, '2026-10-10', 'Gasolina'],
      [3000, '2026-10-15', 'Bus'],
    ]) {
      await createExpense(fresh.auth, { categoryId: cat, amount, date, description });
    }

    const res = await api()
      .get('/api/v1/transactions?from=2026-10-01&to=2026-10-31&sortBy=amount&order=desc&limit=2&page=1')
      .set(fresh.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.amount)).toEqual([80000, 12000]);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.meta.totals).toEqual({ income: 0, expense: 95000, balance: -95000 });

    const search = await api().get('/api/v1/transactions?search=bus').set(fresh.auth);
    expect(search.body.meta.total).toBe(2);

    const range = await api().get('/api/v1/transactions?minAmount=10000&maxAmount=50000').set(fresh.auth);
    expect(range.body.data.map((t) => t.amount)).toEqual([12000]);
  });

  it('suma montos decimales sin errores de punto flotante', async () => {
    const fresh = await createUser();
    const cat = await categoryId(fresh.auth, 'Otros gastos');
    await createExpense(fresh.auth, { categoryId: cat, amount: 0.1, date: '2026-10-01' });
    await createExpense(fresh.auth, { categoryId: cat, amount: 0.2, date: '2026-10-01' });
    const res = await api().get('/api/v1/transactions').set(fresh.auth);
    expect(res.body.meta.totals.expense).toBe(0.3);
  });

  it('persiste los datos: un registro creado se recupera en una nueva sesión', async () => {
    const fresh = await createUser();
    const cat = await categoryId(fresh.auth, 'Vivienda');
    const created = await createExpense(fresh.auth, { categoryId: cat, amount: 1200000, date: '2026-10-05', description: 'Arriendo' });

    const login = await api().post('/api/v1/auth/login').send({ email: fresh.email, password: fresh.password });
    const res = await api().get(`/api/v1/transactions/${created.body.data.id}`).set('Authorization', `Bearer ${login.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ amount: 1200000, description: 'Arriendo' });
  });
});
