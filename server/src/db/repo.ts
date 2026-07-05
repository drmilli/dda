import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { db, dbDirect } from './client.js';
import * as t from './schema.js';
import type {
  CheckStatus,
  Confidence,
  DiscoverySource,
  ModuleId,
  PublishTier,
} from '../types/index.js';

/**
 * Repository — the single place SQL lives. Reads use the pooled connection
 * (`db`), pipeline writes use the direct connection (`dbDirect`). See
 * docs/data-model.md.
 */

export type ProjectRow = typeof t.project.$inferSelect;
export type ReportRow = typeof t.report.$inferSelect;
export type CheckRow = typeof t.checkResult.$inferSelect;

export interface ProjectInput {
  mint: string;
  creator: string;
  xHandle?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  launchTs: Date;
  discoverySource: DiscoverySource;
}

export async function upsertProject(input: ProjectInput): Promise<ProjectRow> {
  const rows = await dbDirect
    .insert(t.project)
    .values({
      mint: input.mint,
      creator: input.creator,
      xHandle: input.xHandle ?? null,
      githubUrl: input.githubUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
      launchTs: input.launchTs,
      discoverySource: input.discoverySource,
    })
    .onConflictDoUpdate({
      target: t.project.mint,
      set: {
        creator: input.creator,
        xHandle: input.xHandle ?? null,
        githubUrl: input.githubUrl ?? null,
        websiteUrl: input.websiteUrl ?? null,
      },
    })
    .returning();
  return rows[0]!;
}

export async function getProjectById(id: string): Promise<ProjectRow | undefined> {
  const rows = await db.select().from(t.project).where(eq(t.project.id, id)).limit(1);
  return rows[0];
}

export async function nextReportVersion(projectId: string): Promise<number> {
  const rows = await dbDirect
    .select({ v: max(t.report.version) })
    .from(t.report)
    .where(eq(t.report.projectId, projectId));
  return (rows[0]?.v ?? 0) + 1;
}

export async function createReport(projectId: string, version: number): Promise<ReportRow> {
  const rows = await dbDirect
    .insert(t.report)
    .values({ projectId, version, status: 'pending' })
    .returning();
  return rows[0]!;
}

export async function setReportStatus(
  reportId: string,
  status: 'pending' | 'running' | 'complete' | 'failed',
): Promise<void> {
  await dbDirect.update(t.report).set({ status }).where(eq(t.report.id, reportId));
}

export async function finalizeReport(reportId: string, summary: string): Promise<void> {
  await dbDirect
    .update(t.report)
    .set({ status: 'complete', summary, completedAt: new Date() })
    .where(eq(t.report.id, reportId));
}

export async function getReportById(reportId: string): Promise<ReportRow | undefined> {
  const rows = await db.select().from(t.report).where(eq(t.report.id, reportId)).limit(1);
  return rows[0];
}

export async function getLatestReport(projectId: string): Promise<ReportRow | undefined> {
  const rows = await db
    .select()
    .from(t.report)
    .where(eq(t.report.projectId, projectId))
    .orderBy(desc(t.report.version))
    .limit(1);
  return rows[0];
}

export async function getReportByVersion(
  projectId: string,
  version: number,
): Promise<ReportRow | undefined> {
  const rows = await db
    .select()
    .from(t.report)
    .where(and(eq(t.report.projectId, projectId), eq(t.report.version, version)))
    .limit(1);
  return rows[0];
}

export async function getCheckById(id: string): Promise<CheckRow | undefined> {
  const rows = await db.select().from(t.checkResult).where(eq(t.checkResult.id, id)).limit(1);
  return rows[0];
}

export async function getChecksByReport(reportId: string): Promise<CheckRow[]> {
  return db
    .select()
    .from(t.checkResult)
    .where(eq(t.checkResult.reportId, reportId))
    .orderBy(t.checkResult.checkedAt);
}

