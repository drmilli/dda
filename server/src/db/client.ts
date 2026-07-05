import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

/**
 * Two connection profiles per docs/infrastructure.md#neon-specifics:
 *  - `db`        → pooled connection, for the web/API tier.
 *  - `dbDirect`  → direct/unpooled, for long-lived BullMQ workers + migrations.
 *
 * Long-lived workers should import `dbDirect`; the API imports `db`.
 */
const pooled = postgres(env.DATABASE_URL, { prepare: false });
const direct = postgres(env.DATABASE_URL_DIRECT ?? env.DATABASE_URL, { max: 10 });

export const db = drizzle(pooled, { schema });
export const dbDirect = drizzle(direct, { schema });

/** Close both Postgres pools (graceful shutdown). */
export async function closeDb(): Promise<void> {
  await Promise.allSettled([pooled.end({ timeout: 5 }), direct.end({ timeout: 5 })]);
}

/** Liveness probe for the DB. */
export async function pingDb(): Promise<boolean> {
  try {
    await pooled`select 1`;
    return true;
  } catch {
    return false;
  }
}

export { schema };
