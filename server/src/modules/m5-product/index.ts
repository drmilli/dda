import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';

const APP_MARKERS = [
  'id="root"', '__next', 'data-reactroot', 'ng-version', '__NUXT__',
  'data-sveltekit', '__INITIAL_STATE__', 'window.__',
];

/**
 * Module 5 — Product/Site Functionality (low confidence, now core).
 * Fetches the claimed site and applies interactivity heuristics (app-shell
 * markers, script bundles, API calls) vs. a static placeholder. Flags "needs
 * manual review" more often than a firm verdict. A headless-browser + screenshot
 * upgrade is future work. See docs/modules.md#module-5.
 */
export const m5Product: Module = {
  id: 'M5',
  applies: (p: Project) => Boolean(p.websiteUrl),

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const url = project.websiteUrl!;
    ctx.emit({ kind: 'info', text: `Crawling ${url}` });

    let html = '';
    let status = 0;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
      status = res.status;
      html = (await res.text()).slice(0, 200_000);
    } catch {
      status = 0;
    }

    if (status === 0 || !html) {
      const ref = await ctx.snapshot('site-fetch', { url, status }, { endpoint: url, httpStatus: status, fetchedAt: now() });
      ctx.emit({ kind: 'error', text: 'site unreachable' });
      return [{
        module: 'M5', status: 'inconclusive', confidence: 'low',
        claim: `Claimed site ${url} was unreachable at check time — could not assess whether a real product exists. Needs manual review.`,
        evidence_url: url, raw_snapshot_ref: ref, checked_at: now(),
      }];
    }

    const markerHits = APP_MARKERS.filter((m) => html.includes(m)).length;
    const scriptBundles = (html.match(/<script[^>]+src=/g) ?? []).length;
    const apiHints = /fetch\(|axios|xmlhttprequest|\/api\//i.test(html);
    const interactive = markerHits > 0 || scriptBundles >= 3;

    const ref = await ctx.snapshot('site-html', html, { endpoint: url, httpStatus: status, fetchedAt: now() });
    ctx.emit({
      kind: interactive ? 'pass' : 'error',
      text: `site: ${interactive ? 'app-shell detected' : 'appears static'} · ${scriptBundles} bundles · markers ${markerHits}`,
    });

    return [{
      module: 'M5', status: 'inconclusive', confidence: 'low',
      claim: interactive
        ? `Claimed site ${url} shows app-shell markers (${markerHits}) and ${scriptBundles} script bundles${apiHints ? ' with API calls' : ''} — consistent with a real app, but automated checks are fuzzy; confirm manually.`
        : `Claimed site ${url} appears to be a static page (${scriptBundles} script bundles, no app-shell markers) — possible placeholder. Needs manual review.`,
      evidence_url: url, raw_snapshot_ref: ref, checked_at: now(),
    }];
  },
};
