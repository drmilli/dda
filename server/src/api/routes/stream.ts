import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../../lib/env.js';
import { subscribeStream } from '../../events/bus.js';

/**
 * Live terminal stream (SSE). Relays StreamLine events for an in-flight report,
 * keyed by report id. Every line is a real deterministic check output — never
 * LLM narration. See docs/terminal-site.md.
 *
 *   GET /api/stream/:reportId  (text/event-stream)
 */

/** SSE writes raw headers (bypassing @fastify/cors), so resolve CORS here. */
function corsOrigin(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (env.ALLOWED_ORIGINS === '*') return '*';
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  return allowed.includes(origin) ? origin : null;
}

export async function registerStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { reportId: string } }>('/api/stream/:reportId', (req, reply) => {
    const { reportId } = req.params;
    const allowOrigin = corsOrigin(req);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
    });
    reply.raw.write(': connected\n\n');

    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);

    const unsubscribe = subscribeStream(reportId, (msg) => {
      if (msg.type === 'line') {
        reply.raw.write(`event: line\ndata: ${JSON.stringify(msg.line)}\n\n`);
      } else {
        reply.raw.write(`event: done\ndata: ${JSON.stringify({ report_id: reportId, status: msg.status })}\n\n`);
      }
    });

    req.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
}
