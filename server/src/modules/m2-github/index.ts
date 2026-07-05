import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';
import { env } from '../../lib/env.js';

/** Parse "https://github.com/owner/repo" → { owner, repo }. */
function parseRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, '') };
}

async function gh(path: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Module 2 — GitHub Backdating Detection (high confidence, auto-post tier).
 * Flags commit bursts (claimed long history, pushed all at once) and
 * contributor accounts freshly created around the repo. See docs/modules.md#module-2.
 */
export const m2GitHub: Module = {
  id: 'M2',
  applies: (p: Project) => Boolean(p.githubUrl),

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const parsed = project.githubUrl ? parseRepo(project.githubUrl) : null;
    const evidenceUrl = project.githubUrl!;
    const out: CheckResult[] = [];

    if (!parsed) {
      const ref = await ctx.snapshot('gh-unparsed', { url: project.githubUrl }, {
        endpoint: 'internal', fetchedAt: now(),
      });
      out.push({
        module: 'M2', status: 'inconclusive', confidence: 'low',
        claim: 'GitHub link does not resolve to a specific repository — could not verify commit history.',
        evidence_url: evidenceUrl, raw_snapshot_ref: ref, checked_at: now(),
      });
      return out;
    }

    ctx.emit({ kind: 'info', text: `GET /repos/${parsed.owner}/${parsed.repo}` });
    const repo = await gh(`/repos/${parsed.owner}/${parsed.repo}`);
    if (repo.status !== 200) {
      const ref = await ctx.snapshot('gh-repo', repo.body, {
        endpoint: `/repos/${parsed.owner}/${parsed.repo}`, httpStatus: repo.status, fetchedAt: now(),
      });
      ctx.emit({ kind: 'error', text: `repo not accessible (HTTP ${repo.status})` });
      out.push({
        module: 'M2', status: 'inconclusive', confidence: 'low',
        claim: `Repository ${parsed.owner}/${parsed.repo} is private or missing (HTTP ${repo.status}) — history could not be verified.`,
        evidence_url: evidenceUrl, raw_snapshot_ref: ref, checked_at: now(),
      });
      return out;
    }
    const repoData = repo.body as { created_at: string; pushed_at: string; html_url: string };
    const repoRef = await ctx.snapshot('gh-repo', repoData, {
      endpoint: `/repos/${parsed.owner}/${parsed.repo}`, httpStatus: 200, fetchedAt: now(),
    });
    const createdAt = new Date(repoData.created_at).getTime();
    const ageDays = (Date.now() - createdAt) / DAY;

    // Commit history
    const commits = await gh(`/repos/${parsed.owner}/${parsed.repo}/commits?per_page=100`);
    const commitList = Array.isArray(commits.body)
      ? (commits.body as { commit: { author: { date: string } } }[])
      : [];
    const commitsRef = await ctx.snapshot('gh-commits', commits.body, {
      endpoint: `/repos/${parsed.owner}/${parsed.repo}/commits`, httpStatus: commits.status, fetchedAt: now(),
    });
    const dates = commitList.map((c) => new Date(c.commit.author.date).getTime()).sort((a, b) => a - b);
    const spanDays = dates.length > 1 ? (dates[dates.length - 1]! - dates[0]!) / DAY : 0;
    const burst = commitList.length >= 20 && spanDays < 2;
    ctx.emit({
      kind: burst ? 'flag' : 'pass',
      text: `repo age ${ageDays.toFixed(0)}d · ${commitList.length} commits spanning ${spanDays.toFixed(1)}d`,
    });
    out.push({
      module: 'M2',
      status: burst ? 'flagged' : 'confirmed',
      confidence: 'high',
      claim: burst
        ? `Repo created ${repoData.created_at.slice(0, 10)}; ${commitList.length} commits were authored within a ${spanDays.toFixed(1)}-day window — consistent with a bulk-imported/backdated history.`
        : `Repo created ${repoData.created_at.slice(0, 10)}; ${commitList.length} commits span ${spanDays.toFixed(1)} days of authored history.`,
      evidence_url: `${repoData.html_url}/commits`,
      raw_snapshot_ref: commitsRef,
      checked_at: now(),
    });

    // Contributor account ages (sample up to 5)
    const contribs = await gh(`/repos/${parsed.owner}/${parsed.repo}/contributors?per_page=5`);
    const contribList = Array.isArray(contribs.body)
      ? (contribs.body as { login: string }[])
      : [];
    const ages: { login: string; created_at: string }[] = [];
    for (const c of contribList.slice(0, 5)) {
      const u = await gh(`/users/${c.login}`);
      if (u.status === 200) {
        ages.push({ login: c.login, created_at: (u.body as { created_at: string }).created_at });
      }
    }
    const contribRef = await ctx.snapshot('gh-contributors', { contribList, ages }, {
      endpoint: `/repos/${parsed.owner}/${parsed.repo}/contributors`, httpStatus: contribs.status, fetchedAt: now(),
    });
    if (ages.length > 0) {
      const freshAll = ages.every((a) => Math.abs(new Date(a.created_at).getTime() - createdAt) < 14 * DAY);
      ctx.emit({
        kind: freshAll ? 'flag' : 'pass',
        text: `${ages.length} contributor account(s) sampled · ${freshAll ? 'all created near repo date' : 'predate repo'}`,
      });
      out.push({
        module: 'M2',
        status: freshAll ? 'flagged' : 'confirmed',
        confidence: freshAll ? 'medium' : 'high',
        claim: freshAll
          ? `All ${ages.length} sampled contributor accounts were created within two weeks of the repository — consistent with throwaway accounts.`
          : `Sampled contributor accounts predate the repository, consistent with an organic history.`,
        evidence_url: repoData.html_url,
        raw_snapshot_ref: contribRef,
        checked_at: now(),
      });
    }

    return out;
  },
};
