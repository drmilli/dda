import { QUEUE_NAMES } from '../queue/queues.js';
import { startWorker } from '../queue/worker.js';
import { installSignalHandlers } from '../lib/shutdown.js';
import { runAggregate } from '../aggregator/index.js';
import { logger } from '../lib/logger.js';
import type { AggregateJob } from '../queue/queues.js';

installSignalHandlers();
startWorker<AggregateJob>(QUEUE_NAMES.aggregate, async (job) => runAggregate(job.data));
logger.info('aggregator worker started');
