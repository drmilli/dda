import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';
import { getMintInfo, getTokenLargestAccounts } from '../../lib/solana.js';

/**
 * Module 1 — On-Chain Verification (high confidence, only auto-post-cleared).
 * Authorities + holder concentration are read directly from Solana; on-chain
 * state can't be faked. Lock verification is marked inconclusive until a locker
 * integration (Streamflow) is wired. See docs/modules.md#module-1.
 */
export const m1OnChain: Module = {
  id: 'M1',
  applies: () => true,

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const evidenceUrl = `https://solscan.io/token/${project.mint}`;
    const out: CheckResult[] = [];

    ctx.emit({ kind: 'info', text: `Reading mint account ${project.mint.slice(0, 6)}… via RPC` });
    const mint = await getMintInfo(project.mint);
    const mintRef = await ctx.snapshot('mint-account', mint.raw, {
      endpoint: 'getAccountInfo',
      params: { mint: project.mint, encoding: 'jsonParsed' },
      fetchedAt: now(),
    });

    // Mint authority
    const mintActive = mint.mintAuthority != null;
    ctx.emit({
      kind: mintActive ? 'flag' : 'pass',
      text: `mint_authority = ${mintActive ? `ACTIVE (${mint.mintAuthority})` : 'renounced'}`,
    });
    out.push({
      module: 'M1',
      status: mintActive ? 'flagged' : 'confirmed',
      confidence: 'high',
      claim: mintActive
        ? `Mint authority is ACTIVE (${mint.mintAuthority}) — the deployer can mint unlimited additional supply.`
        : 'Mint authority is renounced — supply cannot be inflated.',
      evidence_url: evidenceUrl,
      raw_snapshot_ref: mintRef,
      checked_at: now(),
    });

    // Freeze authority
    const freezeActive = mint.freezeAuthority != null;
    ctx.emit({
      kind: freezeActive ? 'flag' : 'pass',
      text: `freeze_authority = ${freezeActive ? `ACTIVE (${mint.freezeAuthority})` : 'renounced'}`,
    });
    out.push({
      module: 'M1',
      status: freezeActive ? 'flagged' : 'confirmed',
      confidence: 'high',
      claim: freezeActive
        ? `Freeze authority is ACTIVE (${mint.freezeAuthority}) — holder token accounts can be frozen.`
        : 'Freeze authority is renounced — holder accounts cannot be frozen.',
      evidence_url: evidenceUrl,
      raw_snapshot_ref: mintRef,
      checked_at: now(),
    });

    // Holder concentration
    ctx.emit({ kind: 'info', text: 'Fetching largest token accounts…' });
    const largest = await getTokenLargestAccounts(project.mint);
    const holdersRef = await ctx.snapshot('largest-accounts', largest, {
      endpoint: 'getTokenLargestAccounts',
      params: { mint: project.mint },
      fetchedAt: now(),
    });
    const top1 = largest[0]?.uiAmount ?? 0;
    const top10 = largest.slice(0, 10).reduce((s, a) => s + a.uiAmount, 0);
    const top1Pct = mint.uiSupply > 0 ? (top1 / mint.uiSupply) * 100 : 0;
    const top10Pct = mint.uiSupply > 0 ? (top10 / mint.uiSupply) * 100 : 0;
    const concentrated = top1Pct > 25 || top10Pct > 70;
    ctx.emit({
      kind: concentrated ? 'flag' : 'pass',
      text: `holder concentration: top1 ${top1Pct.toFixed(1)}% · top10 ${top10Pct.toFixed(1)}%`,
    });
    out.push({
      module: 'M1',
      status: concentrated ? 'flagged' : 'confirmed',
      confidence: 'high',
      claim: `Top holder controls ${top1Pct.toFixed(1)}% of supply; the top 10 accounts control ${top10Pct.toFixed(1)}%.`,
      evidence_url: evidenceUrl,
      raw_snapshot_ref: holdersRef,
      checked_at: now(),
    });

    // Lock verification (not yet integrated with a locker program)
    const lockRef = await ctx.snapshot(
      'lock-check',
      { note: 'no locker integration configured', largestCount: largest.length },
      { endpoint: 'internal:lock-check', fetchedAt: now() },
    );
    out.push({
      module: 'M1',
      status: 'inconclusive',
      confidence: 'low',
      claim:
        'Liquidity-lock status was not automatically verified (Streamflow/locker integration pending) — confirm manually against any public lock claim.',
      evidence_url: evidenceUrl,
      raw_snapshot_ref: lockRef,
      checked_at: now(),
    });

    return out;
  },
};
