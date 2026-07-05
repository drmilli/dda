import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { env } from '../lib/env.js';

/**
 * Loads the versioned runtime-config artifacts from CONFIG_DIR.
 * These decide the entire input pile (see docs/configuration.md) — treat
 * changes as product decisions, not config tweaks.
 */
const configDir = env.CONFIG_DIR;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(configDir, file), 'utf8'));
}

// ── Schemas ─────────────────────────────────────────────────────────────
const techProjectSchema = z.object({
  version: z.number().int(),
  signals: z.array(
    z.object({
      key: z.string(),
      weight: z.number(),
      per_hit: z.boolean().optional(),
      cap: z.number().optional(),
      terms: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }),
  ),
  pass_threshold: z.number(),
});

const triageSchema = z.object({
  stage_a: z.object({
    min_age_hours: z.number(),
    min_market_cap_usd: z.number(),
    recheck_window_hours: z.number(),
    recheck_interval_minutes: z.number(),
    borderline_mcap_band_pct: z.number(),
  }),
});

const publisherSchema = z.object({
  daily_post_ceiling: z.number(),
  overflow_policy: z.enum(['conviction_first', 'freshness_weighted']),
  post_format: z.string(),
  x_account_tier: z.string(),
});

const moduleCfgSchema = z.record(
  z.object({
    concurrency: z.number(),
    timeout_ms: z.number(),
    rpc: z.string().optional(),
    follow_check: z.enum(['mentions_only', 'full_following']).optional(),
    read_provider: z.string().optional(),
    headless: z.boolean().optional(),
  }),
);

/** Picks the highest-versioned tech-project.v{N}.json artifact. */
function latestTechProjectFile(): string {
  const files = readdirSync(configDir).filter((f) => /^tech-project\.v\d+\.json$/.test(f));
  if (files.length === 0) throw new Error('No tech-project.v{N}.json config found');
  return files.sort((a, b) => versionOf(b) - versionOf(a))[0]!;
}
const versionOf = (f: string) => Number(f.match(/\.v(\d+)\./)![1]);

// ── Loaded, validated config ────────────────────────────────────────────
export const techProjectConfig = techProjectSchema.parse(readJson(latestTechProjectFile()));
export const triageConfig = triageSchema.parse(readJson('triage.json'));
export const publisherConfig = publisherSchema.parse(readJson('publisher.json'));
export const moduleConfig = moduleCfgSchema.parse(readJson('modules.json'));

export type TechProjectConfig = z.infer<typeof techProjectSchema>;
export type TriageConfig = z.infer<typeof triageSchema>;
export type PublisherConfig = z.infer<typeof publisherSchema>;
export type ModuleConfig = z.infer<typeof moduleCfgSchema>;
