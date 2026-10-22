import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema, paginationMeta } from '../../utils/schemas.js';
import { createTransactionSchema, listTransactionsQuery, updateTransactionSchema } from './transactions.schemas.js';
import * as service from './transactions.service.js';

export function transactionsRoutes() {
  const router = Router();

  router.get('/', validate({ query: listTransactionsQuery }), async (req, res) => {
    const { page, limit } = req.valid.query;
    const { items, total, totals } = await service.list(req.user.id, req.valid.query);
    res.json({ data: items, meta: { ...paginationMeta(page, limit, total), totals } });
  });

  router.post('/', validate({ body: createTransactionSchema }), async (req, res) => {
    const { transaction, alerts } = await service.create(req.user.id, req.valid.body);
    res.status(201).json({ data: transaction, alerts });
  });

  router.get('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    res.json({ data: await service.getById(req.user.id, req.valid.params.id) });
  });

  router.put('/:id', validate({ params: idParamsSchema, body: updateTransactionSchema }), async (req, res) => {
    const { transaction, alerts } = await service.update(req.user.id, req.valid.params.id, req.valid.body);
    res.json({ data: transaction, alerts });
  });

  router.delete('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    await service.remove(req.user.id, req.valid.params.id);
    res.status(204).end();
  });

  return router;
}
