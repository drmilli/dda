/**
 * Postgres schema (Neon). Mirrors docs/data-model.md.
 *
 * Append-only discipline: report/check_result/publish_event and blob snapshots
 * are never overwritten — re-runs create new report versions.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ───────────────────────────────────────────────────────────────
export const moduleEnum = pgEnum('module', ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
export const checkStatusEnum = pgEnum('check_status', [
  'confirmed',
  'flagged',
  'inconclusive',
  'not_applicable',
]);
export const confidenceEnum = pgEnum('confidence', ['high', 'medium', 'low']);
export const discoverySourceEnum = pgEnum('discovery_source', ['triage', 'manual']);
export const reportStatusEnum = pgEnum('report_status', [
  'pending',
  'running',
  'complete',
  'failed',
]);
export const publishTierEnum = pgEnum('publish_tier', ['auto', 'auto_hedged', 'human']);
export const publishChannelEnum = pgEnum('publish_channel', ['x', 'site_only']);
export const triageStageEnum = pgEnum('triage_stage', ['A', 'B']);

// ── project ─────────────────────────────────────────────────────────────
export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  mint: text('mint').notNull().unique(),
  creator: text('creator').notNull(),
  xHandle: text('x_handle'),
  githubUrl: text('github_url'),
  websiteUrl: text('website_url'),
  launchTs: timestamp('launch_ts', { withTimezone: true }).notNull(),
  discoverySource: discoverySourceEnum('discovery_source').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── report (versioned) ──────────────────────────────────────────────────
export const report = pgTable(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    version: integer('version').notNull(),
    status: reportStatusEnum('status').notNull().default('pending'),
    summary: text('summary'), // LLM-written, from finalized CheckResults only
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [unique('report_project_version').on(t.projectId, t.version)],
);

// ── check_result (immutable evidence unit) ──────────────────────────────
export const checkResult = pgTable(
  'check_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id),
    module: moduleEnum('module').notNull(),
    status: checkStatusEnum('status').notNull(),
    confidence: confidenceEnum('confidence').notNull(),
    claim: text('claim').notNull(),
    evidenceUrl: text('evidence_url'),
    rawSnapshotRef: text('raw_snapshot_ref'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('check_result_report_idx').on(t.reportId),
    // Invariant #1: any non-N/A result must carry both an evidence URL and a snapshot ref.
    check(
      'evidence_required',
      sql`${t.status} = 'not_applicable' OR (${t.evidenceUrl} IS NOT NULL AND ${t.rawSnapshotRef} IS NOT NULL)`,
    ),
  ],
);

// ── publish_event (legal record) ────────────────────────────────────────
export const publishEvent = pgTable('publish_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => report.id),
  tier: publishTierEnum('tier').notNull(),
  channel: publishChannelEnum('channel').notNull(),
  xPostId: text('x_post_id'),
  approver: text('approver'), // set when tier = 'human'
  payload: text('payload').notNull(), // exact text posted
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── kol_wallet (curated, append-only) ───────────────────────────────────
export const kolWallet = pgTable('kol_wallet', {
  id: uuid('id').primaryKey().defaultRandom(),
  address: text('address').notNull(),
  attributedIdentity: text('attributed_identity').notNull(),
  evidenceSource: text('evidence_source').notNull(),
  confidence: confidenceEnum('confidence').notNull(),
  addedBy: text('added_by').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── triage_log (dropped tokens, retention-capped) ───────────────────────
export const triageLog = pgTable(
  'triage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mint: text('mint').notNull(),
    stage: triageStageEnum('stage').notNull(),
    reason: text('reason').notNull(),
    signals: jsonb('signals'),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('triage_log_mint_idx').on(t.mint)],
);

// ── review_item (human-gated findings held before publish) ──────────────
export const reviewStatusEnum = pgEnum('review_status', [
  'pending',
  'approved',
  'rejected',
]);
export const reviewItem = pgTable(
  'review_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id),
    checkId: uuid('check_id').references(() => checkResult.id),
    module: moduleEnum('module').notNull(),
    tier: publishTierEnum('tier').notNull(),
    proposedText: text('proposed_text').notNull(),
    status: reviewStatusEnum('status').notNull().default('pending'),
    approver: text('approver'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('review_item_status_idx').on(t.status)],
);

// ── dispute (public path to contest a finding) ──────────────────────────
export const disputeStatusEnum = pgEnum('dispute_status', ['open', 'resolved']);
export const dispute = pgTable('dispute', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => report.id),
  checkId: uuid('check_id').references(() => checkResult.id),
  contact: text('contact'),
  statement: text('statement').notNull(),
  status: disputeStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
