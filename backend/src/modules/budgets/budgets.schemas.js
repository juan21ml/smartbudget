import { z } from 'zod';
import { monthRange } from '../../utils/dates.js';
import { amountSchema, dateSchema, monthSchema, paginationSchema, uuidSchema } from '../../utils/schemas.js';

export const MAX_PERIOD_DAYS = 366;

const budgetFields = {
  categoryId: uuidSchema,
  amountLimit: amountSchema,
  periodStart: dateSchema,
  periodEnd: dateSchema,
  // Atajo: "month": "2026-10" equivale a periodStart 2026-10-01 y periodEnd 2026-10-31
  month: monthSchema,
};

function resolveMonth(data, ctx) {
  if (data.month) {
    if (data.periodStart || data.periodEnd) {
      ctx.addIssue({ code: 'custom', path: ['month'], message: 'Use "month" o "periodStart/periodEnd", no ambos' });
      return z.NEVER;
    }
    const { start, end } = monthRange(data.month);
    const { month: _month, ...rest } = data;
    return { ...rest, periodStart: start, periodEnd: end };
  }
  return data;
}

export const createBudgetSchema = z
  .object(budgetFields)
  .partial({ periodStart: true, periodEnd: true, month: true })
  .strict()
  .transform(resolveMonth)
  .superRefine((data, ctx) => {
    if (!data.periodStart || !data.periodEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['periodStart'],
        message: 'Indique el periodo con "month" (YYYY-MM) o con "periodStart" y "periodEnd"',
      });
    }
  });

export const updateBudgetSchema = z
  .object(budgetFields)
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Debe enviar al menos un campo para actualizar')
  .transform(resolveMonth);

export const listBudgetsQuery = z.object({
  ...paginationSchema,
  categoryId: uuidSchema.optional(),
  activeOn: dateSchema.optional(),
  status: z.enum(['OK', 'WARNING', 'EXCEEDED']).optional(),
});

export const analysisQuery = z.object({
  groupBy: z
    .enum(['day', 'week', 'month'], { errorMap: () => ({ message: "groupBy debe ser 'day', 'week' o 'month'" }) })
    .default('week'),
  // Fecha de referencia del análisis. Por defecto: hoy (zona horaria de la app).
  asOf: dateSchema.optional(),
});
