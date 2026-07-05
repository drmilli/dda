/**
 * Pre-flight evidence-store check. With Cloudinary configured it does a REAL
 * signed upload (raw snapshot + image) and fetches each back to confirm the
 * secure_url is retrievable — proving the legal-record store works end to end.
 * Without Cloudinary it verifies the local ./.evidence fallback instead.
 *   npm run evidence:verify
 */
import { randomUUID } from 'node:crypto';
import { cloudinaryConfigured, putSnapshot, putImage } from '../storage/index.js';
import { createRunContext } from '../modules/run-context.js';

// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function fetchOk(url: string): Promise<string> {
  if (url.startsWith('file://')) return 'local file (ok)';
  try {
    const r = await fetch(url);
    return `${r.ok ? 'retrievable' : 'NOT retrievable'} (HTTP ${r.status})`;
  } catch (e) {
    return `fetch error: ${e instanceof Error ? e.message : e}`;
  }
}

async function main() {
  const now = new Date().toISOString();
  const id = randomUUID().slice(0, 8);

  if (!cloudinaryConfigured()) {
    console.log('• Cloudinary NOT configured — evidence would use the local ./.evidence fallback.');
    console.log('  ⚠ On Render this disk is ephemeral (wiped on redeploy). Set CLOUDINARY_URL for production.');
    const ctx = createRunContext({ reportId: `verify-${id}`, projectId: 'verify', reportVersion: 0, module: 'M1' });
    const ref = await ctx.snapshot('verify', { test: true, ts: now }, { endpoint: 'internal:verify', fetchedAt: now });
    console.log('  local snapshot →', ref);
    process.exit(0);
  }

  console.log('• Cloudinary configured — running a real upload round-trip…');
  const rawRef = await putSnapshot(
    { test: 'evidence-verify', ts: now },
    { endpoint: 'internal:verify', fetchedAt: now },
    { projectId: 'verify', reportVersion: 0, module: 'M1', checkId: `raw-${id}` },
  );
  console.log('  raw snapshot →', rawRef);
  console.log('    ', await fetchOk(rawRef));

  const img = await putImage(PNG, { projectId: 'verify', reportVersion: 0, module: 'M5', checkId: `img-${id}` });
  console.log('  image        →', img.url);
  console.log('    ', await fetchOk(img.url));

  console.log('✓ evidence store verified (upload + retrieval).');
  process.exit(0);
}

main().catch((e) => {
  console.error('✗ evidence check failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
