import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../lib/env.js';
import {
  listReviewQueue,
  getReviewItem,
  resolveReviewItem,
  getReportById,
  getProjectById,
  insertPublishEvent,
} from '../../db/repo.js';
import { postToX } from '../../publisher/x-client.js';
import { requireAdmin } from '../auth.js';

const actionSchema = z.object({
  action: z.enum(['approve', 'edit', 'reject']),
  text: z.string().optional(),
  approver: z.string().default('admin'),
});

/**
 * Admin review queue (docs/api-reference.md, docs/publisher.md). Human gate for
 * person-naming / intent / M5–M6-conclusion findings.
 *
 * NOTE: add real authentication before exposing beyond localhost.
 *   GET  /api/admin/review-queue
 *   POST /api/admin/review/:findingId  { action, text?, approver? }
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/review-queue', { preHandler: requireAdmin }, async () => {
    return listReviewQueue();
  });

  app.post<{ Params: { findingId: string } }>(
    '/api/admin/review/:findingId',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = actionSchema.safeParse(req.body);
      if (!parsed.success) return reply.badRequest('invalid action');
      const item = await getReviewItem(req.params.findingId);
      if (!item) return reply.notFound();
      if (item.status !== 'pending') return reply.conflict('already resolved');

      if (parsed.data.action === 'reject') {
        await resolveReviewItem(item.id, 'rejected', parsed.data.approver);
        return { status: 'rejected' };
      }

      // approve / edit → post to X and record the publish event with the approver.
      const report = await getReportById(item.reportId);
      const project = report ? await getProjectById(report.projectId) : undefined;
      if (!report || !project) return reply.notFound();

      const url = `${env.PUBLIC_BASE_URL}/reports/${project.id}/v/${report.version}`;
      const text = (parsed.data.text ?? item.proposedText).slice(0, 240);
      const res = await postToX(text, url);
      await insertPublishEvent({
        reportId: report.id,
        tier: 'human',
        channel: 'x',
        xPostId: res.xPostId,
        approver: parsed.data.approver,
        payload: `${text} ${url}`,
      });
      await resolveReviewItem(item.id, 'approved', parsed.data.approver);
      return { status: 'approved', dryRun: res.dryRun };
    },
  );
}
