/**
 * Error de aplicación con código HTTP y código interno.
 * Los servicios lanzan AppError; el middleware de errores lo convierte en respuesta JSON.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'No autorizado') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'Recurso no encontrado') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message, details) {
    return new AppError(409, 'CONFLICT', message, details);
  }
}
