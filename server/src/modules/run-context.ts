import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { cloudinaryConfigured, putSnapshot } from '../storage/index.js';
import { nextSeq, publishStreamLine } from '../events/bus.js';
import type { ModuleId } from '../types/index.js';
import type { RateBudget, RunContext, SnapshotMeta } from './module.js';

function makeBudget(max: number): RateBudget {
  let spent = 0;
  return {
    requestsRemaining: () => Math.max(0, max - spent),
    spend: (n = 1) => {
      spent += n;
    },
  };
}

/**
 * Local fallback for the evidence store when Cloudinary isn't configured (dev
 * only). Writes the raw snapshot under EVIDENCE_DIR and returns a file:// ref so
 * invariant #1 still holds — every claim has a retrievable snapshot.
 */
async function localSnapshot(
  projectId: string,
  version: number,
  module: ModuleId,
  publicId: string,
  raw: unknown,
): Promise<string> {
  const dir = resolve(env.EVIDENCE_DIR, projectId, String(version), module);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${publicId}.json`);
  await writeFile(file, typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
  return `file://${file}`;
}

export interface RunContextArgs {
  reportId: string;
  projectId: string;
  reportVersion: number;
  module: ModuleId;
  budgetMax?: number;
}

export function createRunContext(args: RunContextArgs): RunContext {
  const { reportId, projectId, reportVersion, module } = args;

  return {
    reportId,
    projectId,
    reportVersion,
    module,
    budget: makeBudget(args.budgetMax ?? 100),

    async snapshot(name: string, raw: unknown, meta: SnapshotMeta): Promise<string> {
      const publicId = `${name}-${randomUUID().slice(0, 8)}`;
      const path = { projectId, reportVersion, module, checkId: publicId };
      if (cloudinaryConfigured()) {
        return putSnapshot(raw, meta, path);
      }
      return localSnapshot(projectId, reportVersion, module, publicId, raw);
    },

    emit(line) {
      // Fire-and-forget: ordering via a report-global Redis counter.
      void (async () => {
        try {
          const seq = await nextSeq(reportId);
          await publishStreamLine({
            report_id: reportId,
            module,
            seq,
            text: line.text,
            kind: line.kind,
            ts: new Date().toISOString(),
          });
        } catch (err) {
          logger.debug({ err }, 'stream emit failed');
        }
      })();
    },
  };
}
