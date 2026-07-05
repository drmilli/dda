import { logger } from './logger.js';

type Handler = () => Promise<void> | void;

const handlers: Handler[] = [];
let shuttingDown = false;

/** Register a cleanup handler run on SIGTERM/SIGINT (LIFO order). */
export function onShutdown(handler: Handler): void {
  handlers.push(handler);
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down…');
  const timer = setTimeout(() => {
    logger.error('shutdown timed out — forcing exit');
    process.exit(1);
  }, 15_000);
  timer.unref();

  for (const h of handlers.reverse()) {
    try {
      await h();
    } catch (err) {
      logger.error({ err }, 'shutdown handler failed');
    }
  }
  clearTimeout(timer);
  logger.info('shutdown complete');
  process.exit(0);
}

/** Install signal + fatal-error handlers. Call once per process. */
export function installSignalHandlers(): void {
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException — exiting');
    void shutdown('uncaughtException');
  });
}
