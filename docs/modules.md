# Verification Modules

Six independent modules. Each has its own rate limits, failure modes, and worker pool, and each
returns one or more structured `CheckResult` rows. **Modules produce all evidence; the LLM
produces none.**

## Module contract

Every module implements:

```ts
interface Module {
  id: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
  applies(project: Project): boolean;   // e.g. M2 only if github_url present
  run(project: Project, ctx: RunContext): Promise<CheckResult[]>;
}

interface RunContext {
  snapshot(module: string, name: string, raw: unknown, meta: SnapshotMeta): Promise<string>; // → raw_snapshot_ref
  emit(line: StreamLine): void;   // live terminal event
  reportId: string;
  budget: RateBudget;             // per-module token/request budget
}
```

### CheckResult (shared shape)

```ts
interface CheckResult {
  module: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
  status: 'confirmed' | 'flagged' | 'inconclusive' | 'not_applicable';
  confidence: 'high' | 'medium' | 'low';
  claim: string;            // falsifiable statement
  evidence_url: string;     // re-verification link
  raw_snapshot_ref: string; // blob pointer, captured at check time
  checked_at: string;       // ISO 8601
}
```

**Write-time guard:** the module SDK refuses to persist a non-`not_applicable` result unless
`snapshot()` returned a ref and `evidence_url` is set. This is invariant #1.

## Confidence gradient (the spine)

| Module | Confidence | Auto-post? |
| --- | --- | --- |
| M1 On-chain | **high** | ✅ Fully autonomous. |
| M2 GitHub | **high** | ✅ Objective, timestamped facts. |
| M3 X history | **high*** | ⚠ Hedged auto-post for objective facts only. |
| M4 KOL insider-supply | low→medium | ❌ Human queue always (names people). |
| M5 Product/site | low | ❌ Conclusions to human queue; flags "needs review." |
| M6 AI-copy heuristic | low | ❌ Signal only, never a posted accusation. |

`*` M3 is high-confidence in principle but carries a data-provider feasibility caveat (below).

---

## Module 1 — On-Chain Verification &nbsp;·&nbsp; high &nbsp;·&nbsp; build first

Checks directly against Solana; on-chain state can't be faked. **The only module cleared for
fully autonomous posting.**

- **Lock verification.** Query known locker programs (Streamflow SDK + clients for any locker the
  project names) for the mint. Compare actual locked amount / unlock date / beneficiary against
  the project's public claim.
- **Supply / authority state.** Total supply, mint-authority status, freeze-authority status,
  top-holder concentration — via Helius or direct RPC.

**Example CheckResults:** `mint_authority = ACTIVE (dev can mint unlimited)` → `flagged/high`;
`claimed "20% locked 12mo", on-chain locked = 0 SOL` → `flagged/high`.

**Failure modes:** RPC timeout / rate limit → retry with backoff; unknown locker program → emit
`inconclusive` for the lock check, never a false "not locked."

---

## Module 2 — GitHub Backdating Detection &nbsp;·&nbsp; high

Via GitHub REST API: repo creation timestamp, full commit list (author-date), push/event history
(Events API), contributor account-creation dates.

**Flags:**
- Claimed history spans months but push events cluster in a tight window → bulk-imported/backdated.
- All contributor accounts created around the same time as the repo.

**Example:** `repo created 2026-06-30, claims "8 months dev" — commits pushed in a single burst
on 2026-06-30` → `flagged/high`.

Under tech-only scope this is a **core** module — most qualifying projects claim a codebase, so a
backdated repo is a high-signal, safe-to-post finding (auto-post tier).

**Failure modes:** GitHub secondary rate limits → per-token budget + backoff; private/404 repo →
`inconclusive` (can't verify) with the claim recorded.

---

## Module 3 — X Account History & Affiliation &nbsp;·&nbsp; high &nbsp;·&nbsp; feasibility caveat

- **True age + rename history.** Use the **numeric user ID** (stable across renames), not the
  handle. Reconstruct rename history from Wayback Machine CDX snapshots. Flag recently-vacated
  handles re-squatted by unrelated projects riding old followers.
- **Affiliation cross-check.** If the project claims endorsement from `@X`, verify whether `@X`
  actually follows or has ever mentioned the project.

> **⚠ API caveat.** X's per-resource read metering + 2M/month read cap make large following-list
> pulls expensive, and self-serve follow/engagement endpoints were removed April 2026. All M3
> reads route through an **`XDataSource`** abstraction:
> - **(a) Official X API** — cheap owned/profile reads + posting.
> - **(b) Third-party read provider** (Sorsa / SociaVault / Netrows-class) — following-list &
>   historical reads.
>
> If cost/latency is prohibitive, **descope to mentions-only** (has `@X` ever mentioned the
> project — far cheaper) and mark full follow-verification a later enhancement. See
> [configuration.md](configuration.md) for the provider selector.

**Publish tier:** objective facts (account age, rename history) → hedged auto-post with templated
neutral phrasing. Anything implying deception → human queue.

---

## Module 4 — KOL Insider-Supply Cross-Reference &nbsp;·&nbsp; low→medium &nbsp;·&nbsp; ship last, human-gated

Cross-reference the project's top-holder wallets against the curated `kol_wallet` DB; flag a KOL
shilling a project who also received early/free supply without disclosure.

- No existing dataset — starts as a manually curated wallet-tag list (seeded from public cases),
  grows incrementally.
- Every finding labeled **"only as complete as the current wallet DB, not exhaustive."**
- **Never auto-posts.** Any output naming a person routes to the human review queue. **Highest
  legal risk in the system** — do not ship until the dispute mechanism and review queue are live
  (see [security-and-legal.md](security-and-legal.md)).

---

## Module 5 — Product/Site Functionality &nbsp;·&nbsp; low &nbsp;·&nbsp; now core

Crawl any claimed product/demo URL; check for a real interactive app (live UI state, real API
responses) vs. a static placeholder.

Because triage admits tech projects only, a claimed-but-fake product is one of the main things
we're here to catch — treat this as a **primary signal**, not an afterthought. It still flags
"needs manual review" more often than it asserts a firm verdict (automated functionality checks
are inherently fuzzy). Conclusions route to the human queue.

**Approach:** headless browser; heuristics on interactivity (does the app fetch real data, mutate
state, respond to input) vs. a static shell. **Screenshots** upload to Cloudinary as image
evidence (`putImage`); **DOM/network JSON** captures go to Cloudinary as raw snapshots via
`ctx.snapshot()`. Both are write-once and retained as part of the legal record.

---

## Module 6 — AI-Generated Copy Heuristic &nbsp;·&nbsp; low &nbsp;·&nbsp; signal only

Stylometric check on project copy: em-dash frequency, generic phrasing, sentence-structure
uniformity. Returns a **low-confidence signal only**, explicitly labeled weak/non-definitive.
False positives are common; never presented with the same weight as M1–M3, and **never a basis
for a posted accusation.**

---

## Orchestration notes

- Modules run in parallel per battery; each is a separate BullMQ queue with its own concurrency
  and rate-limit config, so one module's external-API stall never blocks the others.
- A module that exceeds its timeout yields `inconclusive` for its checks; the report still
  finalizes with whatever completed. Partial batteries are valid and versioned.
- `applies()` gates work: M2 skips if no `github_url`, M5 skips if no `website_url`, etc.
