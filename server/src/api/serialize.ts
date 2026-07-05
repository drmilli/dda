import type { CheckRow, ProjectRow, ReportRow } from '../db/repo.js';

/** Maps DB rows into the public API shape consumed by the front end. */
export function serializeReport(project: ProjectRow, report: ReportRow, checks: CheckRow[]) {
  return {
    project: {
      id: project.id,
      mint: project.mint,
      x_handle: project.xHandle,
      github_url: project.githubUrl,
      website_url: project.websiteUrl,
      launch_ts: project.launchTs.toISOString(),
      discovery_source: project.discoverySource,
    },
    report: {
      id: report.id,
      version: report.version,
      status: report.status,
      summary: report.summary,
      started_at: report.startedAt.toISOString(),
      completed_at: report.completedAt ? report.completedAt.toISOString() : null,
    },
    checks: checks.map((c) => ({
      id: c.id,
      module: c.module,
      status: c.status,
      confidence: c.confidence,
      claim: c.claim,
      evidence_url: c.evidenceUrl ?? '',
      raw_snapshot_ref: c.rawSnapshotRef ?? '',
      checked_at: c.checkedAt.toISOString(),
    })),
  };
}
