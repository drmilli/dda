import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

/**
 * Shared Redis connection. BullMQ requires maxRetriesPerRequest: null on the
 * connection it uses for blocking commands. We also use this instance directly
 * for pub/sub (events bus) and sets (completion tracking).
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  // Back off reconnect attempts (200ms → 5s cap) so an outage doesn't hammer.
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

// Throttle connection-error logging to one concise line per 10s (an outage
// otherwise floods stderr with a full stack per retry).
let lastErrLog = 0;
export function attachRedisErrorHandler(client: Redis, label = 'redis'): void {
  client.on('error', (err: Error & { code?: string }) => {
    const now = Date.now();
    if (now - lastErrLog > 10_000) {
      lastErrLog = now;
      logger.warn({ label, code: err.code ?? err.message }, 'redis unavailable — retrying');
    }
  });
}
attachRedisErrorHandler(connection);

/**
 * BullMQ bundles its own copy of ioredis, whose types are nominally distinct
 * from the top-level ioredis instance even though they're runtime-compatible.
 * Cast once here so every Queue/Worker gets a correctly-typed connection.
 */
export const bullConnection = connection as unknown as ConnectionOptions;
