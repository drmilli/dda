import type { CheckResult } from '../../types/index.js';
import type { Module, Project, RunContext } from '../module.js';
import { getTokenLargestAccounts, getTokenAccountOwner } from '../../lib/solana.js';
import { getKolWalletsByAddresses } from '../../db/repo.js';

/**
 * Module 4 — KOL Insider-Supply Cross-Reference (low→medium, human-gated).
 * Maps top token accounts → owner wallets → the curated kol_wallet DB. Any
 * finding that NAMES a person routes to the human review queue at the publisher
 * (never auto-posts). Highest legal risk. See docs/modules.md#module-4 and
 * docs/security-and-legal.md.
 */
export const m4Kol: Module = {
  id: 'M4',
  applies: () => true,

  async run(project: Project, ctx: RunContext): Promise<CheckResult[]> {
    const now = () => new Date().toISOString();
    const evidenceUrl = `https://solscan.io/token/${project.mint}#holders`;

    ctx.emit({ kind: 'info', text: 'Resolving top-holder owner wallets…' });
    const largest = (await getTokenLargestAccounts(project.mint)).slice(0, 10);
    const owners: string[] = [];
    for (const acct of largest) {
      const owner = await getTokenAccountOwner(acct.address);
      if (owner) owners.push(owner);
    }
    const uniqueOwners = [...new Set(owners)];
    const matches = await getKolWalletsByAddresses(uniqueOwners);

    const ref = await ctx.snapshot('kol-crossref', { owners: uniqueOwners, matches }, {
      endpoint: 'internal:kol-crossref', fetchedAt: now(),
    });

    if (matches.length === 0) {
      ctx.emit({ kind: 'info', text: 'no top-holder overlap with KOL wallet DB' });
      return [{
        module: 'M4', status: 'not_applicable', confidence: 'low',
        claim: 'No top-holder wallets matched the curated KOL wallet database (only as complete as the current DB, not exhaustive).',
        evidence_url: evidenceUrl, raw_snapshot_ref: ref, checked_at: now(),
      }];
    }

    ctx.emit({ kind: 'flag', text: `${matches.length} top holder(s) match known KOL wallets — routing to human review` });
    return matches.map((m) => ({
      module: 'M4' as const,
      status: 'flagged' as const,
      confidence: m.confidence,
      claim: `A top-holder wallet (${m.address}) is attributed to ${m.attributedIdentity} in the KOL database — possible undisclosed insider supply. Only as complete as the current wallet DB, not exhaustive.`,
      evidence_url: m.evidenceSource || evidenceUrl,
      raw_snapshot_ref: ref,
      checked_at: now(),
    }));
  },
};
