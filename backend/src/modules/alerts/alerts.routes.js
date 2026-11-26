import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema, paginationMeta, paginationSchema } from '../../utils/schemas.js';
import * as service from './alerts.service.js';

const listQuery = z.object({
  ...paginationSchema,
  unread: z
    .enum(['true', 'false'], { error: "unread debe ser 'true' o 'false'" })
    .transform((v) => v === 'true')
    .optional(),
  type: z
    .enum(['BUDGET_WARNING', 'BUDGET_EXCEEDED', 'UNUSUAL_EXPENSE'],
       { error: "type debe ser 'BUDGET_WARNING', 'BUDGET_EXCEEDED' o 'UNUSUAL_EXPENSE'" })
    .optional(),
});

export function alertsRoutes() {
  const router = Router();

  router.get('/', validate({ query: listQuery }), async (req, res) => {
    const { page, limit } = req.valid.query;
    const { items, total, unreadCount } = await service.list(req.user.id, req.valid.query);
    res.json({ data: items, meta: { ...paginationMeta(page, limit, total), unreadCount } });
  });

  router.patch('/read-all', async (req, res) => {
    res.json({ data: await service.markAllRead(req.user.id) });
  });

  router.patch('/:id/read', validate({ params: idParamsSchema }), async (req, res) => {
    res.json({ data: await service.markRead(req.user.id, req.valid.params.id) });
  });

  router.delete('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    await service.remove(req.user.id, req.valid.params.id);
    res.status(204).end();
  });

  return router;
}
