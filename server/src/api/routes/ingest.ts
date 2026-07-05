import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../../lib/env.js';
import { triageQueue } from '../../queue/queues.js';
import { rateLimit } from '../ratelimit.js';
import { logger } from '../../lib/logger.js';
import type { LaunchEvent } from '../../types/index.js';

/**
 * Ingestion webhook. Normalizes inbound launch/graduation events into
 * LaunchEvents and enqueues triage (deduped on mint+trigger). Accepts either a
 * simple normalized body or a Helius enhanced-transaction array (best-effort).
 * See docs/ingestion-and-triage.md.
 *
 *   POST /ingest/helius   (Authorization: Bearer <HELIUS_WEBHOOK_SECRET>)
 */
const normalized = z.object({
  mint: z.string().min(32).max(44),
  creator: z.string().optional(),
  launch_ts: z.string().optional(),
  trigger: z.enum(['new_mint', 'graduation']).optional(),
});

/** Verify the webhook shared secret (fails closed only if a secret is set). */
async function verifyWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.HELIUS_WEBHOOK_SECRET) return; // no secret configured → accept (dev)
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token !== env.HELIUS_WEBHOOK_SECRET) return reply.unauthorized('bad webhook secret');
}

/** Best-effort extraction of (mint, creator) from a Helius enhanced tx. */
function fromHeliusTx(tx: unknown): { mint: string; creator?: string } | null {
  const t = tx as {
    tokenTransfers?: { mint?: string }[];
    feePayer?: string;
    accountData?: { account?: string }[];
  };
  const mint = t.tokenTransfers?.find((x) => x.mint)?.mint;
  if (!mint) return null;
  return { mint, creator: t.feePayer };
}

async function enqueue(event: LaunchEvent): Promise<void> {
  await triageQueue.add('launch', { event }, { jobId: `${event.mint}:${event.trigger}` });
}

export async function registerIngestRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/ingest/helius',
    { preHandler: [verifyWebhook, rateLimit('ingest')] },
    async (req, reply) => {
      const now = new Date().toISOString();

      // Normalized single-event body.
      const single = normalized.safeParse(req.body);
      if (single.success) {
        const d = single.data;
        await enqueue({
          mint: d.mint,
          creator: d.creator ?? 'unknown',
          launch_ts: d.launch_ts ?? now,
          source: 'helius',
          initial_liquidity: null,
          trigger: d.trigger ?? 'new_mint',
        });
        return reply.code(202).send({ queued: 1, mint: d.mint });
      }

      // Helius enhanced-transaction array.
      if (Array.isArray(req.body)) {
        let queued = 0;
        for (const tx of req.body) {
          const parsed = fromHeliusTx(tx);
          if (!parsed) continue;
          await enqueue({
            mint: parsed.mint,
            creator: parsed.creator ?? 'unknown',
            launch_ts: now,
            source: 'helius',
            initial_liquidity: null,
            trigger: 'new_mint',
          });
          queued += 1;
        }
        logger.debug({ queued }, 'helius batch ingested');
        return reply.code(202).send({ queued });
      }

      return reply.badRequest('mint or a Helius transaction array is required');
    },
  );
}
