import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { validate } from '../../middlewares/validate.js';
import { todayIn } from '../../utils/dates.js';
import { monthSchema } from '../../utils/schemas.js';
import * as service from './reports.service.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function sendXlsx(res, { buffer, filename }) {
  res.set({
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(Buffer.from(buffer));
}

export function reportsRoutes() {
  const router = Router();

  router.get('/monthly', validate({ query: z.object({ month: monthSchema.optional() }) }), async (req, res) => {
    const month = req.valid.query.month ?? todayIn(env.APP_TIMEZONE).slice(0, 7);
    sendXlsx(res, await service.monthlyReport(req.user.id, { month }));
  });

  return router;
}
