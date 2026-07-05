import { moduleQueue, aggregateQueue } from '../queue/queues.js';
import { MODULES, ALL_MODULE_IDS } from '../modules/registry.js';
import { seedRemaining } from '../queue/completion.js';
import { setReportStatus, getProjectById } from '../db/repo.js';
import { logger } from '../lib/logger.js';
import { toModuleProject } from '../modules/project.js';
import type { OrchestrateJob } from '../queue/queues.js';

/**
 * Orchestrator. On a qualified target, fans out one module job per applicable
 * module. Each module runs on its own queue with independent rate limits, so a
 * stall in one never blocks the others. See docs/architecture.md.
 */
export async function runOrchestrate(job: OrchestrateJob): Promise<void> {
  const { projectId, reportId, reportVersion } = job;

  const row = await getProjectById(projectId);
  if (!row) {
    logger.error({ projectId }, 'orchestrate: project not found');
    return;
  }
  const project = toModuleProject(row);

  const applicable = ALL_MODULE_IDS.filter((id) => MODULES[id].applies(project));
  await setReportStatus(reportId, 'running');

  if (applicable.length === 0) {
    await aggregateQueue.add('aggregate', { reportId });
    return;
  }

  await seedRemaining(reportId, applicable);
  await Promise.all(
    applicable.map((module) =>
      moduleQueue(module).add('check', { projectId, reportId, reportVersion, module }),
    ),
  );

  logger.info({ reportId, modules: applicable }, 'battery fanned out');
}
