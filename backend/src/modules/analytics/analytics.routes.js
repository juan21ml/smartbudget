import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { validate } from '../../middlewares/validate.js';
import { monthRange, todayIn } from '../../utils/dates.js';
import { dateSchema, monthSchema, typeSchema } from '../../utils/schemas.js';
import * as service from './analytics.service.js';

const currentMonth = () => todayIn(env.APP_TIMEZONE).slice(0, 7);

const monthQuery = z.object({ month: monthSchema.optional() });

const categoriesQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  type: typeSchema.default('EXPENSE'),
});

const trendQuery = z.object({
  months: z.coerce.number().int().min(1).max(24, 'months máximo es 24').default(6),
  until: monthSchema.optional(),
});

export function analyticsRoutes() {
  const router = Router();

  router.get('/monthly', validate({ query: monthQuery }), async (req, res) => {
    const month = req.valid.query.month ?? currentMonth();
    res.json({ data: await service.monthly(req.user.id, { month }) });
  });

  router.get('/categories', validate({ query: categoriesQuery }), async (req, res) => {
    const { start, end } = monthRange(currentMonth());
    const { from = start, to = end, type } = req.valid.query;
    res.json({ data: await service.categories(req.user.id, { from, to, type }) });
  });

  router.get('/comparison', validate({ query: monthQuery }), async (req, res) => {
    const month = req.valid.query.month ?? currentMonth();
    res.json({ data: await service.comparison(req.user.id, { month }) });
  });

  router.get('/trend', validate({ query: trendQuery }), async (req, res) => {
    const { months, until = currentMonth() } = req.valid.query;
    res.json({ data: await service.trend(req.user.id, { months, until }) });
  });

  return router;
}
