import { solanaRpcUrl } from './env.js';

/**
 * Minimal Solana JSON-RPC client over fetch (no @solana/web3.js dependency).
 * Used by triage (supply/mcap) and Module 1 (authorities, holders).
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc<T>(method: string, params: unknown[], attempt = 0): Promise<T> {
  const res = await fetch(solanaRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  // Public endpoints throttle aggressively — back off and retry a few times.
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(300 * 2 ** attempt);
    return rpc<T>(method, params, attempt + 1);
  }
  if (!res.ok) throw new Error(`rpc ${method} http ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`rpc ${method}: ${json.error.message}`);
  return json.result as T;
}

export interface MintInfo {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supplyRaw: string;
  decimals: number;
  uiSupply: number;
  raw: unknown;
}

export async function getMintInfo(mint: string): Promise<MintInfo> {
  const result = await rpc<{
    value: { data: { parsed: { info: Record<string, unknown> } } } | null;
  }>('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  if (!result.value) throw new Error('mint account not found');
  const info = result.value.data.parsed.info as {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    supply: string;
    decimals: number;
  };
  const decimals = info.decimals;
  const uiSupply = Number(info.supply) / 10 ** decimals;
  return {
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    supplyRaw: info.supply,
    decimals,
    uiSupply,
    raw: result.value,
  };
}

export interface LargestAccount {
  address: string; // token account address
  uiAmount: number;
}

export async function getTokenLargestAccounts(mint: string): Promise<LargestAccount[]> {
  const result = await rpc<{ value: { address: string; uiAmount: number | null }[] }>(
    'getTokenLargestAccounts',
    [mint],
  );
  return result.value.map((v) => ({ address: v.address, uiAmount: v.uiAmount ?? 0 }));
}

/** Resolve the owner wallet behind a token account (for KOL cross-reference). */
export async function getTokenAccountOwner(tokenAccount: string): Promise<string | null> {
  const result = await rpc<{
    value: { data: { parsed: { info: { owner?: string } } } } | null;
  }>('getAccountInfo', [tokenAccount, { encoding: 'jsonParsed' }]);
  return result.value?.data.parsed.info.owner ?? null;
}
