import { describe, expect, it } from 'vitest';
import { PASSWORD, api, createUser } from '../helpers/api.js';

describe('Autenticación', () => {
  it('registra un usuario, devuelve token y crea categorías por defecto', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Juan José', email: 'Juan.Registro@Test.com', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: 'Juan José', email: 'juan.registro@test.com' });
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.tokenType).toBe('Bearer');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const cats = await api().get('/api/v1/categories').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(cats.body.data.length).toBeGreaterThanOrEqual(10);
  });

  it('rechaza un email ya registrado (409), sin importar mayúsculas', async () => {
    const user = await createUser();
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Otro', email: user.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('El email ya está registrado');
  });

  it.each([
    [{ email: 'a@test.com', password: PASSWORD }, 'body.name'],
    [{ name: 'Ana', email: 'no-es-email', password: PASSWORD }, 'body.email'],
    [{ name: 'Ana', email: 'ana@test.com', password: 'corta1' }, 'body.password'],
    [{ name: 'Ana', email: 'ana@test.com', password: 'sololetras' }, 'body.password'],
  ])('valida los datos de registro (%#)', async (body, field) => {
    const res = await api().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });

  it('inicia sesión con credenciales correctas', async () => {
    const user = await createUser();
    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.expiresAt).toBeTypeOf('string');
  });

  it('responde igual con contraseña incorrecta o email inexistente (no revela cuentas)', async () => {
    const user = await createUser();
    const wrongPass = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Incorrecta99' });
    const noUser = await api().post('/api/v1/auth/login').send({ email: 'nadie@test.com', password: 'Incorrecta99' });

    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.error.message).toBe('Credenciales inválidas');
    expect(noUser.body.error.message).toBe(wrongPass.body.error.message);
  });

  it('GET /auth/me devuelve el usuario autenticado', async () => {
    const user = await createUser({ name: 'Fabián' });
    const res = await api().get('/api/v1/auth/me').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.user.id, name: 'Fabián', email: user.email });
  });

  it('logout invalida el token usado', async () => {
    const user = await createUser();
    expect((await api().post('/api/v1/auth/logout').set(user.auth)).status).toBe(200);
    const after = await api().get('/api/v1/auth/me').set(user.auth);
    expect(after.status).toBe(401);
  });
});

describe('Usuarios (perfil)', () => {
  it('actualiza el nombre', async () => {
    const user = await createUser();
    const res = await api().patch('/api/v1/users/me').set(user.auth).send({ name: 'Nuevo Nombre' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Nuevo Nombre');
  });

  it('cambia la contraseña: el token viejo deja de servir y el nuevo funciona', async () => {
    const user = await createUser();
    const res = await api()
      .patch('/api/v1/users/me/password')
      .set(user.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'NuevaClave2026' });
    expect(res.status).toBe(200);

    expect((await api().get('/api/v1/auth/me').set(user.auth)).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.token}`)).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ email: user.email, password: 'NuevaClave2026' })).status).toBe(200);
  });

  it('no cambia la contraseña si la actual es incorrecta', async () => {
    const user = await createUser();
    const res = await api()
      .patch('/api/v1/users/me/password')
      .set(user.auth)
      .send({ currentPassword: 'Equivocada1', newPassword: 'NuevaClave2026' });
    expect(res.status).toBe(401);
  });

  it('elimina la cuenta con sus datos, confirmando la contraseña', async () => {
    const user = await createUser();
    expect((await api().delete('/api/v1/users/me').set(user.auth).send({ password: 'mala' })).status).toBe(401);
    expect((await api().delete('/api/v1/users/me').set(user.auth).send({ password: PASSWORD })).status).toBe(204);
    expect((await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(401);
  });
});