export interface CheckInsert {
  module: ModuleId;
  status: CheckStatus;
  confidence: Confidence;
  claim: string;
  evidenceUrl: string | null;
  rawSnapshotRef: string | null;
  checkedAt: Date;
}

export async function insertCheckResults(
  reportId: string,
  checks: CheckInsert[],
): Promise<CheckRow[]> {
  if (checks.length === 0) return [];
  return dbDirect
    .insert(t.checkResult)
    .values(checks.map((c) => ({ ...c, reportId })))
    .returning();
}

export async function insertTriageLog(
  mint: string,
  stage: 'A' | 'B',
  reason: string,
  signals: unknown,
): Promise<void> {
  await dbDirect.insert(t.triageLog).values({ mint, stage, reason, signals });
}

export async function insertPublishEvent(input: {
  reportId: string;
  tier: PublishTier;
  channel: 'x' | 'site_only';
  xPostId?: string | null;
  approver?: string | null;
  payload: string;
}): Promise<void> {
  await dbDirect.insert(t.publishEvent).values({
    reportId: input.reportId,
    tier: input.tier,
    channel: input.channel,
    xPostId: input.xPostId ?? null,
    approver: input.approver ?? null,
    payload: input.payload,
  });
}

export interface FeedEntry {
  project: ProjectRow;
  report: ReportRow;
  checks: CheckRow[];
}

export async function getRecentReports(limit = 30): Promise<FeedEntry[]> {
  const reports = await db.select().from(t.report).orderBy(desc(t.report.startedAt)).limit(limit);
  const out: FeedEntry[] = [];
  for (const report of reports) {
    const project = await getProjectById(report.projectId);
    if (!project) continue;
    const checks = await getChecksByReport(report.id);
    out.push({ project, report, checks });
  }
  return out;
}

export async function getKolWalletsByAddresses(
  addresses: string[],
): Promise<(typeof t.kolWallet.$inferSelect)[]> {
  if (addresses.length === 0) return [];
  return db.select().from(t.kolWallet).where(inArray(t.kolWallet.address, addresses));
}

export interface ReviewItemInsert {
  reportId: string;
  checkId: string | null;
  module: ModuleId;
  tier: PublishTier;
  proposedText: string;
}

export async function insertReviewItems(items: ReviewItemInsert[]): Promise<void> {
  if (items.length === 0) return;
  await dbDirect.insert(t.reviewItem).values(items);
}

export async function listReviewQueue(): Promise<(typeof t.reviewItem.$inferSelect)[]> {
  return db
    .select()
    .from(t.reviewItem)
    .where(eq(t.reviewItem.status, 'pending'))
    .orderBy(desc(t.reviewItem.createdAt));
}

export async function getReviewItem(
  id: string,
): Promise<(typeof t.reviewItem.$inferSelect) | undefined> {
  const rows = await db.select().from(t.reviewItem).where(eq(t.reviewItem.id, id)).limit(1);
  return rows[0];
}

export async function resolveReviewItem(
  id: string,
  status: 'approved' | 'rejected',
  approver: string,
): Promise<void> {
  await dbDirect
    .update(t.reviewItem)
    .set({ status, approver, resolvedAt: new Date() })
    .where(eq(t.reviewItem.id, id));
}

export async function insertDispute(input: {
  reportId: string;
  checkId?: string | null;
  contact?: string | null;
  statement: string;
}): Promise<string> {
  const rows = await dbDirect
    .insert(t.dispute)
    .values({
      reportId: input.reportId,
      checkId: input.checkId ?? null,
      contact: input.contact ?? null,
      statement: input.statement,
    })
    .returning({ id: t.dispute.id });
  return rows[0]!.id;
}

/** Count of publish events posted to X today (UTC) — daily-ceiling guard. */
export async function countXPostsToday(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.publishEvent)
    .where(
      and(
        eq(t.publishEvent.channel, 'x'),
        sql`${t.publishEvent.postedAt} >= date_trunc('day', now())`,
      ),
    );
  return rows[0]?.n ?? 0;
}
