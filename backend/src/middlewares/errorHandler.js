import { AppError } from '../utils/AppError.js';

/** 404 para rutas que no existen. */
export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `La ruta ${req.method} ${req.path} no existe`));
}

/** Traduce errores de PostgreSQL a respuestas HTTP comprensibles. */
function fromPostgres(err) {
  switch (err.code) {
    case '23505': // unique_violation
      return new AppError(409, 'CONFLICT', 'El registro ya existe');
    case '23503': // foreign_key_violation
      return new AppError(409, 'CONFLICT', 'El registro está relacionado con otros datos');
    case '23514': // check_violation
    case '22P02': // invalid_text_representation
    case '22003': // numeric_value_out_of_range
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return new AppError(400, 'BAD_REQUEST', 'Datos inválidos');
    default:
      return null;
  }
}

/**
 * Manejador central de errores. Formato único de respuesta:
 * { "error": { "code": "...", "message": "...", "details": [...] } }
 * Nunca expone stack traces ni mensajes internos de la base de datos.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let appError = err instanceof AppError ? err : null;

  // Errores de express.json (JSON mal formado o cuerpo demasiado grande)
  if (!appError && err.type === 'entity.parse.failed') {
    appError = new AppError(400, 'INVALID_JSON', 'El cuerpo de la solicitud no es un JSON válido');
  }
  if (!appError && err.type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud es demasiado grande');
  }
  if (!appError && err.message === 'CORS_NOT_ALLOWED') {
    appError = new AppError(403, 'CORS_NOT_ALLOWED', 'Origen no permitido');
  }
  if (!appError && typeof err.code === 'string') {
    appError = fromPostgres(err);
  }

  if (!appError) {
    req.log?.error({ err }, 'Error no controlado');
    appError = new AppError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno. Intente más tarde.');
  }

  const body = { error: { code: appError.code, message: appError.message } };
  if (appError.details) body.error.details = appError.details;
  if (req.id) body.error.requestId = req.id;

  res.status(appError.status).json(body);
}
