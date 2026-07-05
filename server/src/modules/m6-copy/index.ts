import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';
import { resolveMetadata } from '../../lib/metadata.js';

const GENERIC = [
  'in the world of', 'revolutionary', 'cutting-edge', 'seamlessly', "in today's",
  'unlock the power', 'game-changer', 'the future of', 'leverage', 'empower',
  'next generation', 'state-of-the-art', 'redefine', 'ecosystem',
];

/**
 * Module 6 — AI-Generated Copy Heuristic (low confidence, SIGNAL ONLY).
 * Never a basis for a posted accusation; always inconclusive + low confidence.
 * See docs/modules.md#module-6.
 */
export const m6Copy: Module = {
  id: 'M6',
  applies: () => true,

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const meta = await resolveMetadata(project.mint);
    const text = (meta.description ?? '').trim();

    if (text.length < 40) {
      return [{
        module: 'M6', status: 'not_applicable', confidence: 'low',
        claim: 'Not enough project copy to run a stylometric signal.',
        evidence_url: '', raw_snapshot_ref: '', checked_at: now(),
      }];
    }

    const chars = text.length;
    const emDashes = (text.match(/—/g) ?? []).length;
    const emDashPer1k = (emDashes / chars) * 1000;
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / (lengths.length || 1);
    const uniformity = mean > 0 ? 1 - Math.min(1, Math.sqrt(variance) / mean) : 0;
    const genericHits = GENERIC.filter((g) => text.toLowerCase().includes(g)).length;

    // Composite 0..1 signal — deliberately soft.
    const signal = Math.min(
      1,
      emDashPer1k / 6 * 0.4 + uniformity * 0.3 + Math.min(1, genericHits / 4) * 0.3,
    );
    const metrics = { chars, emDashPer1k: +emDashPer1k.toFixed(2), uniformity: +uniformity.toFixed(2), genericHits, signal: +signal.toFixed(2) };
    ctx.emit({ kind: 'info', text: `copy stylometry: signal ${metrics.signal} (em-dash ${metrics.emDashPer1k}/1k, generic ${genericHits})` });

    const ref = await ctx.snapshot('stylometry', { text, metrics }, {
      endpoint: 'internal:stylometry', fetchedAt: now(),
    });
    return [{
      module: 'M6', status: 'inconclusive', confidence: 'low',
      claim: `Weak stylometric signal (${metrics.signal.toFixed(2)}/1.0) that the project copy may be AI-generated — em-dash density ${metrics.emDashPer1k}/1k chars, ${genericHits} generic phrases. Non-definitive; not a basis for any accusation.`,
      evidence_url: meta.website ?? `https://pump.fun/${project.mint}`,
      raw_snapshot_ref: ref, checked_at: now(),
    }];
  },
};
