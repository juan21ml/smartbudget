import { z } from 'zod';
import { isValidDate } from './dates.js';

/** Esquemas Zod reutilizados por varios módulos. */

export const MAX_AMOUNT = 999_999_999_999.99; // límite de NUMERIC(14,2)

export const amountSchema = z
  .number({
    error: (issue) =>
      issue.input === undefined ? 'El monto es obligatorio' : 'El monto debe ser un número',
  })
  .positive('Ingrese un monto positivo')
  .max(MAX_AMOUNT, 'El monto excede el máximo permitido')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'El monto admite máximo 2 decimales');

export const dateSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'La fecha es obligatoria' : 'La fecha debe ser texto',
  })
  .refine(isValidDate, 'La fecha debe tener formato YYYY-MM-DD y ser válida');

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes debe tener formato YYYY-MM');

export const uuidSchema = z.string().uuid('El identificador no es válido');

export const idParamsSchema = z.object({ id: uuidSchema });

export const typeSchema = z.enum(['INCOME', 'EXPENSE'], {
  error: "El tipo debe ser 'INCOME' o 'EXPENSE'",
});

export const paginationSchema = {
  page: z.coerce.number().int().min(1, 'page debe ser ≥ 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'limit máximo es 100').default(20),
};

export function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Exige que un objeto de actualización parcial tenga al menos un campo. */
export function nonEmpty(schema) {
  return schema.refine((obj) => Object.keys(obj).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });
}
