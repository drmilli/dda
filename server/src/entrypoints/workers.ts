import { QUEUE_NAMES } from '../queue/queues.js';
import { startWorker } from '../queue/worker.js';
import { installSignalHandlers } from '../lib/shutdown.js';
import { moduleConfig } from '../config/index.js';
import { ALL_MODULE_IDS } from '../modules/registry.js';
import { runModuleJob } from '../modules/runner.js';
import { logger } from '../lib/logger.js';
import type { ModuleJob } from '../queue/queues.js';

/**
 * One BullMQ Worker per module, each with its own concurrency from
 * config/modules.json — per-module rate limits + failure isolation.
 */
installSignalHandlers();
for (const id of ALL_MODULE_IDS) {
  const cfg = moduleConfig[id];
  startWorker<ModuleJob>(QUEUE_NAMES.module(id), async (job) => runModuleJob(job.data), cfg?.concurrency ?? 4);
}
logger.info({ modules: ALL_MODULE_IDS }, 'module workers started');
