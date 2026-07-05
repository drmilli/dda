import { oauthHeader } from './oauth.js';
import type { XDataSource, XUser } from './source.js';
import type { ThirdPartyXSource } from './provider.js';

/**
 * Official X API v2 (OAuth 1.0a user context). Cheap owned/profile reads +
 * mentions search. Following-list checks delegate to the third-party provider.
 * All reads are metered — see docs/publisher.md §2.2 for the cost model.
 */
export class OfficialXSource implements XDataSource {
  readonly name = 'official';
  constructor(private provider: ThirdPartyXSource) {}

  async getUser(handle: string): Promise<XUser | null> {
    const h = handle.replace(/^@/, '');
    const url = `https://api.twitter.com/2/users/by/username/${encodeURIComponent(h)}?user.fields=created_at,public_metrics,verified`;
    const res = await fetch(url, { headers: { Authorization: oauthHeader('GET', url) } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        id: string;
        username: string;
        name: string;
        created_at?: string;
        verified?: boolean;
        public_metrics?: { followers_count?: number };
      };
    };
    const d = json.data;
    if (!d?.created_at) return null;
    return {
      id: d.id,
      username: d.username,
      name: d.name,
      createdAt: d.created_at,
      followers: d.public_metrics?.followers_count ?? 0,
      verified: d.verified ?? false,
    };
  }

  async hasMentioned(fromHandle: string, needle: string): Promise<boolean | null> {
    const from = fromHandle.replace(/^@/, '');
    const q = encodeURIComponent(`from:${from} ${needle}`);
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=10`;
    const res = await fetch(url, { headers: { Authorization: oauthHeader('GET', url) } });
    if (!res.ok) return null;
    const json = (await res.json()) as { meta?: { result_count?: number } };
    return (json.meta?.result_count ?? 0) > 0;
  }

  doesFollow(fromHandle: string, targetHandle: string): Promise<boolean | null> {
    // Self-serve follow endpoints were removed (April 2026) — delegate to provider.
    return this.provider.doesFollow(fromHandle, targetHandle);
  }
}
