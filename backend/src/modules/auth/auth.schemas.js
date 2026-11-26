import { z } from 'zod';

const emailSchema = z
  .string({ error: (i) => (i.input === undefined ? 'El email es obligatorio' : undefined) })
  .trim()
  .toLowerCase()
  .max(255, 'El email es demasiado largo')
  .email('El email no es válido');

// bcrypt solo usa los primeros 72 bytes, por eso se limita la longitud.
export const passwordSchema = z
  .string({ error: (i) => (i.input === undefined ? 'La contraseña es obligatoria' : undefined) })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar 72 caracteres')
  .regex(/[A-Za-z]/, 'La contraseña debe contener al menos una letra')
  .regex(/\d/, 'La contraseña debe contener al menos un número');

export const nameSchema = z
  .string({ error: (i) => (i.input === undefined ? 'El nombre es obligatorio' : undefined) })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(100, 'El nombre no puede superar 100 caracteres');

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string({ error: (i) => (i.input === undefined ? 'La contraseña es obligatoria' : undefined) })
      .min(1, 'La contraseña es obligatoria')
      .max(72),
  })
  .strict();