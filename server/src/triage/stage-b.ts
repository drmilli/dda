import { techProjectConfig } from '../config/index.js';
import { resolveMetadata, type TokenMetadata } from '../lib/metadata.js';
import type { LaunchEvent } from '../types/index.js';

export interface StageBResult {
  pass: boolean;
  score: number;
  threshold: number;
  configVersion: number;
  metadata: TokenMetadata;
  signals: Record<string, unknown>;
}

/**
 * Stage B — Tech-project classification. Scores cheap launch-metadata signals
 * against the versioned tech-project config artifact. See
 * docs/ingestion-and-triage.md#stage-b and docs/configuration.md.
 */
export async function stageB(event: LaunchEvent): Promise<StageBResult> {
  const cfg = techProjectConfig;
  const meta = await resolveMetadata(event.mint);
  const text = `${meta.name ?? ''} ${meta.description ?? ''}`.toLowerCase();

  let score = 0;
  const signals: Record<string, unknown> = {};

  for (const sig of cfg.signals) {
    if (sig.key === 'has_github') {
      const hit = Boolean(meta.github);
      signals.has_github = hit;
      if (hit) score += sig.weight;
    } else if (sig.key === 'has_website') {
      const excluded = (sig.exclude ?? []).some((d) => (meta.website ?? '').includes(d));
      const hit = Boolean(meta.website) && !excluded;
      signals.has_website = hit;
      if (hit) score += sig.weight;
    } else if (sig.key === 'tech_language') {
      const terms = sig.terms ?? [];
      const hits = terms.filter((term) => text.includes(term.toLowerCase())).length;
      const counted = sig.cap ? Math.min(hits, sig.cap) : hits;
      signals.tech_language = { hits, counted };
      score += sig.per_hit ? counted * sig.weight : hits > 0 ? sig.weight : 0;
    }
  }

  return {
    pass: score >= cfg.pass_threshold,
    score,
    threshold: cfg.pass_threshold,
    configVersion: cfg.version,
    metadata: meta,
    signals,
  };
}
