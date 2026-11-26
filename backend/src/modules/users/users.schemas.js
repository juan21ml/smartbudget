import { z } from 'zod';
import { nameSchema, passwordSchema } from '../auth/auth.schemas.js';

export const updateProfileSchema = z.object({ name: nameSchema }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: (i) => (i.input === undefined ? 'La contraseña actual es obligatoria' : undefined) })
      .min(1)
      .max(72),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['newPassword'],
  });

export const deleteAccountSchema = z
  .object({
    password: z
      .string({ error: (i) => (i.input === undefined ? 'Confirme con su contraseña' : undefined) })
      .min(1, 'Confirme con su contraseña')
      .max(72),
  })
  .strict();