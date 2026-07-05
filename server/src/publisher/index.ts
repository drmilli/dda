import { env } from '../lib/env.js';
import { publisherConfig } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { routeFinding, type FindingFlags } from './routing.js';
import { postToX } from './x-client.js';
import {
  getReportById,
  getProjectById,
  getChecksByReport,
  insertPublishEvent,
  insertReviewItems,
  countXPostsToday,
  type CheckRow,
  type ReviewItemInsert,
} from '../db/repo.js';
import type { PublishJob } from '../queue/queues.js';
import type { PublishTier } from '../types/index.js';

function flagsFor(check: CheckRow): FindingFlags {
  return {
    namesPerson: check.module === 'M4',
    isIntentAssertion: /\b(rug|rugpull|scam|honeypot|fraud)\b/i.test(check.claim),
    isConclusion: check.module === 'M5' || check.module === 'M6',
    isObjectiveFact: check.module === 'M3',
  };
}

/**
 * Publisher — the legal firewall. Routes each finding by tier: auto-post
 * on-chain/GitHub facts (+ hedged M3 facts) to X, hold anything person-naming /
 * intent / M5–M6 conclusions for human review. Rate-limited to the daily X
 * ceiling. See docs/publisher.md.
 */
export async function runPublish(job: PublishJob): Promise<void> {
  const { reportId } = job;
  const report = await getReportById(reportId);
  if (!report) return;
  const project = await getProjectById(report.projectId);
  if (!project) return;
  const checks = await getChecksByReport(reportId);

  const auto: CheckRow[] = [];
  const hedged: CheckRow[] = [];
  const held: ReviewItemInsert[] = [];

  for (const c of checks) {
    if (c.status !== 'flagged') continue; // only high-conviction facts leave the building
    const tier: PublishTier = routeFinding(c, flagsFor(c));
    if (tier === 'auto') auto.push(c);
    else if (tier === 'auto_hedged') hedged.push(c);
    else held.push({ reportId, checkId: c.id, module: c.module, tier, proposedText: c.claim });
  }

  if (held.length) await insertReviewItems(held);

  const postable = [...auto, ...hedged];
  if (postable.length === 0) {
    logger.info({ reportId }, 'nothing auto-postable');
    return;
  }

  // Daily ceiling guard — overflow rolls to a later run.
  const postedToday = await countXPostsToday();
  if (postedToday >= publisherConfig.daily_post_ceiling) {
    logger.warn({ reportId, postedToday }, 'daily X ceiling reached — deferring');
    return;
  }

  const mintShort = `${project.mint.slice(0, 4)}…${project.mint.slice(-4)}`;
  const url = `${env.PUBLIC_BASE_URL}/reports/${project.id}/v/${report.version}`;
  const lead = auto[0]?.claim ?? hedged[0]?.claim ?? '';
  const text = `${mintShort}: ${postable.length} objective flag(s). ${lead}`.slice(0, 240);

  const tier: PublishTier = auto.length > 0 ? 'auto' : 'auto_hedged';
  try {
    const res = await postToX(text, url);
    await insertPublishEvent({
      reportId,
      tier,
      channel: 'x',
      xPostId: res.xPostId,
      payload: `${text} ${url}`,
    });
    logger.info({ reportId, dryRun: res.dryRun, tier }, 'published to X');
  } catch (err) {
    logger.error({ err, reportId }, 'X publish failed — recorded site_only');
    await insertPublishEvent({ reportId, tier, channel: 'site_only', payload: `${text} ${url}` });
  }
}
