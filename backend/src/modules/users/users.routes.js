import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { getMe } from '../auth/auth.service.js';
import { changePasswordSchema, deleteAccountSchema, updateProfileSchema } from './users.schemas.js';
import * as usersService from './users.service.js';

export function usersRoutes() {
  const router = Router();

  router.get('/me', async (req, res) => {
    res.json({ data: await getMe(req.user.id) });
  });

  router.patch('/me', validate({ body: updateProfileSchema }), async (req, res) => {
    res.json({ data: await usersService.updateProfile(req.user.id, req.valid.body) });
  });

  router.patch('/me/password', validate({ body: changePasswordSchema }), async (req, res) => {
    const result = await usersService.changePassword(req.user.id, req.valid.body);
    res.json({ data: { message: 'Contraseña actualizada. Las demás sesiones fueron cerradas.', ...result } });
  });

  router.delete('/me', validate({ body: deleteAccountSchema }), async (req, res) => {
    await usersService.deleteAccount(req.user.id, req.valid.body);
    res.status(204).end();
  });

  return router;
}
