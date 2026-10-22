import { AppError } from '../utils/AppError.js';

/**
 * Valida body, query y params con esquemas Zod.
 * Los datos validados (y transformados) quedan en req.valid.
 * Cualquier campo inválido responde 400 con el detalle de cada error.
 */
export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    const valid = {};
    const details = [];

    for (const [source, schema] of Object.entries({ params, query, body })) {
      if (!schema) continue;
      const result = schema.safeParse(req[source] ?? {});
      if (result.success) {
        valid[source] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({
            field: [source, ...issue.path].join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (details.length > 0) {
      // El primer mensaje se muestra como mensaje principal (ej. "Ingrese un monto positivo").
      return next(new AppError(400, 'VALIDATION_ERROR', details[0].message, details));
    }

    req.valid = valid;
    next();
  };
}
