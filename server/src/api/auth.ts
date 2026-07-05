import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../lib/env.js';

/**
 * Bearer-token guard for admin endpoints. Fails CLOSED: if ADMIN_TOKEN is not
 * configured, admin routes are unavailable rather than open. Constant-time
 * comparison to avoid token-length/lexical timing leaks.
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.ADMIN_TOKEN) {
    return reply.serviceUnavailable('admin auth not configured (set ADMIN_TOKEN)');
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(env.ADMIN_TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return reply.unauthorized('invalid admin token');
  }
}
