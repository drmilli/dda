import { QUEUE_NAMES } from '../queue/queues.js';
import { startWorker } from '../queue/worker.js';
import { installSignalHandlers } from '../lib/shutdown.js';
import { runTriage } from '../triage/index.js';
import { logger } from '../lib/logger.js';
import type { TriageJob } from '../queue/queues.js';

installSignalHandlers();
startWorker<TriageJob>(QUEUE_NAMES.triage, async (job) => runTriage(job.data));
logger.info('triage worker started');
