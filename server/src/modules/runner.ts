import { env } from '../lib/env.js';
import { reportLogger } from '../lib/logger.js';
import { moduleConfig } from '../config/index.js';
import { MODULES } from './registry.js';
import { createRunContext } from './run-context.js';
import { toModuleProject } from './project.js';
import { getProjectById, insertCheckResults, type CheckInsert } from '../db/repo.js';
import { markModuleDone } from '../queue/completion.js';
import { aggregateQueue } from '../queue/queues.js';
import type { CheckResult } from '../types/index.js';
import type { ModuleJob } from '../queue/queues.js';
import type { RunContext } from './module.js';

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('module_timeout')), ms));
}

/** Normalize a module result so it can never violate the evidence invariant. */
function toInsert(r: CheckResult): CheckInsert {
  const isNA = r.status === 'not_applicable';
  const hasEvidence = Boolean(r.evidence_url) && Boolean(r.raw_snapshot_ref);
  const status = !isNA && !hasEvidence ? 'inconclusive' : r.status;
  // If we still lack evidence on a non-NA row, demote to not_applicable rather
  // than write a row the DB CHECK constraint would reject.
  const finalStatus = status !== 'not_applicable' && !hasEvidence ? 'not_applicable' : status;
  return {
    module: r.module,
    status: finalStatus,
    confidence: r.confidence,
    claim: r.claim,
    evidenceUrl: finalStatus === 'not_applicable' ? (r.evidence_url || null) : r.evidence_url,
    rawSnapshotRef: finalStatus === 'not_applicable' ? (r.raw_snapshot_ref || null) : r.raw_snapshot_ref,
    checkedAt: new Date(r.checked_at),
  };
}

/**
 * Runs one module job end-to-end: build context, execute under a timeout,
 * persist snapshot-backed CheckResults, then decrement the completion set and
 * trigger aggregation when the battery is done. See docs/architecture.md.
 */
export async function runModuleJob(job: ModuleJob): Promise<void> {
  const { projectId, reportId, reportVersion, module } = job;
  const log = reportLogger(reportId).child({ module });
  const cfg = moduleConfig[module];
  const ctx: RunContext = createRunContext({ reportId, projectId, reportVersion, module });

  let results: CheckResult[] = [];
  try {
    const row = await getProjectById(projectId);
    if (!row) throw new Error('project_not_found');
    const project = toModuleProject(row);

    ctx.emit({ kind: 'info', text: `[${module}] start` });
    results = await Promise.race([MODULES[module].run(project, ctx), timeout(cfg?.timeout_ms ?? 20000)]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'error';
    log.warn({ err }, 'module failed');
    ctx.emit({ kind: 'error', text: `[${module}] ${reason}` });
    const ref = await ctx
      .snapshot('module-error', { reason }, { endpoint: 'internal:error', fetchedAt: new Date().toISOString() })
      .catch(() => `internal://error/${module}`);
    results = [
      {
        module,
        status: 'inconclusive',
        confidence: 'low',
        claim: `Module ${module} did not complete (${reason}); result is inconclusive for this run.`,
        evidence_url: `${env.PUBLIC_BASE_URL}/reports/${projectId}`,
        raw_snapshot_ref: ref,
        checked_at: new Date().toISOString(),
      },
    ];
  }

  await insertCheckResults(reportId, results.map(toInsert));
  ctx.emit({ kind: 'info', text: `[${module}] done · ${results.length} result(s)` });

  const remaining = await markModuleDone(reportId, module);
  log.debug({ remaining }, 'module complete');
  if (remaining === 0) {
    await aggregateQueue.add('aggregate', { reportId });
  }
}
