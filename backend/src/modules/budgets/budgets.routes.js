import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema, paginationMeta } from '../../utils/schemas.js';
import { budgetReport } from '../reports/reports.service.js';
import { sendXlsx } from '../reports/reports.routes.js';
import { analysisQuery, createBudgetSchema, listBudgetsQuery, updateBudgetSchema } from './budgets.schemas.js';
import * as service from './budgets.service.js';

export function budgetsRoutes() {
  const router = Router();

  router.get('/', validate({ query: listBudgetsQuery }), async (req, res) => {
    const { page, limit } = req.valid.query;
    const { items, total } = await service.list(req.user.id, req.valid.query);
    res.json({ data: items, meta: paginationMeta(page, limit, total) });
  });

  router.post('/', validate({ body: createBudgetSchema }), async (req, res) => {
    const { budget, alerts } = await service.create(req.user.id, req.valid.body);
    res.status(201).json({ data: budget, alerts });
  });

  router.get('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    res.json({ data: await service.getById(req.user.id, req.valid.params.id) });
  });

  router.put('/:id', validate({ params: idParamsSchema, body: updateBudgetSchema }), async (req, res) => {
    const { budget, alerts } = await service.update(req.user.id, req.valid.params.id, req.valid.body);
    res.json({ data: budget, alerts });
  });

  router.delete('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    await service.remove(req.user.id, req.valid.params.id);
    res.status(204).end();
  });

  // ---- Funcionalidad especial ----
  router.get('/:id/analysis', validate({ params: idParamsSchema, query: analysisQuery }), async (req, res) => {
    res.json({ data: await service.analyze(req.user.id, req.valid.params.id, req.valid.query) });
  });

  router.get('/:id/report', validate({ params: idParamsSchema, query: analysisQuery }), async (req, res) => {
    sendXlsx(res, await budgetReport(req.user.id, req.valid.params.id, req.valid.query));
  });

  return router;
}
