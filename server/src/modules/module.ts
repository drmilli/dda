import type { CheckResult, ModuleId, StreamLine } from '../types/index.js';

/**
 * Module contract (docs/modules.md). Modules produce ALL evidence; the LLM
 * produces none. `ctx.snapshot()` is the enforcement point for invariant #1 —
 * a non-N/A CheckResult must carry a snapshot ref + evidence URL.
 */
export interface Project {
  id: string;
  mint: string;
  creator: string;
  xHandle: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  launchTs: string; // ISO 8601
}

export interface SnapshotMeta {
  endpoint: string;
  params?: Record<string, unknown>;
  httpStatus?: number;
  fetchedAt: string; // ISO 8601
}

export interface RateBudget {
  requestsRemaining(): number;
  spend(n?: number): void;
}

export interface RunContext {
  reportId: string;
  projectId: string;
  reportVersion: number;
  module: ModuleId;
  budget: RateBudget;
  /** Persist raw evidence to Cloudinary; returns the raw_snapshot_ref (secure_url). */
  snapshot(name: string, raw: unknown, meta: SnapshotMeta): Promise<string>;
  /** Emit a live terminal line (deterministic output only — never LLM text). */
  emit(line: Pick<StreamLine, 'text' | 'kind'>): void;
}

export interface Module {
  id: ModuleId;
  /** Whether this module has anything to check for the given project. */
  applies(project: Project): boolean;
  /** Run deterministic checks; return one or more CheckResults. */
  run(project: Project, ctx: RunContext): Promise<CheckResult[]>;
}
