import { QUEUE_NAMES } from '../queue/queues.js';
import { startWorker } from '../queue/worker.js';
import { installSignalHandlers } from '../lib/shutdown.js';
import { runOrchestrate } from '../orchestrator/index.js';
import { logger } from '../lib/logger.js';
import type { OrchestrateJob } from '../queue/queues.js';

installSignalHandlers();
startWorker<OrchestrateJob>(QUEUE_NAMES.orchestrate, async (job) => runOrchestrate(job.data));
logger.info('orchestrator worker started');
