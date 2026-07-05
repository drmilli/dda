import type { LaunchEvent } from '../../types/index.js';

/**
 * Pluggable ingestion source (docs/ingestion-and-triage.md). Each source
 * normalizes its feed into LaunchEvents and hands them to `onEvent`.
 */
export interface IngestionSource {
  name: 'helius' | 'geyser' | 'rpc';
  start(onEvent: (event: LaunchEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
