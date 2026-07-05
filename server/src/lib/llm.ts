import { env } from './env.js';
import type { CheckRow } from '../db/repo.js';

/**
 * Writes the human-readable report summary FROM VERIFIED CheckResults ONLY.
 * The LLM is strictly downstream of persistence — it cannot introduce a claim
 * that has no snapshot. If no key is configured, a deterministic template is
 * used so the pipeline still completes. See docs/architecture.md, docs/modules.md.
 */
const SYSTEM = [
  'You summarize automated on-chain due-diligence results for a token.',
  'Use ONLY the findings provided. Do NOT invent or infer anything not stated.',
  'State falsifiable facts, never intent or motive. Never use words like "scam",',
  '"rug", "fraud", or accuse anyone. Be neutral and specific. 2–4 sentences.',
].join(' ');

export async function summarize(mint: string, checks: CheckRow[]): Promise<string> {
  const findings = checks
    .filter((c) => c.status !== 'not_applicable')
    .map((c) => `- [${c.module} ${c.status}/${c.confidence}] ${c.claim}`)
    .join('\n');

  if (!env.LLM_API_KEY) return deterministicSummary(checks);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.LLM_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Token mint ${mint}. Verified findings:\n${findings}\n\nWrite the summary.`,
          },
        ],
      }),
    });
    if (!res.ok) return deterministicSummary(checks);
    const json = (await res.json()) as { content?: { text?: string }[] };
    return json.content?.[0]?.text?.trim() || deterministicSummary(checks);
  } catch {
    return deterministicSummary(checks);
  }
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
