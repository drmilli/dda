import { env } from './env.js';

/**
 * Resolves off-chain token metadata (name, description, socials) for triage
 * Stage B and Module 6. Uses the Helius DAS `getAsset` when a key is present,
 * then the off-chain JSON URI for socials; degrades gracefully to nulls.
 */
export interface TokenMetadata {
  name: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null; // handle, no leading @
  github: string | null;
  raw: unknown;
}

const empty = (raw: unknown = null): TokenMetadata => ({
  name: null,
  description: null,
  website: null,
  twitter: null,
  github: null,
  raw,
});

function extractGithub(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?/);
  return m ? m[0] : null;
}

function extractTwitterHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/);
  return m ? m[1]! : null;
}

export async function resolveMetadata(mint: string): Promise<TokenMetadata> {
  if (!env.HELIUS_API_KEY) return empty();
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    });
    if (!res.ok) return empty();
    const json = (await res.json()) as {
      result?: {
        content?: {
          metadata?: { name?: string; description?: string };
          links?: { external_url?: string };
          json_uri?: string;
        };
      };
    };
    const content = json.result?.content;
    let name = content?.metadata?.name ?? null;
    let description = content?.metadata?.description ?? null;
    let website = content?.links?.external_url ?? null;
    let twitter: string | null = null;

    // Off-chain JSON usually carries the socials for pump.fun tokens.
    if (content?.json_uri) {
      try {
        const off = (await (await fetch(content.json_uri)).json()) as Record<string, unknown>;
        name ??= (off.name as string) ?? null;
        description ??= (off.description as string) ?? null;
        website ??= (off.website as string) ?? null;
        twitter = extractTwitterHandle((off.twitter as string) ?? null) ?? twitter;
      } catch {
        /* ignore off-chain fetch errors */
      }
    }

    return {
      name,
      description,
      website,
      twitter,
      github: extractGithub(website) ?? extractGithub(description),
      raw: json.result ?? null,
    };
  } catch {
    return empty();
  }
}
