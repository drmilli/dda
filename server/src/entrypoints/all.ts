import { installSignalHandlers } from '../lib/shutdown.js';
import { startWorker } from '../queue/worker.js';
import { QUEUE_NAMES } from '../queue/queues.js';
import { moduleConfig } from '../config/index.js';
import { ALL_MODULE_IDS } from '../modules/registry.js';
import { runTriage } from '../triage/index.js';
import { runOrchestrate } from '../orchestrator/index.js';
import { runModuleJob } from '../modules/runner.js';
import { runAggregate } from '../aggregator/index.js';
import { runPublish } from '../publisher/index.js';
import { logger } from '../lib/logger.js';
import type {
  TriageJob,
  OrchestrateJob,
  ModuleJob,
  AggregateJob,
  PublishJob,
} from '../queue/queues.js';

/**
 * Combined worker process — runs every stage in one Node process. Cheapest
 * Render topology (one background worker). Split into per-role services later
 * for independent scaling; the code is identical.
 */
installSignalHandlers();

startWorker<TriageJob>(QUEUE_NAMES.triage, async (job) => runTriage(job.data));
startWorker<OrchestrateJob>(QUEUE_NAMES.orchestrate, async (job) => runOrchestrate(job.data));
for (const id of ALL_MODULE_IDS) {
  startWorker<ModuleJob>(QUEUE_NAMES.module(id), async (job) => runModuleJob(job.data), moduleConfig[id]?.concurrency ?? 4);
}
startWorker<AggregateJob>(QUEUE_NAMES.aggregate, async (job) => runAggregate(job.data));
// Concurrency 1: publisher is globally rate-limited to the daily X ceiling.
startWorker<PublishJob>(QUEUE_NAMES.publish, async (job) => runPublish(job.data), 1);

logger.info({ modules: ALL_MODULE_IDS }, 'all workers started (combined process)');
