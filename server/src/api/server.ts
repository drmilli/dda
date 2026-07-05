import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { pingDb } from '../db/client.js';
import { connection } from '../queue/connection.js';
import { withTimeout } from '../lib/timeout.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerSubmitRoutes } from './routes/submit.js';
import { registerDisputeRoutes } from './routes/disputes.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerIngestRoutes } from './routes/ingest.js';

/**
 * Fastify app: report archive + feed, live SSE stream, manual submission,
 * dispute intake, admin review queue, and the ingestion webhook.
 * Hardened: request logging, safe error handler, env-scoped CORS, body limit,
 * liveness (/health) + readiness (/ready). See docs/api-reference.md.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: true, // so req.ip reflects X-Forwarded-For behind a proxy/LB
  });

  // Structured request logging via our pino instance.
  app.addHook('onResponse', async (req, reply) => {
    logger.info(
      { method: req.method, url: req.url, status: reply.statusCode, ms: Math.round(reply.elapsedTime) },
      'request',
    );
  });

  // Never leak internals; log the real error, return a safe shape.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) logger.error({ err, url: req.url }, 'request error');
    reply.status(status).send({
      error: { code: err.code ?? 'internal_error', message: status >= 500 ? 'internal error' : err.message },
    });
  });

  const origins = env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  await app.register(cors, { origin: origins });
  await app.register(sensible);

  app.get('/health', async () => ({ status: 'ok' })); // liveness
  app.get('/ready', async (_req, reply) => {
    const [db, redis] = await Promise.all([
      withTimeout(pingDb(), 2000, false),
      withTimeout(connection.ping().then(() => true), 2000, false),
    ]);
    const ok = db && redis;
    return reply.status(ok ? 200 : 503).send({ status: ok ? 'ready' : 'degraded', db, redis });
  });

  await registerReportRoutes(app);
  await registerStreamRoutes(app);
  await registerSubmitRoutes(app);
  await registerDisputeRoutes(app);
  await registerAdminRoutes(app);
  await registerIngestRoutes(app);

  if (env.NODE_ENV === 'production') {
    if (!env.ADMIN_TOKEN) logger.warn('ADMIN_TOKEN unset — admin endpoints will fail closed');
    if (env.ALLOWED_ORIGINS === '*') logger.warn('ALLOWED_ORIGINS is "*" in production — restrict it');
    if (!env.PUBLISHER_DRY_RUN) logger.warn('PUBLISHER_DRY_RUN=false — live X posting enabled');
  }

  logger.info('routes registered');
  return app;
}
