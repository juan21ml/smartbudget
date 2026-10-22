import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { validate } from '../../middlewares/validate.js';
import { monthRange, previousMonth, todayIn } from '../../utils/dates.js';
import { dateSchema, monthSchema } from '../../utils/schemas.js';
import * as service from './predictions.service.js';

const expensesQuery = z.object({
  month: monthSchema.optional(),
  // Fecha de referencia ("hoy"). Útil para pruebas y demostraciones reproducibles.
  asOf: dateSchema.optional(),
});

const accuracyQuery = z.object({
  months: z.coerce.number().int().min(1).max(24, 'months máximo es 24').default(6),
  until: monthSchema.optional(),
});

export function predictionsRoutes() {
  const router = Router();

  router.get('/expenses', validate({ query: expensesQuery }), async (req, res) => {
    const asOf = req.valid.query.asOf ?? todayIn(env.APP_TIMEZONE);
    const month = req.valid.query.month ?? asOf.slice(0, 7);
    res.json({ data: await service.expenses(req.user.id, { month, asOf }) });
  });

  router.get('/accuracy', validate({ query: accuracyQuery }), async (req, res) => {
    const today = todayIn(env.APP_TIMEZONE);
    // Solo meses finalizados: por defecto termina en el mes anterior al actual.
    const until = req.valid.query.until ?? previousMonth(today.slice(0, 7));
    const lastAllowed = previousMonth(today.slice(0, 7));
    const effectiveUntil = monthRange(until).end > monthRange(lastAllowed).end ? lastAllowed : until;
    res.json({ data: await service.accuracy(req.user.id, { months: req.valid.query.months, until: effectiveUntil }) });
  });

  return router;
}
