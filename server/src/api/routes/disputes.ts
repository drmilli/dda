import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { insertDispute } from '../../db/repo.js';
import { rateLimit } from '../ratelimit.js';

const bodySchema = z.object({
  report_id: z.string().uuid(),
  check_id: z.string().uuid().optional(),
  contact: z.string().optional(),
  statement: z.string().min(1),
});

/**
 * Dispute intake (docs/api-reference.md, docs/security-and-legal.md). Public
 * path to contest a published finding; creates a record and notifies review.
 *
 *   POST /api/disputes  { report_id, check_id?, contact?, statement }
 */
export async function registerDisputeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/disputes', { preHandler: rateLimit('disputes') }, async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('report_id and statement are required');
    const id = await insertDispute({
      reportId: parsed.data.report_id,
      checkId: parsed.data.check_id ?? null,
      contact: parsed.data.contact ?? null,
      statement: parsed.data.statement,
    });
    return reply.code(202).send({ dispute_id: id });
  });
}
