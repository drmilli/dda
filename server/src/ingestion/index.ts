import { logger } from '../lib/logger.js';

/**
 * Pull-based ingestion entrypoint (Geyser/RPC log subscription). Not yet wired —
 * the live path is the push webhook `POST /ingest/helius` handled by the web
 * service. This process idles so it can be deployed now and filled in later.
 * See docs/ingestion-and-triage.md.
 */
export async function startIngestion(): Promise<void> {
  logger.warn(
    'pull ingestion not configured — using webhook path (POST /ingest/helius). Idling.',
  );
  // Keep the process alive without busy-waiting.
  await new Promise<void>(() => {});
}
