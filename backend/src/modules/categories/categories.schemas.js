import { z } from 'zod';
import { nonEmpty, typeSchema } from '../../utils/schemas.js';

const nameSchema = z
  .string({ error: (i) => (i.input === undefined ? 'El nombre es obligatorio' : undefined) })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(60, 'El nombre no puede superar 60 caracteres');

export const createCategorySchema = z.object({ name: nameSchema, type: typeSchema }).strict();

export const updateCategorySchema = nonEmpty(z.object({ name: nameSchema, type: typeSchema }).partial().strict());

export const listCategoriesQuery = z.object({ type: typeSchema.optional() });
