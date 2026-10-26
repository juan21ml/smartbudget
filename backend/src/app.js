import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { env } from './config/env.js';
import { requireAuth } from './middlewares/auth.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { createAuthLimiter, createGlobalLimiter } from './middlewares/rateLimiters.js';
import { alertsRoutes } from './modules/alerts/alerts.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { budgetsRoutes } from './modules/budgets/budgets.routes.js';
import { categoriesRoutes } from './modules/categories/categories.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { predictionsRoutes } from './modules/predictions/predictions.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { transactionsRoutes } from './modules/transactions/transactions.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

const openapiPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs', 'openapi.yaml');

/**
 * Crea la aplicación Express. Recibe opciones para que las pruebas puedan,
 * por ejemplo, usar un límite de intentos de login más bajo.
 */
export function createApp(options = {}) {
  const config = {
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
    authRateLimitWindowMin: env.AUTH_RATE_LIMIT_WINDOW_MIN,
    globalRateLimitMax: env.GLOBAL_RATE_LIMIT_MAX,
    corsOrigins: env.CORS_ORIGINS,
    ...options,
  };

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  // ---- Seguridad y utilidades globales ----
  app.use(
    pinoHttp({
      level: env.isTest ? 'silent' : env.LOG_LEVEL,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Nunca registrar el token ni las contraseñas
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  app.use('/api/v1/docs', helmet({ contentSecurityPolicy: false })); // Swagger UI necesita estilos en línea
  app.use(helmet());

  app.use(
    cors((req, callback) => {
      const origin = req.get('origin');
      // Permitido: sin origin (Postman, curl, servidor a servidor), la propia API
      // (Swagger UI se sirve desde el mismo dominio) o un origen de CORS_ORIGINS.
      const sameOrigin = origin !== undefined && origin === `${req.protocol}://${req.get('host')}`;
      if (origin && !sameOrigin && !config.corsOrigins.includes(origin)) {
        return callback(new Error('CORS_NOT_ALLOWED'));
      }
      return callback(null, {
        origin: Boolean(origin),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
        maxAge: 600,
      });
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(createGlobalLimiter({ max: config.globalRateLimitMax }));

  // ---- Documentación OpenAPI ----
  if (fs.existsSync(openapiPath)) {
    const spec = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
    app.get('/api/v1/docs.json', (_req, res) => res.json(spec));
    app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'SmartBudget API' }));
  }

  // ---- Rutas públicas ----
  const api = express.Router();
  const authLimiter = createAuthLimiter({ max: config.authRateLimitMax, windowMin: config.authRateLimitWindowMin });

  api.get('/', (_req, res) =>
    res.json({ name: 'SmartBudget API', version: 'v1', docs: '/api/v1/docs', health: '/api/v1/health' }),
  );
  api.use('/health', healthRoutes());
  api.use('/auth', authRoutes({ authLimiter }));

  // ---- Rutas privadas (requieren JWT) ----
  api.use('/users', requireAuth, usersRoutes());
  api.use('/categories', requireAuth, categoriesRoutes());
  api.use('/transactions', requireAuth, transactionsRoutes());
  api.use('/budgets', requireAuth, budgetsRoutes());
  api.use('/analytics', requireAuth, analyticsRoutes());
  api.use('/alerts', requireAuth, alertsRoutes());
  api.use('/predictions', requireAuth, predictionsRoutes());
  api.use('/reports', requireAuth, reportsRoutes());

  app.use('/api/v1', api);
  app.get('/', (_req, res) => res.json({ name: 'SmartBudget API', docs: '/api/v1/docs', health: '/api/v1/health' }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
