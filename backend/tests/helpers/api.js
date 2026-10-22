import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Clave12345';

/** Registra un usuario nuevo con email único y devuelve su token. */
export async function createUser(overrides = {}) {
  const body = {
    name: 'Usuario Prueba',
    email: `user-${randomUUID()}@test.com`,
    password: PASSWORD,
    ...overrides,
  };
  const res = await api().post('/api/v1/auth/register').send(body);
  if (res.status !== 201) throw new Error(`No se pudo registrar: ${JSON.stringify(res.body)}`);
  return { ...res.body.data, email: body.email, password: body.password, auth: { Authorization: `Bearer ${res.body.data.token}` } };
}

export async function categoryId(auth, name) {
  const res = await api().get('/api/v1/categories').set(auth);
  const cat = res.body.data.find((c) => c.name === name);
  if (!cat) throw new Error(`Categoría ${name} no encontrada`);
  return cat.id;
}

export async function createExpense(auth, data) {
  return api().post('/api/v1/transactions').set(auth).send(data);
}
