import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../env.js';

/**
 * Shared OAuth 1.0a user-context signing for the X API — used by both the
 * publisher (writes) and the XDataSource (reads). Correctly folds URL query
 * params into the signature base string, so GET reads with query strings sign.
 */
export const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function hasXCreds(): boolean {
  return Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET);
}

export function oauthHeader(method: string, urlStr: string): string {
  const url = new URL(urlStr);
  const oauth: Record<string, string> = {
    oauth_consumer_key: env.X_API_KEY!,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.X_ACCESS_TOKEN!,
    oauth_version: '1.0',
  };

  // Signature base includes oauth params + query params (sorted); JSON bodies excluded.
  const all: Record<string, string> = { ...oauth };
  for (const [k, v] of url.searchParams) all[k] = v;
  const paramStr = Object.keys(all)
    .sort()
    .map((k) => `${enc(k)}=${enc(all[k]!)}`)
    .join('&');
  const base = [method.toUpperCase(), enc(`${url.origin}${url.pathname}`), enc(paramStr)].join('&');
  const signingKey = `${enc(env.X_API_SECRET!)}&${enc(env.X_ACCESS_SECRET!)}`;
  const signature = createHmac('sha1', signingKey).update(base).digest('base64');

  // Only oauth_* params go in the Authorization header.
  const header = { ...oauth, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(header)
      .sort()
      .map((k) => `${enc(k)}="${enc(header[k as keyof typeof header]!)}"`)
      .join(', ')
  );
}
