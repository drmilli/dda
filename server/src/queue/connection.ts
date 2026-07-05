import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../lib/env.js';

/**
 * Shared Redis connection. BullMQ requires maxRetriesPerRequest: null on the
 * connection it uses for blocking commands. We also use this instance directly
 * for pub/sub (events bus) and sets (completion tracking).
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * BullMQ bundles its own copy of ioredis, whose types are nominally distinct
 * from the top-level ioredis instance even though they're runtime-compatible.
 * Cast once here so every Queue/Worker gets a correctly-typed connection.
 */
export const bullConnection = connection as unknown as ConnectionOptions;
