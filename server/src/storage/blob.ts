import { cloudinaryUpload, evidenceFolder } from './cloudinary.js';
import type { SnapshotMeta } from '../modules/module.js';
import type { ModuleId } from '../types/index.js';

/**
 * Raw NON-image snapshots (API/RPC JSON, captured DOM/HTML) — the legal record.
 * Uploaded to Cloudinary as resource_type 'raw', write-once (overwrite:false),
 * with request provenance attached as `context`. See docs/data-model.md.
 */
export interface BlobPath {
  projectId: string;
  reportVersion: number;
  module: ModuleId;
  checkId: string;
}

export async function putSnapshot(
  raw: unknown,
  meta: SnapshotMeta,
  path: BlobPath,
): Promise<string> {
  const body = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const dataUri = `data:application/json;base64,${Buffer.from(body).toString('base64')}`;
  return cloudinaryUpload({
    resourceType: 'raw',
    folder: evidenceFolder(path.projectId, path.reportVersion, path.module),
    publicId: path.checkId,
    file: dataUri,
    context: {
      endpoint: meta.endpoint,
      http_status: String(meta.httpStatus ?? ''),
      fetched_at: meta.fetchedAt,
      params: meta.params ? JSON.stringify(meta.params) : '',
    },
  });
}
