import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';
import { resolveXDataSource } from '../../lib/x/source.js';
import { moduleConfig } from '../../config/index.js';

/**
 * Module 3 — X Account History & Affiliation (high confidence, feasibility caveat).
 * Real account age + numeric id via the official X API (XDataSource) when
 * credentials are present; rename/squat detection via Wayback CDX (free). Full
 * follow verification is provider-gated (descoped to mentions-only at launch).
 * Degrades to Wayback-only when no X credentials are configured.
 * See docs/modules.md#module-3.
 */
export const m3XHistory: Module = {
  id: 'M3',
  applies: (p: Project) => Boolean(p.xHandle),

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const handle = project.xHandle!.replace(/^@/, '');
    const out: CheckResult[] = [];
    const profileUrl = `https://x.com/${handle}`;
    const archiveUrl = `https://web.archive.org/web/*/twitter.com/${handle}`;

    // ── 1. Real account identity + age (official X API) ──────────────────
    const source = resolveXDataSource();
    if (source) {
      ctx.emit({ kind: 'info', text: `Resolving @${handle} via ${source.name} X API` });
      const user = await source.getUser(handle);
      if (user) {
        const created = user.createdAt.slice(0, 10);
        const ageDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86_400_000);
        const ref = await ctx.snapshot('x-user', user, { endpoint: '/2/users/by/username', fetchedAt: now() });
        ctx.emit({ kind: 'pass', text: `@${handle} id ${user.id} · created ${created} (${ageDays}d) · ${user.followers} followers` });
        out.push({
          module: 'M3',
          status: 'confirmed',
          confidence: 'high',
          claim: `X account @${handle} (numeric id ${user.id}, stable across renames) was created ${created} — ${ageDays} days old, ${user.followers} followers${user.verified ? ', verified' : ''}.`,
          evidence_url: profileUrl,
          raw_snapshot_ref: ref,
          checked_at: now(),
        });
      } else {
        const ref = await ctx.snapshot('x-user-miss', { handle }, { endpoint: '/2/users/by/username', fetchedAt: now() });
        ctx.emit({ kind: 'error', text: `@${handle} not resolvable via X API` });
        out.push({
          module: 'M3', status: 'inconclusive', confidence: 'low',
          claim: `X account @${handle} could not be resolved via the X API at check time.`,
          evidence_url: profileUrl, raw_snapshot_ref: ref, checked_at: now(),
        });
      }
    }

    // ── 2. Rename / squat detection (Wayback CDX — free) ─────────────────
    ctx.emit({ kind: 'info', text: `Reconstructing handle history for @${handle} (Wayback)` });
    let rows: string[][] = [];
    let status = 200;
    try {
      const res = await fetch(
        `https://web.archive.org/cdx/search/cdx?url=twitter.com/${handle}&output=json&fl=timestamp,original&collapse=timestamp:8&limit=200`,
        { signal: AbortSignal.timeout(15000) },
      );
      status = res.status;
      rows = res.status === 200 ? ((await res.json()) as string[][]) : [];
    } catch {
      status = 0;
    }
    const wbRef = await ctx.snapshot('wayback-cdx', rows, {
      endpoint: 'web.archive.org/cdx', params: { handle }, httpStatus: status, fetchedAt: now(),
    });
    const captures = rows.slice(1); // rows[0] is the header
    if (captures.length > 0) {
      const first = captures[0]![0]!;
      const firstDate = `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}`;
      ctx.emit({ kind: 'pass', text: `earliest archive capture ${firstDate} (${captures.length} snapshots)` });
      // If the official account is much newer than the archive history, the handle was likely re-used.
      out.push({
        module: 'M3', status: 'confirmed', confidence: 'medium',
        claim: `The handle @${handle} appears in Wayback Machine archives back to ${firstDate} (${captures.length} snapshots) — cross-check against the current account's creation date for handle re-use.`,
        evidence_url: archiveUrl, raw_snapshot_ref: wbRef, checked_at: now(),
      });
    } else if (!source) {
      // Only report "no archive" when we had no official data either.
      out.push({
        module: 'M3', status: 'inconclusive', confidence: 'low',
        claim: `No Wayback Machine captures found for @${handle} and no X API credentials configured — account age could not be corroborated.`,
        evidence_url: archiveUrl, raw_snapshot_ref: wbRef, checked_at: now(),
      });
    }

    // ── 3. Affiliation / follow verification (provider-gated) ────────────
    const followMode = moduleConfig.M3?.follow_check ?? 'mentions_only';
    const affRef = await ctx.snapshot('x-affiliation', { mode: followMode }, { endpoint: 'internal', fetchedAt: now() });
    out.push({
      module: 'M3', status: 'inconclusive', confidence: 'low',
      claim: `Endorsement/affiliation verification is limited to '${followMode}' — full follower-graph checks require the third-party X read provider (not yet wired).`,
      evidence_url: profileUrl, raw_snapshot_ref: affRef, checked_at: now(),
    });

    return out;
  },
};
