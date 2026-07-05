import { triageConfig } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { stageA } from './stage-a.js';
import { stageB } from './stage-b.js';
import { upsertProject, createReport, nextReportVersion, insertTriageLog } from '../db/repo.js';
import { orchestrateQueue, triageQueue } from '../queue/queues.js';
import type { TriageJob } from '../queue/queues.js';

export interface TriageOutcome {
  qualified: boolean;
  droppedAt?: 'A' | 'B';
  reason?: string;
}

/**
 * Triage processor: Stage A (eligibility) then Stage B (tech-project),
 * cheapest-first. Drops → triage_log (+ borderline re-queue); qualified →
 * upsert project + new report version + enqueue orchestrator.
 * See docs/ingestion-and-triage.md.
 */
export async function runTriage(job: TriageJob): Promise<TriageOutcome> {
  const { event } = job;

  const a = await stageA(event);
  if (!a.pass) {
    await insertTriageLog(event.mint, 'A', a.reason ?? 'stage_a', a.signals);
    await maybeRequeue(event.mint, event.launch_ts, a.borderline, job);
    logger.debug({ mint: event.mint, reason: a.reason }, 'dropped at Stage A');
    return { qualified: false, droppedAt: 'A', reason: a.reason };
  }

  const b = await stageB(event);
  if (!b.pass) {
    await insertTriageLog(event.mint, 'B', `tech_score_${b.score}_of_${b.threshold}`, {
      ...b.signals,
      configVersion: b.configVersion,
    });
    logger.debug({ mint: event.mint, score: b.score }, 'dropped at Stage B');
    return { qualified: false, droppedAt: 'B', reason: `tech_score_${b.score}_of_${b.threshold}` };
  }

  // Qualified — create the project + a new report version and fan out.
  const project = await upsertProject({
    mint: event.mint,
    creator: event.creator,
    xHandle: b.metadata.twitter ? `@${b.metadata.twitter}` : null,
    githubUrl: b.metadata.github,
    websiteUrl: b.metadata.website,
    launchTs: new Date(event.launch_ts),
    discoverySource: 'triage',
  });
  const version = await nextReportVersion(project.id);
  const report = await createReport(project.id, version);
  await orchestrateQueue.add('orchestrate', {
    projectId: project.id,
    reportId: report.id,
    reportVersion: report.version,
  });

  logger.info({ mint: event.mint, reportId: report.id }, 'qualified target → orchestrating');
  return { qualified: true };
}

/** Re-evaluate borderline / too-young tokens on a timer within the recheck window. */
async function maybeRequeue(
  mint: string,
  launchTs: string,
  borderline: boolean,
  job: TriageJob,
): Promise<void> {
  if (!borderline) return;
  const cfg = triageConfig.stage_a;
  const ageHours = (Date.now() - new Date(launchTs).getTime()) / 3_600_000;
  if (ageHours >= cfg.recheck_window_hours) return; // aged out — drop permanently
  await triageQueue.add('launch', job, {
    delay: cfg.recheck_interval_minutes * 60_000,
    jobId: `${mint}:${job.event.trigger}:retry:${Date.now()}`,
  });
}
