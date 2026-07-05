import { env } from './env.js';
import { logger } from './logger.js';
import type { CheckRow } from '../db/repo.js';

/**
 * Writes the human-readable report summary FROM VERIFIED CheckResults ONLY.
 * The LLM is strictly downstream of persistence — it cannot introduce a claim
 * that has no snapshot, and its output is display-only (never drives an X post).
 * If no key is configured, or the model violates the no-intent rule, a
 * deterministic template is used. See docs/architecture.md, docs/modules.md.
 *
 * Provider-agnostic: `LLM_PROVIDER` selects Anthropic (Messages API) or an
 * OpenAI-compatible endpoint (`openai` / `nvidia` — chat/completions). NVIDIA
 * Nemotron runs via the `nvidia` provider against integrate.api.nvidia.com.
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

function baseUrl(): string {
  if (env.LLM_BASE_URL) return env.LLM_BASE_URL.replace(/\/$/, '');
  return env.LLM_PROVIDER === 'nvidia'
    ? 'https://integrate.api.nvidia.com/v1'
    : 'https://api.openai.com/v1';
}

interface Attempt {
  text: string | null;
  retriable: boolean;
}

/** One provider request. Returns {text} on success, or {retriable} on failure. */
async function requestOnce(system: string, user: string, maxTokens: number): Promise<Attempt> {
  if (env.LLM_PROVIDER === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.LLM_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { content?: { text?: string }[] };
      return { text: json.content?.[0]?.text?.trim() ?? null, retriable: false };
    }
    return { text: null, retriable: res.status === 429 || res.status >= 500 };
  }

  // OpenAI-compatible (openai | nvidia): chat/completions, Bearer auth.
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.LLM_API_KEY!}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
    }),
  });
  if (res.ok) {
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: json.choices?.[0]?.message?.content?.trim() ?? null, retriable: false };
  }
  return { text: null, retriable: res.status === 429 || res.status >= 500 };
}

/** Calls the configured provider with transient retry. Returns text or null. */
async function callLlm(system: string, user: string, maxTokens: number): Promise<string | null> {
  if (!env.LLM_API_KEY) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await requestOnce(system, user, maxTokens);
      if (r.text) return r.text;
      if (!r.retriable) {
        logger.warn({ provider: env.LLM_PROVIDER }, 'LLM call failed (non-retryable)');
        return null;
      }
    } catch (err) {
      logger.debug({ err }, 'LLM call error');
    }
    await sleep(500 * 2 ** attempt);
  }
  return null;
}

export async function summarize(mint: string, checks: CheckRow[]): Promise<string> {
  const findings = checks
    .filter((c) => c.status !== 'not_applicable')
    .map((c) => `- [${c.module} ${c.status}/${c.confidence}] ${c.claim}`)
    .join('\n');

  const text = await callLlm(
    SYSTEM,
    `Token mint ${mint}. Verified findings:\n${findings}\n\nWrite the summary.`,
    400,
  );

  if (!text) return deterministicSummary(checks);
  if (BANNED_INTENT.test(text)) {
    logger.warn('LLM summary asserted intent — discarded, using deterministic template');
    return deterministicSummary(checks);
  }
  return text;
}

/** Read-only credential/model check (cheap call). Never touches report data. */
export async function verifyLlm(): Promise<{ provider: string; model: string }> {
  if (!env.LLM_API_KEY) throw new Error('LLM_API_KEY not set');
  const res = await callLlm('', 'Reply with the single word OK.', 8);
  if (res == null) throw new Error(`LLM check failed for ${env.LLM_PROVIDER}/${env.LLM_MODEL}`);
  return { provider: env.LLM_PROVIDER, model: env.LLM_MODEL };
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
