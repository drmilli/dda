import { buildServer } from '../api/server.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { installSignalHandlers, onShutdown } from '../lib/shutdown.js';
import { closeDb } from '../db/client.js';
import { connection } from '../queue/connection.js';

installSignalHandlers();

const app = await buildServer();
onShutdown(async () => {
  await app.close();
  await closeDb();
  await connection.quit();
});

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'web/API listening');
} catch (err) {
  logger.error(err, 'web failed to start');
  process.exit(1);
}
