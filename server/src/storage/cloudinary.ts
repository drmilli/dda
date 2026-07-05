import { createHash } from 'node:crypto';
import { env } from '../lib/env.js';

/**
 * Cloudinary evidence store via the signed REST upload API (no SDK — keeps the
 * dependency surface at zero). Handles BOTH media types:
 *   - resource_type 'raw'   → JSON/HTML snapshots (legal record)
 *   - resource_type 'image' → screenshots
 *
 * Credentials come from CLOUDINARY_URL (cloudinary://key:secret@cloud) or the
 * individual CLOUDINARY_* vars.
 */
interface Creds {
  cloud: string;
  key: string;
  secret: string;
}

// Reject the .env.example placeholders so a copy-paste default never counts as
// "configured" (which would 401 on every upload and silently fail evidence).
const PLACEHOLDERS = new Set(['api_key', 'api_secret', 'cloud_name', '']);
function real(c: Creds): Creds | null {
  if (PLACEHOLDERS.has(c.key) || PLACEHOLDERS.has(c.secret) || PLACEHOLDERS.has(c.cloud)) return null;
  return c;
}

function creds(): Creds | null {
  if (env.CLOUDINARY_URL) {
    const m = env.CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (m) return real({ key: m[1]!, secret: m[2]!, cloud: m[3]! });
  }
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return real({
      cloud: env.CLOUDINARY_CLOUD_NAME,
      key: env.CLOUDINARY_API_KEY,
      secret: env.CLOUDINARY_API_SECRET,
    });
  }
  return null;
}

export function cloudinaryConfigured(): boolean {
  return creds() !== null;
}

export function evidenceFolder(projectId: string, reportVersion: number, module: string): string {
  return `${env.CLOUDINARY_FOLDER}/${projectId}/${reportVersion}/${module}`;
}

export interface UploadArgs {
  resourceType: 'raw' | 'image';
  folder: string;
  publicId: string;
  /** data URI (e.g. "data:application/json;base64,..") or a remote URL to fetch. */
  file: string;
  context?: Record<string, string>;
}

/** Signed upload. Returns the immutable secure_url stored as raw_snapshot_ref. */
export async function cloudinaryUpload(args: UploadArgs): Promise<string> {
  const c = creds();
  if (!c) throw new Error('cloudinary not configured');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const contextStr = args.context
    ? Object.entries(args.context)
        .map(([k, v]) => `${k}=${String(v).replace(/[|=]/g, ' ')}`)
        .join('|')
    : undefined;

  // Params that participate in the signature (everything except file/api_key/resource_type).
  const signed: Record<string, string> = {
    folder: args.folder,
    overwrite: 'false',
    public_id: args.publicId,
    timestamp,
    ...(contextStr ? { context: contextStr } : {}),
  };
  const toSign = Object.keys(signed)
    .sort()
    .map((k) => `${k}=${signed[k]}`)
    .join('&');
  const signature = createHash('sha1').update(toSign + c.secret).digest('hex');

  const form = new FormData();
  form.set('file', args.file);
  form.set('api_key', c.key);
  form.set('signature', signature);
  for (const [k, v] of Object.entries(signed)) form.set(k, v);

  const url = `https://api.cloudinary.com/v1_1/${c.cloud}/${args.resourceType}/upload`;
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`cloudinary upload failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { secure_url: string };
  return json.secure_url;
}
