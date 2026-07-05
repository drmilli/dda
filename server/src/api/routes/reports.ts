import type { FastifyInstance } from 'fastify';
import {
  getLatestReport,
  getReportByVersion,
  getReportById,
  getChecksByReport,
  getProjectById,
  getRecentReports,
  getCheckById,
} from '../../db/repo.js';
import { serializeReport } from '../serialize.js';

/**
 * Report archive endpoints (docs/api-reference.md).
 */
export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  // Feed for the archive page.
  app.get('/api/feed', async () => {
    const entries = await getRecentReports(40);
    return entries.map((e) => serializeReport(e.project, e.report, e.checks));
  });

  app.get<{ Params: { projectId: string } }>('/api/reports/:projectId', async (req, reply) => {
    const project = await getProjectById(req.params.projectId);
    if (!project) return reply.notFound();
    const report = await getLatestReport(project.id);
    if (!report) return reply.notFound();
    const checks = await getChecksByReport(report.id);
    return serializeReport(project, report, checks);
  });

  app.get<{ Params: { projectId: string; version: string } }>(
    '/api/reports/:projectId/v/:version',
    async (req, reply) => {
      const project = await getProjectById(req.params.projectId);
      if (!project) return reply.notFound();
      const report = await getReportByVersion(project.id, Number(req.params.version));
      if (!report) return reply.notFound();
      const checks = await getChecksByReport(report.id);
      return serializeReport(project, report, checks);
    },
  );

  // Fetch a report directly by its id (used by the live view once a run finishes).
  app.get<{ Params: { reportId: string } }>('/api/report/:reportId', async (req, reply) => {
    const report = await getReportById(req.params.reportId);
    if (!report) return reply.notFound();
    const project = await getProjectById(report.projectId);
    if (!project) return reply.notFound();
    const checks = await getChecksByReport(report.id);
    return serializeReport(project, report, checks);
  });

  // Redirect to the immutable raw snapshot for a check.
  app.get<{ Params: { checkId: string } }>('/api/snapshots/:checkId', async (req, reply) => {
    const check = await getCheckById(req.params.checkId);
    if (!check?.rawSnapshotRef) return reply.notFound();
    return reply.redirect(check.rawSnapshotRef);
  });
}
