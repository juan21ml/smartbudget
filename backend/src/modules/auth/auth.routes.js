import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

export function authRoutes({ authLimiter }) {
  const router = Router();

  router.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);
  router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
  router.post('/logout', requireAuth, controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}
