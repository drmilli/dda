/**
 * Shared domain types. These mirror the contracts in docs/data-model.md and
 * docs/modules.md. The React front end keeps its own copy of the API-facing
 * subset (see web/src/api/types.ts) — keep them in sync until we extract a
 * shared package.
 */

// ── Enums ───────────────────────────────────────────────────────────────
export type ModuleId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';

export type CheckStatus =
  | 'confirmed'
  | 'flagged'
  | 'inconclusive'
  | 'not_applicable';

export type Confidence = 'high' | 'medium' | 'low';

export type DiscoverySource = 'triage' | 'manual';

export type PublishTier = 'auto' | 'auto_hedged' | 'human';

// ── Ingestion ───────────────────────────────────────────────────────────
export interface LaunchEvent {
  mint: string;
  creator: string;
  launch_ts: string; // ISO 8601
  source: 'helius' | 'geyser' | 'rpc';
  initial_liquidity: number | null; // SOL, if known at ingest
  trigger: 'new_mint' | 'graduation';
}

// ── Module output ───────────────────────────────────────────────────────
export interface CheckResult {
  module: ModuleId;
  status: CheckStatus;
  confidence: Confidence;
  claim: string; // the falsifiable statement
  evidence_url: string; // where anyone can re-verify
  raw_snapshot_ref: string; // Cloudinary secure_url, captured at check time
  checked_at: string; // ISO 8601
}

// ── Live terminal stream ────────────────────────────────────────────────
export interface StreamLine {
  report_id: string;
  module: ModuleId;
  seq: number; // ordering within a report
  text: string; // pre-rendered deterministic line
  kind: 'info' | 'flag' | 'pass' | 'error';
  ts: string; // ISO 8601
}
