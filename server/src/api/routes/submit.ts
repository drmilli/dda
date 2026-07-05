import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../lib/env.js';
import { resolveMetadata } from '../../lib/metadata.js';
import { upsertProject, nextReportVersion, createReport } from '../../db/repo.js';
import { orchestrateQueue } from '../../queue/queues.js';
import { rateLimit } from '../ratelimit.js';

const bodySchema = z.object({ mint: z.string().min(32).max(44) });

/**
 * Manual submission bypass (docs/api-reference.md). Skips triage and always
 * runs the full battery (discovery_source = 'manual').
 *
 *   POST /api/submit  { mint }
 */
export async function registerSubmitRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/submit', { preHandler: rateLimit('submit') }, async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('mint is required');
    const { mint } = parsed.data;

    const meta = await resolveMetadata(mint);
    const project = await upsertProject({
      mint,
      creator: 'unknown',
      xHandle: meta.twitter ? `@${meta.twitter}` : null,
      githubUrl: meta.github,
      websiteUrl: meta.website,
      launchTs: new Date(),
      discoverySource: 'manual',
    });
    const version = await nextReportVersion(project.id);
    const report = await createReport(project.id, version);
    await orchestrateQueue.add('orchestrate', {
      projectId: project.id,
      reportId: report.id,
      reportVersion: report.version,
    });

    return reply.code(202).send({
      project_id: project.id,
      report_id: report.id,
      version: report.version,
      stream_url: `${env.PUBLIC_BASE_URL}/api/stream/${report.id}`,
    });
  });
}
