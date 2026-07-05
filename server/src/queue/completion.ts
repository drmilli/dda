import { connection } from './connection.js';
import type { ModuleId } from '../types/index.js';

/**
 * Tracks which module jobs are still outstanding for a report so the last one
 * to finish can trigger aggregation. Backed by a Redis set.
 */
const key = (reportId: string) => `report:${reportId}:remaining`;

export async function seedRemaining(reportId: string, modules: ModuleId[]): Promise<void> {
  if (modules.length === 0) return;
  await connection.sadd(key(reportId), ...modules);
  await connection.expire(key(reportId), 60 * 60); // safety TTL
}

/** Mark one module done; returns how many remain. */
export async function markModuleDone(reportId: string, module: ModuleId): Promise<number> {
  await connection.srem(key(reportId), module);
  return connection.scard(key(reportId));
}
