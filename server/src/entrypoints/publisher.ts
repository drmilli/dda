import { QUEUE_NAMES } from '../queue/queues.js';
import { startWorker } from '../queue/worker.js';
import { installSignalHandlers } from '../lib/shutdown.js';
import { runPublish } from '../publisher/index.js';
import { logger } from '../lib/logger.js';
import type { PublishJob } from '../queue/queues.js';

installSignalHandlers();
// Concurrency 1: the publisher is globally rate-limited to the daily X ceiling.
startWorker<PublishJob>(QUEUE_NAMES.publish, async (job) => runPublish(job.data), 1);
logger.info('publisher worker started');
