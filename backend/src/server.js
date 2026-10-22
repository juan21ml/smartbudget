import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './database/pool.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`SmartBudget API escuchando en http://localhost:${env.PORT}/api/v1`);
  console.log(`Documentación: http://localhost:${env.PORT}/api/v1/docs`);
});

// Apagado ordenado: termina las solicitudes en curso y cierra el pool de conexiones.
function shutdown(signal) {
  console.log(`${signal} recibido, cerrando servidor...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
