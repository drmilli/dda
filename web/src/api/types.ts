/**
 * API-facing types. Mirror of the backend's domain contract
 * (dda-server/src/types/index.ts). Keep in sync until we extract a shared
 * package. See docs/data-model.md and docs/api-reference.md.
 */
export type ModuleId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
export type CheckStatus = 'confirmed' | 'flagged' | 'inconclusive' | 'not_applicable';
export type Confidence = 'high' | 'medium' | 'low';
export type DiscoverySource = 'triage' | 'manual';
export type ReportStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface Project {
  id: string;
  mint: string;
  x_handle: string | null;
  github_url: string | null;
  website_url: string | null;
  launch_ts: string;
  discovery_source: DiscoverySource;
}

export interface Check {
  id: string;
  module: ModuleId;
  status: CheckStatus;
  confidence: Confidence;
  claim: string;
  evidence_url: string;
  raw_snapshot_ref: string;
  checked_at: string;
}

export interface Report {
  id: string;
  version: number;
  status: ReportStatus;
  summary: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ReportResponse {
  project: Project;
  report: Report;
  checks: Check[];
}

/** A held finding awaiting human approval (admin review queue). */
export interface ReviewItem {
  id: string;
  reportId: string;
  checkId: string | null;
  module: ModuleId;
  tier: 'auto' | 'auto_hedged' | 'human';
  proposedText: string;
  status: 'pending' | 'approved' | 'rejected';
  approver: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** SSE payload on the live stream (docs/terminal-site.md). */
export interface StreamLine {
  report_id: string;
  module: ModuleId;
  seq: number;
  text: string;
  kind: 'info' | 'flag' | 'pass' | 'error';
  ts: string;
}
