import { Queue, type DefaultJobOptions } from 'bullmq';
import { bullConnection } from './connection.js';
import type { LaunchEvent, ModuleId } from '../types/index.js';

/**
 * BullMQ Queue instances re-emit connection 'error' events; without a listener
 * Node prints a full stack per retry. The connection-level handler already logs
 * one throttled warning, so swallow these to keep logs clean.
 */
function quiet<T>(q: Queue<T>): Queue<T> {
  q.on('error', () => {});
  return q;
}

/**
 * One queue per stage/module, per docs/infrastructure.md#queue-topology.
 * Failure in one module's queue never blocks another or ingestion.
 */

// Retry transient failures with backoff; keep the queues from growing unbounded.
// Exhausted jobs stay in the failed set (bounded) as a lightweight DLQ.
const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600, count: 5000 },
};
export const QUEUE_NAMES = {
  triage: 'triage',
  orchestrate: 'orchestrate',
  // NB: BullMQ forbids ':' in queue names (reserved for Redis keys) — use '-'.
  module: (m: ModuleId) => `module-${m}` as const,
  aggregate: 'aggregate',
  publish: 'publish',
} as const;

// ── Job payload shapes ──────────────────────────────────────────────────
export interface TriageJob {
  event: LaunchEvent;
}
export interface OrchestrateJob {
  projectId: string;
  reportId: string;
  reportVersion: number;
}
export interface ModuleJob {
  projectId: string;
  reportId: string;
  reportVersion: number;
  module: ModuleId;
}
export interface AggregateJob {
  reportId: string;
}
export interface PublishJob {
  reportId: string;
}

// ── Producer-side queue instances ───────────────────────────────────────
export const triageQueue = quiet(new Queue<TriageJob>(QUEUE_NAMES.triage, { connection: bullConnection, defaultJobOptions }));
export const orchestrateQueue = quiet(new Queue<OrchestrateJob>(QUEUE_NAMES.orchestrate, { connection: bullConnection, defaultJobOptions }));
export const aggregateQueue = quiet(new Queue<AggregateJob>(QUEUE_NAMES.aggregate, { connection: bullConnection, defaultJobOptions }));
export const publishQueue = quiet(new Queue<PublishJob>(QUEUE_NAMES.publish, { connection: bullConnection, defaultJobOptions }));

const moduleQueues = new Map<ModuleId, Queue<ModuleJob>>();
export function moduleQueue(m: ModuleId): Queue<ModuleJob> {
  let q = moduleQueues.get(m);
  if (!q) {
    q = quiet(new Queue<ModuleJob>(QUEUE_NAMES.module(m), { connection: bullConnection, defaultJobOptions }));
    moduleQueues.set(m, q);
  }
  return q;
}
