import type { FastifyReply, FastifyRequest } from 'fastify';
import { connection } from '../queue/connection.js';
import { env } from '../lib/env.js';
import { withTimeout } from '../lib/timeout.js';

/**
 * Redis fixed-window rate limiter — protects the paid module/X budget on public
 * write endpoints. Shared across instances via Redis so scaling out doesn't
 * multiply the limit. Fails open if Redis is unavailable (availability > limit).
 */
export function rateLimit(bucket: string) {
  const max = env.RATE_LIMIT_MAX;
  const windowSec = env.RATE_LIMIT_WINDOW_SEC;

  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ip = req.ip || 'unknown';
    const key = `ratelimit:${bucket}:${ip}`;
    // Fail open on any Redis slowness/outage (returns 0 → treated as allowed).
    const n = await withTimeout(
      (async () => {
        const count = await connection.incr(key);
        if (count === 1) await connection.expire(key, windowSec);
        return count;
      })(),
      250,
      0,
    );
    if (n > max) {
      const ttl = await withTimeout(connection.ttl(key), 200, windowSec);
      void reply.header('Retry-After', String(Math.max(1, ttl)));
      return reply.tooManyRequests(`rate limit exceeded — retry in ${ttl}s`);
    }
  };
}
