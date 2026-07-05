import { Worker, type Processor } from 'bullmq';
import { bullConnection } from './connection.js';
import { logger } from '../lib/logger.js';
import { onShutdown } from '../lib/shutdown.js';

/**
 * Creates a BullMQ Worker with production defaults: failure/error logging,
 * bounded concurrency, and graceful close on shutdown (stops accepting new jobs
 * and waits for in-flight ones).
 */
export function startWorker<T>(name: string, processor: Processor<T>, concurrency = 4): Worker<T> {
  const worker = new Worker<T>(name, processor, { connection: bullConnection, concurrency });

  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, attempts: job?.attemptsMade, err }, 'job failed');
  });
  // Throttle transport-level errors (e.g. Redis outage) to avoid log floods.
  let lastErr = 0;
  worker.on('error', (err: Error & { code?: string }) => {
    const now = Date.now();
    if (now - lastErr > 10_000) {
      lastErr = now;
      logger.warn({ queue: name, code: err.code ?? err.message }, 'worker transport error');
    }
  });

  onShutdown(async () => {
    await worker.close();
  });
  return worker;
}
