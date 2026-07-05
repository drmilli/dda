import { publishQueue } from '../queue/queues.js';
import { logger } from '../lib/logger.js';
import { getReportById, getChecksByReport, getProjectById, finalizeReport } from '../db/repo.js';
import { summarize } from '../lib/llm.js';
import { publishStreamDone } from '../events/bus.js';
import type { AggregateJob } from '../queue/queues.js';

/**
 * Aggregator. When a battery completes, finalize the report, write the LLM
 * summary FROM STORED CheckResults ONLY, mark it complete, signal the live
 * stream, and hand off to the publisher. The LLM is strictly downstream of
 * persistence. See docs/architecture.md.
 */
export async function runAggregate(job: AggregateJob): Promise<void> {
  const { reportId } = job;
  const report = await getReportById(reportId);
  if (!report) {
    logger.error({ reportId }, 'aggregate: report not found');
    return;
  }
  const project = await getProjectById(report.projectId);
  const checks = await getChecksByReport(reportId);

  const summary = await summarize(project?.mint ?? '', checks);
  await finalizeReport(reportId, summary);
  await publishStreamDone(reportId, 'complete');
  await publishQueue.add('publish', { reportId });

  logger.info({ reportId, checks: checks.length }, 'report finalized → queued for publish');
}
