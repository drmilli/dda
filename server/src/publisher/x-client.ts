import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

/**
 * X posting client. Plain-text verdict + exactly one link (keeps within the
 * ~$0.20/link-post metering and the daily cap). Posting account is Premium+.
 *
 * Dry-run by default (PUBLISHER_DRY_RUN). When disabled AND full OAuth 1.0a
 * user-context credentials are present, posts via POST /2/tweets.
 * See docs/publisher.md.
 */
export interface XPostResult {
  xPostId: string;
  dryRun: boolean;
}

// X wraps every URL to a fixed t.co length regardless of the real URL.
const TCO_LEN = 23;
const MAX_TWEET = 280;

const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function hasXCreds(): boolean {
  return Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET);
}

/** OAuth 1.0a Authorization header (JSON body params are not part of the signature). */
function oauthHeader(method: string, url: string): string {
  const params: Record<string, string> = {
    oauth_consumer_key: env.X_API_KEY!,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.X_ACCESS_TOKEN!,
    oauth_version: '1.0',
  };
  const base = [
    method.toUpperCase(),
    enc(url),
    enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k]!)}`).join('&')),
  ].join('&');
  const signingKey = `${enc(env.X_API_SECRET!)}&${enc(env.X_ACCESS_SECRET!)}`;
  const signature = createHmac('sha1', signingKey).update(base).digest('base64');
  const all = { ...params, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(all)
      .sort()
      .map((k) => `${enc(k)}="${enc(all[k as keyof typeof all]!)}"`)
      .join(', ')
  );
}

/** Trim the verdict so verdict + " " + url fits X's 280-char limit (URL = 23). */
function composeTweet(text: string, reportUrl: string): string {
  const budget = MAX_TWEET - TCO_LEN - 1;
  const trimmed = text.length > budget ? `${text.slice(0, budget - 1).trimEnd()}…` : text;
  return `${trimmed} ${reportUrl}`.trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read-only credential check (GET /2/users/me). Safe to run anytime — it never
 * posts. Use it to validate the OAuth setup before enabling live posting.
 */
export async function verifyCredentials(): Promise<{ id: string; username: string }> {
  if (!hasXCreds()) throw new Error('X credentials incomplete (need X_API_KEY/SECRET + X_ACCESS_TOKEN/SECRET)');
  const url = 'https://api.twitter.com/2/users/me';
  const res = await fetch(url, { headers: { Authorization: oauthHeader('GET', url) } });
  if (!res.ok) throw new Error(`X credential check failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: { id: string; username: string } };
  if (!json.data) throw new Error('X credential check: no user in response');
  return json.data;
}

export async function postToX(text: string, reportUrl: string): Promise<XPostResult> {
  const body = composeTweet(text, reportUrl);

  if (env.PUBLISHER_DRY_RUN || !hasXCreds()) {
    logger.info({ body, chars: body.length }, 'X post (dry-run)');
    return { xPostId: `dryrun-${Date.now()}`, dryRun: true };
  }

  const url = 'https://api.twitter.com/2/tweets';
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: oauthHeader('POST', url), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: { id?: string } };
      const id = json.data?.id;
      if (!id) throw new Error('X post: no tweet id in response');
      return { xPostId: id, dryRun: false };
    }
    lastErr = `${res.status} ${await res.text()}`;
    // Retry transient throttle/server errors; fail fast on auth/validation (4xx).
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    break;
  }
  throw new Error(`X post failed: ${lastErr}`);
}
