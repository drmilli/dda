import { triageConfig } from '../config/index.js';
import { getMintInfo } from '../lib/solana.js';
import { getPriceUsd, marketCapUsd } from '../lib/price.js';
import type { LaunchEvent } from '../types/index.js';

export interface StageAResult {
  pass: boolean;
  reason?: string;
  borderline: boolean; // within recheck band → re-queue rather than drop permanently
  signals: { ageHours: number; marketCapUsd: number | null };
}

/**
 * Stage A — Eligibility. Pure on-chain reads (no paid third-party API):
 *   age ≥ min_age_hours  AND  market_cap ≥ min_market_cap_usd
 * See docs/ingestion-and-triage.md#stage-a.
 */
export async function stageA(event: LaunchEvent): Promise<StageAResult> {
  const cfg = triageConfig.stage_a;
  const ageHours = (Date.now() - new Date(event.launch_ts).getTime()) / 3_600_000;

  if (ageHours < cfg.min_age_hours) {
    return {
      pass: false,
      reason: 'age_below_min',
      borderline: true,
      signals: { ageHours, marketCapUsd: null },
    };
  }

  let mcap: number | null;
  try {
    const mint = await getMintInfo(event.mint);
    const price = await getPriceUsd(event.mint);
    mcap = marketCapUsd(price, mint.uiSupply);
  } catch {
    return {
      pass: false,
      reason: 'onchain_read_failed',
      borderline: true,
      signals: { ageHours, marketCapUsd: null },
    };
  }

  if (mcap == null) {
    return {
      pass: false,
      reason: 'unpriced',
      borderline: true,
      signals: { ageHours, marketCapUsd: null },
    };
  }

  if (mcap < cfg.min_market_cap_usd) {
    const band = cfg.min_market_cap_usd * (1 - cfg.borderline_mcap_band_pct / 100);
    return {
      pass: false,
      reason: 'mcap_below_min',
      borderline: mcap >= band,
      signals: { ageHours, marketCapUsd: mcap },
    };
  }

  return { pass: true, borderline: false, signals: { ageHours, marketCapUsd: mcap } };
}
