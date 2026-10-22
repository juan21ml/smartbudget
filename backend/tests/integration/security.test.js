/**
 * PRUEBAS DE SEGURIDAD
 * Autenticación (JWT), autorización (aislamiento entre usuarios), validación de entradas,
 * inyección SQL, asignación masiva, fuerza bruta, cabeceras HTTP, CORS y manejo de errores.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { query } from '../../src/database/pool.js';
import { PASSWORD, api, categoryId, createExpense, createUser } from '../helpers/api.js';

const SECRET = process.env.JWT_SECRET;
const signWith = (payload, secret = SECRET, options = {}) =>
  jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h', issuer: 'smartbudget-api', audience: 'smartbudget-client', ...options });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const PROTECTED_ROUTES = [
  ['get', '/api/v1/auth/me'],
  ['post', '/api/v1/auth/logout'],
  ['get', '/api/v1/users/me'],
  ['patch', '/api/v1/users/me'],
  ['delete', '/api/v1/users/me'],
  ['get', '/api/v1/categories'],
  ['post', '/api/v1/categories'],
  ['get', '/api/v1/transactions'],
  ['post', '/api/v1/transactions'],
  ['put', '/api/v1/transactions/00000000-0000-4000-8000-000000000000'],
  ['delete', '/api/v1/transactions/00000000-0000-4000-8000-000000000000'],
  ['get', '/api/v1/budgets'],
  ['post', '/api/v1/budgets'],
  ['get', '/api/v1/budgets/00000000-0000-4000-8000-000000000000/analysis'],
  ['get', '/api/v1/budgets/00000000-0000-4000-8000-000000000000/report'],
  ['get', '/api/v1/analytics/monthly'],
  ['get', '/api/v1/analytics/categories'],
  ['get', '/api/v1/analytics/comparison'],
  ['get', '/api/v1/predictions/expenses'],
  ['get', '/api/v1/alerts'],
  ['patch', '/api/v1/alerts/read-all'],
  ['get', '/api/v1/reports/monthly'],
];

describe('Seguridad · autenticación JWT', () => {
  let user;
  beforeAll(async () => {
    user = await createUser();
  });

  it.each(PROTECTED_ROUTES)('%s %s sin token → 401', async (method, path) => {
    const res = await api()[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['esquema distinto a Bearer', () => ({ Authorization: `Basic ${Buffer.from('a:b').toString('base64')}` })],
    ['Bearer vacío', () => ({ Authorization: 'Bearer ' })],
    ['token mal formado', () => bearer('esto.no.es.un.jwt')],
    ['firmado con otro secreto', () => bearer(signWith({ tv: 0 }, 'otro-secreto-de-un-atacante-0123456789', { subject: user.user.id }))],
    ['token expirado', () => bearer(signWith({ tv: 0 }, SECRET, { subject: user.user.id, expiresIn: -10 }))],
    ['emisor (iss) incorrecto', () => bearer(signWith({ tv: 0 }, SECRET, { subject: user.user.id, issuer: 'otro-sistema' }))],
    ['audiencia (aud) incorrecta', () => bearer(signWith({ tv: 0 }, SECRET, { subject: user.user.id, audience: 'otra-app' }))],
  ])('rechaza %s → 401', async (_name, headers) => {
    const res = await api().get('/api/v1/auth/me').set(headers());
    expect(res.status).toBe(401);
  });

  it('rechaza el ataque "alg: none" (token sin firma)', async () => {
    const encode = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: user.user.id, tv: 0, iss: 'smartbudget-api', aud: 'smartbudget-client', iat: now, exp: now + 3600,
    })}.`;
    expect((await api().get('/api/v1/auth/me').set(bearer(unsigned))).status).toBe(401);
  });

  it('rechaza un token alterado (cambiar el sub para suplantar a otro usuario)', async () => {
    const victim = await createUser();
    const [header, payload, signature] = user.token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...decoded, sub: victim.user.id })).toString('base64url');
    const res = await api().get('/api/v1/auth/me').set(bearer(`${header}.${forged}.${signature}`));
    expect(res.status).toBe(401);
  });

  it('el token de una cuenta eliminada deja de funcionar', async () => {
    const temp = await createUser();
    await api().delete('/api/v1/users/me').set(temp.auth).send({ password: PASSWORD });
    expect((await api().get('/api/v1/auth/me').set(temp.auth)).status).toBe(401);
  });

  it('después del logout el token anterior queda revocado', async () => {
    const temp = await createUser();
    await api().post('/api/v1/auth/logout').set(temp.auth);
    expect((await api().get('/api/v1/transactions').set(temp.auth)).status).toBe(401);
  });
});

describe('Seguridad · contraseñas', () => {
  it('guarda la contraseña con hash bcrypt y nunca la devuelve', async () => {
    const user = await createUser();
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [user.user.id]);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);

    const login = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const me = await api().get('/api/v1/users/me').set(user.auth);
    for (const body of [login.body, me.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain('password');
      expect(text).not.toContain('$2');
    }
  });

  it('exige contraseñas con mínimo 8 caracteres, letras y números', async () => {
    for (const password of ['1234567', 'abcdefgh', '12345678']) {
      const res = await api().post('/api/v1/auth/register').send({ name: 'Ana', email: `a${Date.now()}@t.com`, password });
      expect(res.status).toBe(400);
    }
  });
});

describe('Seguridad · aislamiento de datos entre usuarios (IDOR)', () => {
  let alice;
  let bob;
  const ids = {};

  beforeAll(async () => {
    alice = await createUser({ name: 'Alice' });
    bob = await createUser({ name: 'Bob' });
    ids.category = await categoryId(alice.auth, 'Alimentación');
    ids.transaction = (await createExpense(alice.auth, { categoryId: ids.category, amount: 450000, date: '2026-10-05' })).body.data.id;
    ids.budget = (
      await api().post('/api/v1/budgets').set(alice.auth).send({ categoryId: ids.category, amountLimit: 500000, month: '2026-10' })
    ).body.data.id;
    ids.alert = (await api().get('/api/v1/alerts').set(alice.auth)).body.data[0].id;
  });

  it.each([
    ['get', 'transactions', 'transaction'],
    ['put', 'transactions', 'transaction', { amount: 1 }],
    ['delete', 'transactions', 'transaction'],
    ['get', 'budgets', 'budget'],
    ['put', 'budgets', 'budget', { amountLimit: 1 }],
    ['delete', 'budgets', 'budget'],
    ['get', 'categories', 'category'],
    ['put', 'categories', 'category', { name: 'Hackeada' }],
    ['delete', 'categories', 'category'],
  ])('Bob no puede hacer %s sobre /%s de Alice → 404', async (method, resource, key, body) => {
    const req = api()[method](`/api/v1/${resource}/${ids[key]}`).set(bob.auth);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(404);
  });

  it('Bob no puede ver el análisis, el reporte ni las alertas de Alice', async () => {
    expect((await api().get(`/api/v1/budgets/${ids.budget}/analysis`).set(bob.auth)).status).toBe(404);
    expect((await api().get(`/api/v1/budgets/${ids.budget}/report`).set(bob.auth)).status).toBe(404);
    expect((await api().patch(`/api/v1/alerts/${ids.alert}/read`).set(bob.auth)).status).toBe(404);
    expect((await api().delete(`/api/v1/alerts/${ids.alert}`).set(bob.auth)).status).toBe(404);
  });

  it('Bob no puede usar una categoría de Alice para crear transacciones o presupuestos', async () => {
    const tx = await createExpense(bob.auth, { categoryId: ids.category, amount: 1000, date: '2026-10-05' });
    expect(tx.status).toBe(404);
    const budget = await api().post('/api/v1/budgets').set(bob.auth).send({ categoryId: ids.category, amountLimit: 1000, month: '2027-01' });
    expect(budget.status).toBe(404);
  });

  it('los listados y análisis de Bob no incluyen datos de Alice', async () => {
    const lists = await Promise.all(
      ['transactions', 'budgets', 'alerts', 'categories'].map((r) => api().get(`/api/v1/${r}`).set(bob.auth)),
    );
    const bobIds = lists.flatMap((r) => r.body.data.map((x) => x.id));
    for (const id of Object.values(ids)) expect(bobIds).not.toContain(id);

    const monthly = await api().get('/api/v1/analytics/monthly?month=2026-10').set(bob.auth);
    expect(monthly.body.data.expense).toBe(0);
  });

  it('los datos de Alice siguen intactos tras los intentos de Bob', async () => {
    const res = await api().get(`/api/v1/transactions/${ids.transaction}`).set(alice.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(450000);
  });
});

describe('Seguridad · validación de entradas e inyección', () => {
  let user;
  beforeAll(async () => {
    user = await createUser();
  });

  it('inyección SQL en el login se rechaza por validación', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: "' OR '1'='1' --", password: "' OR '1'='1" });
    expect(res.status).toBe(400);
  });

  it('inyección SQL en la búsqueda se trata como texto literal (consultas parametrizadas)', async () => {
    const res = await api()
      .get('/api/v1/transactions')
      .query({ search: "'; DROP TABLE users; --" })
      .set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    const { rows } = await query("SELECT to_regclass('public.users') AS t");
    expect(rows[0].t).toBe('users');
  });

  it('el comodín % en la búsqueda no devuelve todos los registros', async () => {
    const cat = await categoryId(user.auth, 'Transporte');
    await createExpense(user.auth, { categoryId: cat, amount: 1000, date: '2026-10-01', description: 'Bus' });
    const res = await api().get('/api/v1/transactions').query({ search: '%' }).set(user.auth);
    expect(res.body.meta.total).toBe(0);
  });

  it.each([
    ['sortBy', 'amount; DROP TABLE users'],
    ['order', 'desc; DELETE FROM transactions'],
    ['categoryId', "1' OR '1'='1"],
    ['limit', '100000'],
    ['page', '-1'],
  ])('rechaza el parámetro %s=%s → 400', async (param, value) => {
    const res = await api().get('/api/v1/transactions').query({ [param]: value }).set(user.auth);
    expect(res.status).toBe(400);
  });

  it('rechaza IDs que no son UUID → 400', async () => {
    expect((await api().get("/api/v1/transactions/1 OR 1=1").set(user.auth)).status).toBe(400);
    expect((await api().get('/api/v1/budgets/123').set(user.auth)).status).toBe(400);
  });

  it('asignación masiva: no acepta campos extra como userId, type o role', async () => {
    const cat = await categoryId(user.auth, 'Alimentación');
    const other = await createUser();
    const tx = await createExpense(user.auth, { categoryId: cat, amount: 1000, date: '2026-10-01', userId: other.user.id });
    expect(tx.status).toBe(400);
    const typed = await createExpense(user.auth, { categoryId: cat, amount: 1000, date: '2026-10-01', type: 'INCOME' });
    expect(typed.status).toBe(400);
    const reg = await api().post('/api/v1/auth/register').send({ name: 'Eve', email: 'eve@test.com', password: PASSWORD, role: 'admin' });
    expect(reg.status).toBe(400);
  });

  it('montos fuera de rango o con tipo incorrecto → 400', async () => {
    const cat = await categoryId(user.auth, 'Alimentación');
    for (const amount of [1e15, '1000', null, true, Number.MAX_SAFE_INTEGER]) {
      const res = await createExpense(user.auth, { categoryId: cat, amount, date: '2026-10-01' });
      expect(res.status).toBe(400);
    }
  });

  it('JSON mal formado → 400 sin detalles internos', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", "password": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js|stack|SyntaxError/);
  });

  it('cuerpo demasiado grande (> 100 KB) → 413', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'a@b.com', password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it('el texto con HTML se guarda tal cual y se devuelve como JSON (no se ejecuta)', async () => {
    const cat = await categoryId(user.auth, 'Alimentación');
    const res = await createExpense(user.auth, { categoryId: cat, amount: 1000, date: '2026-10-01', description: '<script>alert(1)</script>' });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Seguridad · fuerza bruta, cabeceras, CORS y errores', () => {
  it('limita los intentos de login (429 tras superar el máximo)', async () => {
    const limited = createApp({ authRateLimitMax: 3 });
    const attempt = () => request(limited).post('/api/v1/auth/login').send({ email: 'x@test.com', password: 'Incorrecta1' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers).toHaveProperty('retry-after');
  });

  it('envía cabeceras de seguridad (Helmet) y oculta la tecnología del servidor', async () => {
    const res = await api().get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('CORS: permite el origen configurado y bloquea los demás', async () => {
    const ok = await api().get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const evil = await api().get('/api/v1/health').set('Origin', 'https://sitio-malicioso.com');
    expect(evil.status).toBe(403);
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rutas inexistentes → 404 con formato de error uniforme', async () => {
    const res = await api().get('/api/v1/admin');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
    expect(res.body.error.requestId).toBeDefined();
  });

  it('la respuesta de error de login no revela si el email existe', async () => {
    const user = await createUser();
    const a = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Incorrecta1' });
    const b = await api().post('/api/v1/auth/login').send({ email: 'no-existe@test.com', password: 'Incorrecta1' });
    expect(a.status).toBe(b.status);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
});
