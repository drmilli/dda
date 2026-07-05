import pino from 'pino';
import { env } from './env.js';

/**
 * Base pino logger. (No pino-pretty transport — keep zero optional deps; pipe
 * through `pino-pretty` in the shell during dev if you want colorized output.)
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
});

/** Child logger scoped to a battery — keyed by report_id per docs/infrastructure.md. */
export const reportLogger = (reportId: string) => logger.child({ reportId });
