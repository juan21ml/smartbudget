import { z } from 'zod';
import { amountSchema, dateSchema, nonEmpty, paginationSchema, typeSchema, uuidSchema } from '../../utils/schemas.js';

const descriptionSchema = z
  .string({ error: (i) => (i.input === undefined ? undefined : 'La descripción debe ser texto') })
  .trim()
  .max(255, 'La descripción no puede superar 255 caracteres')
  .nullable();

// El tipo (INCOME/EXPENSE) NO se envía: se toma de la categoría.
// Así es imposible registrar un "gasto" en una categoría de ingresos.
const fields = {
  categoryId: uuidSchema,
  amount: amountSchema,
  date: dateSchema,
  description: descriptionSchema.optional(),
};

export const createTransactionSchema = z.object(fields).strict();

export const updateTransactionSchema = nonEmpty(z.object(fields).partial().strict());

export const listTransactionsQuery = z
  .object({
    ...paginationSchema,
    type: typeSchema.optional(),
    categoryId: uuidSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    minAmount: z.coerce.number().nonnegative('minAmount no puede ser negativo').optional(),
    maxAmount: z.coerce.number().positive('maxAmount debe ser positivo').optional(),
    search: z.string().trim().max(100).optional(),
    sortBy: z
      .enum(['date', 'amount', 'createdAt'], { error: "sortBy debe ser 'date', 'amount' o 'createdAt'" })
      .default('date'),
    order: z.enum(['asc', 'desc'], { error: "order debe ser 'asc' o 'desc'" }).default('desc'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' debe ser anterior o igual a 'to'", path: ['from'] })
  .refine((q) => q.minAmount === undefined || q.maxAmount === undefined || q.minAmount <= q.maxAmount, {
    message: 'minAmount debe ser menor o igual a maxAmount',
    path: ['minAmount'],
  });
