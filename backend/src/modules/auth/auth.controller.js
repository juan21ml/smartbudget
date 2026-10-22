import * as authService from './auth.service.js';

export async function register(req, res) {
  const result = await authService.register(req.valid.body);
  res.status(201).json({ data: result });
}

export async function login(req, res) {
  const result = await authService.login(req.valid.body);
  res.json({ data: result });
}

export async function logout(req, res) {
  await authService.logout(req.user.id);
  res.json({ data: { message: 'Sesión cerrada. Los tokens anteriores ya no son válidos.' } });
}

export async function me(req, res) {
  const user = await authService.getMe(req.user.id);
  res.json({ data: user });
}
