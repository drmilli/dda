import type { ReportResponse, ReviewItem } from './types.js';

/**
 * Thin client for the Node backend.
 * - Dev: `/api` is proxied to localhost:3000 (see vite.config.ts).
 * - Prod: set `VITE_API_BASE_URL` (e.g. https://dda-api.onrender.com) so the
 *   SPA calls the Render backend directly (CORS-allowed via ALLOWED_ORIGINS).
 */
const API_ROOT = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const BASE = `${API_ROOT}/api`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ''}`);
  }
  return (await res.json()) as T;
}

export interface SubmitResponse {
  project_id: string;
  report_id: string;
  version: number;
  stream_url: string;
}

export const api = {
  /** Archive feed — most recent reports. */
  feed: () => get<ReportResponse[]>('/feed'),

  /** Latest report for a project. */
  latestReport: (projectId: string) => get<ReportResponse>(`/reports/${projectId}`),

  /** A pinned, immutable report version. */
  reportVersion: (projectId: string, version: number) =>
    get<ReportResponse>(`/reports/${projectId}/v/${version}`),

  /** A report by its own id (used by the live view). */
  reportById: (reportId: string) => get<ReportResponse>(`/report/${reportId}`),

  /** Submit a mint for a full-battery run (skips triage). */
  submit: async (mint: string): Promise<SubmitResponse> => {
    const res = await fetch(`${BASE}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ''}`);
    }
    return (await res.json()) as SubmitResponse;
  },

  /** Contest a published finding (or a whole report if check_id omitted). */
  createDispute: async (body: {
    report_id: string;
    check_id?: string;
    contact?: string;
    statement: string;
  }): Promise<{ dispute_id: string }> => {
    const res = await fetch(`${BASE}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ''}`);
    }
    return (await res.json()) as { dispute_id: string };
  },

  /** URL for the live SSE stream of a report. */
  streamUrl: (reportId: string) => `${BASE}/stream/${reportId}`,
};

// ── Admin (bearer-token) ────────────────────────────────────────────────
async function admin<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error('unauthorized — check the admin token');
  if (res.status === 503) throw new Error('admin auth not configured on the server (set ADMIN_TOKEN)');
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${msg ? ` — ${msg}` : ''}`);
  }
  return (await res.json()) as T;
}

export const adminApi = {
  reviewQueue: (token: string) => admin<ReviewItem[]>('/admin/review-queue', token),
  resolve: (
    token: string,
    id: string,
    body: { action: 'approve' | 'edit' | 'reject'; text?: string; approver?: string },
  ) => admin<{ status: string; dryRun?: boolean }>(`/admin/review/${id}`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
};
