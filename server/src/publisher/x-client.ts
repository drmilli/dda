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

const enc = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** OAuth 1.0a Authorization header for a JSON POST (body params are not signed). */
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
  return 'OAuth ' + Object.keys(all).sort().map((k) => `${enc(k)}="${enc(all[k as keyof typeof all]!)}"`).join(', ');
}

export async function postToX(text: string, reportUrl: string): Promise<XPostResult> {
  const body = `${text} ${reportUrl}`.trim();
  const hasCreds = Boolean(
    env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET,
  );

  if (env.PUBLISHER_DRY_RUN || !hasCreds) {
    logger.info({ body }, 'X post (dry-run)');
    return { xPostId: `dryrun-${Date.now()}`, dryRun: true };
  }

  const url = 'https://api.twitter.com/2/tweets';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: oauthHeader('POST', url), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: body }),
  });
  if (!res.ok) {
    throw new Error(`X post failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json.data?.id;
  if (!id) throw new Error('X post: no tweet id in response');
  return { xPostId: id, dryRun: false };
}
