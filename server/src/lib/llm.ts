import { env } from './env.js';
import { logger } from './logger.js';
import type { CheckRow } from '../db/repo.js';

/**
 * Writes the human-readable report summary FROM VERIFIED CheckResults ONLY.
 * The LLM is strictly downstream of persistence — it cannot introduce a claim
 * that has no snapshot, and its output is display-only (never drives an X post).
 * If no key is configured, or the model violates the no-intent rule, a
 * deterministic template is used. See docs/architecture.md, docs/modules.md.
 */
const SYSTEM = [
  'You summarize automated on-chain due-diligence results for a token.',
  'Use ONLY the findings provided. Do NOT invent or infer anything not stated.',
  'State falsifiable facts, never intent or motive. Never use words like "scam",',
  '"rug", "fraud", or accuse anyone. Be neutral and specific. 2–4 sentences.',
].join(' ');

// Defense-in-depth: enforce the no-intent rule on the OUTPUT, not just the prompt.
const BANNED_INTENT = /\b(scam|rug|rugpull|fraud|fraudulent|honeypot|ponzi|thief|steal|stole)\b/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AnthropicMessage {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/** Single Anthropic Messages call with transient retry. Returns text or null. */
async function anthropic(body: AnthropicMessage): Promise<string | null> {
  if (!env.LLM_API_KEY) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.LLM_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as { content?: { text?: string }[] };
        return json.content?.[0]?.text?.trim() ?? null;
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      logger.warn({ status: res.status }, 'LLM call failed (non-retryable)');
      return null;
    } catch (err) {
      logger.debug({ err }, 'LLM call error');
      await sleep(500 * 2 ** attempt);
    }
  }
  return null;
}

export async function summarize(mint: string, checks: CheckRow[]): Promise<string> {
  const findings = checks
    .filter((c) => c.status !== 'not_applicable')
    .map((c) => `- [${c.module} ${c.status}/${c.confidence}] ${c.claim}`)
    .join('\n');

  const text = await anthropic({
    model: env.LLM_MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [
      { role: 'user', content: `Token mint ${mint}. Verified findings:\n${findings}\n\nWrite the summary.` },
    ],
  });

  if (!text) return deterministicSummary(checks);
  if (BANNED_INTENT.test(text)) {
    logger.warn('LLM summary asserted intent — discarded, using deterministic template');
    return deterministicSummary(checks);
  }
  return text;
}

/** Read-only credential/model check (cheap call). Never touches report data. */
export async function verifyLlm(): Promise<{ model: string }> {
  if (!env.LLM_API_KEY) throw new Error('LLM_API_KEY not set');
  const res = await anthropic({
    model: env.LLM_MODEL,
    max_tokens: 8,
    messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
  });
  if (res == null) throw new Error(`LLM check failed for model ${env.LLM_MODEL}`);
  return { model: env.LLM_MODEL };
}

function deterministicSummary(checks: CheckRow[]): string {
  const flagged = checks.filter((c) => c.status === 'flagged');
  const review = checks.filter((c) => c.status === 'inconclusive');
  if (flagged.length === 0 && review.length === 0) {
    return 'No discrepancies were found on the objective checks that completed. This is a point-in-time snapshot; re-verify each claim independently.';
  }
  const parts: string[] = [];
  if (flagged.length) parts.push(`${flagged.length} objective flag(s): ${flagged.map((c) => c.claim).join(' ')}`);
  if (review.length) parts.push(`${review.length} check(s) need manual review.`);
  parts.push('These are falsifiable facts, not conclusions about intent. Re-verify each independently.');
  return parts.join(' ');
}
