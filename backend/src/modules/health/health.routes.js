import { Router } from 'express';
import { query } from '../../database/pool.js';

/** Estado del servicio: comprueba también la conexión con PostgreSQL. */
export function healthRoutes() {
  const router = Router();

  router.get('/', async (_req, res) => {
    const started = Date.now();
    let database = 'up';
    try {
      await query('SELECT 1');
    } catch {
      database = 'down';
    }
    const ok = database === 'up';
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      database,
      dbLatencyMs: Date.now() - started,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
    });
  });

  return router;
}
