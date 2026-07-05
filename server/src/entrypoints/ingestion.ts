import { startIngestion } from '../ingestion/index.js';
import { installSignalHandlers } from '../lib/shutdown.js';
import { logger } from '../lib/logger.js';

installSignalHandlers();
startIngestion().catch((err) => {
  logger.error(err, 'ingestion crashed');
  process.exit(1);
});
