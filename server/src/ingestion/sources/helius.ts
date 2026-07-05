import type { LaunchEvent } from '../../types/index.js';
import type { IngestionSource } from './source.js';

/**
 * Preferred source — Helius webhooks / enhanced transactions filtered to the
 * Pump.fun program(s). Lowest ops burden. See docs/ingestion-and-triage.md.
 */
export const heliusSource: IngestionSource = {
  name: 'helius',
  async start(_onEvent: (e: LaunchEvent) => Promise<void>) {
    // TODO: register/consume Helius webhook; decode new-mint + graduation events;
    // normalize to LaunchEvent and call onEvent().
    throw new Error('helius ingestion not implemented');
  },
  async stop() {
    /* TODO */
  },
};
