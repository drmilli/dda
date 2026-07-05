import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';

/**
 * Module 3 — X Account History & Affiliation (high confidence, feasibility caveat).
 * Reconstructs handle history from Wayback Machine CDX snapshots (free, no key).
 * Full follow/affiliation checks need the XDataSource provider and are descoped
 * to mentions-only until wired. See docs/modules.md#module-3.
 */
export const m3XHistory: Module = {
  id: 'M3',
  applies: (p: Project) => Boolean(p.xHandle),

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const handle = project.xHandle!.replace(/^@/, '');
    const out: CheckResult[] = [];
    const archiveUrl = `https://web.archive.org/web/*/twitter.com/${handle}`;

    ctx.emit({ kind: 'info', text: `Resolving Wayback history for @${handle}` });
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
    const ref = await ctx.snapshot('wayback-cdx', rows, {
      endpoint: 'web.archive.org/cdx', params: { handle }, httpStatus: status, fetchedAt: now(),
    });

    // rows[0] is the header row when present.
    const captures = rows.slice(1);
    if (captures.length === 0) {
      ctx.emit({ kind: 'error', text: `no web-archive captures for @${handle}` });
      out.push({
        module: 'M3', status: 'inconclusive', confidence: 'low',
        claim: `No Wayback Machine captures found for @${handle} — account age could not be corroborated from archives.`,
        evidence_url: archiveUrl, raw_snapshot_ref: ref, checked_at: now(),
      });
      return out;
    }

    const first = captures[0]![0]!; // YYYYMMDDhhmmss
    const firstDate = `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}`;
    ctx.emit({ kind: 'pass', text: `earliest archive capture: ${firstDate} (${captures.length} captures)` });
    out.push({
      module: 'M3', status: 'confirmed', confidence: 'medium',
      claim: `The handle @${handle} has Wayback Machine captures back to ${firstDate} (${captures.length} archived snapshots).`,
      evidence_url: archiveUrl, raw_snapshot_ref: ref, checked_at: now(),
    });

    // Affiliation / follow verification is descoped without the XDataSource provider.
    const noteRef = await ctx.snapshot('x-affiliation', { note: 'mentions-only pending provider' }, {
      endpoint: 'internal', fetchedAt: now(),
    });
    out.push({
      module: 'M3', status: 'inconclusive', confidence: 'low',
      claim: 'Affiliation / follower verification not run — pending the third-party X read provider (descoped to mentions-only at launch).',
      evidence_url: archiveUrl, raw_snapshot_ref: noteRef, checked_at: now(),
    });
    return out;
  },
};
