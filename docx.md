# Engineering Brief — Autonomous On-Chain Due-Diligence Agent

> **Status:** Draft for engineering review
> **Owner:** [you]
> **Last updated:** July 2026

---

## 1. What this is (and what changed)

We are building an autonomous agent that monitors new token launches on Solana (primarily Pump.fun), runs a battery of mechanical, evidence-based verification checks against the ones that gain real traction, reasons about them in public on a terminal-style website, and publishes evidence-backed verdicts to an X (Twitter) account.

This is a shift from the earlier concept of an on-demand submission tool (user pastes a contract address → gets a report). That submission flow still exists as a secondary entry point, but the primary driver is now **autonomous monitoring**: the agent decides what to test, tests it, and posts, with no human in the loop for the safe cases.

**Core principle (unchanged and non-negotiable):** every published finding must be falsifiable and sourced. We never emit an opaque "trust score" or a "safe to buy" verdict — only specific claims, each paired with a specific evidence source (URL, timestamp, raw on-chain/API snapshot). This is what makes the output credible and legally defensible instead of just another opinion.

**Three product surfaces:**

- **The agent** — the always-on backend that ingests, triages, tests, and publishes.
- **The terminal site** — a live, streaming "watch it think" interface where each check runs visibly, plus a persistent archive of every report.
- **The X account** — where high-conviction verdicts are auto-posted, each linking back to its on-site report.

---

## 2. Reality constraints that shaped this design

These are load-bearing. The architecture below exists to accommodate them; do not design around them without re-checking the numbers.

### 2.1 Launch volume is enormous and mostly noise

Pump.fun has averaged more than 21,000 new token launches per day over 2024–2026. ~69% of tokens never trade again after their first day, and fewer than 2% ever graduate to an external DEX (Raydium). Roughly ~100 tokens graduate per day across the ecosystem.

**Implication:** we physically cannot, and should not, run six modules against every launch. A report on a token that died in six minutes is worthless. We gate hard (see §5, Triage). With our confirmed scope filters — tech projects only, market cap ≥ $10k, alive ≥ 1 hour — the qualifying set collapses from ~21,000/day to an estimated dozens–low hundreds/day, which matches our X posting ceiling and keeps external-API costs bounded.

> _Sources: CoinGecko 18.67M-token study (mid-2026); The Block launchpad data._

### 2.2 X publishing is capped and metered — by design, this helps us

- X moved to pay-per-use API pricing in Feb 2026; no free tier for new developers.
- **Post writes:** ~$0.015 for a plain/media post, ~$0.20 for any post containing a URL (as of the April 20, 2026 update).
- **Reads:** ~$0.005 per post read, ~$0.010 per user-resource (profile/follower), ~$0.001 for owned reads; hard cap of 2M post reads/month on pay-per-use.
- **Posting cap:** unverified accounts were cut to 50 original posts/day (from 2,400) in May 2026. Premium/Premium+ raise this; the account we post from should be Premium+.
- **April 20, 2026:** follow / like / quote-post write endpoints were removed from all self-serve tiers (Enterprise-only now). We don't need to write those actions, but it matters for reads (see §6, Module 3).

**Implication:** the agent is throttled to at most a few dozen posts/day. That's fine — it forces high-conviction-only posting, which is exactly the confidence discipline we want. Post format = plain-text verdict + exactly one link to the on-site report (never a thread of links; each link post is metered).

> _Sources: Postproxy, Blotato, Sorsa, SocialNexis X-API pricing/rate-limit breakdowns (2026)._

### 2.3 Legal exposure scales with autonomy

Auto-publishing named claims about people (especially Module 4, KOL insider supply) is defamation-adjacent if any attribution is wrong. On-chain facts are provable and safe to auto-post. Interpretive or accusatory claims are not. This is why confidence tiers must **gate the publisher, not just decorate the report** (see §7 and §11).

---

## 3. Design principles

- **Evidence or it didn't happen.** No finding ships without a retrievable source + a raw snapshot stored at check time.
- **Confidence gradient is the spine.** Modules 1–3 (on-chain, GitHub, X-history) are high-confidence. Modules 4–6 (KOL DB, product check, AI-copy heuristic) are explicitly weaker and must be visually and programmatically marked as such — and must never auto-post a naming accusation.
- **Deterministic core, narrative shell.** The checks are deterministic code with structured outputs. The LLM only narrates and summarizes already-verified results — it never produces evidence, and its output is gated before publication.
- **Throttle is a feature.** Because we can only post a little, we only post what's airtight.
- **Every report is a point-in-time snapshot.** Re-running later can change results (locks unlock, history mutates). Reports are versioned, never overwritten.

---

## 4. System architecture

```
                ┌─────────────────────────────────────────────┐
                │            INGESTION / FIREHOSE              │
                │  Solana/Pump.fun new-mint + graduation feed  │
                │  (Helius webhooks / Geyser / on-chain logs)  │
                └───────────────────────┬─────────────────────┘
                                        │  raw launch events
                                        ▼
                ┌─────────────────────────────────────────────┐
                │                  TRIAGE GATE                 │
                │  Cheap filters: does this token deserve the  │
                │  full battery? (graduation, holders, mcap,   │
                │  KOL attention). ~99% dropped here.          │
                └───────────────────────┬─────────────────────┘
                                        │  qualified targets
                                        ▼
                ┌─────────────────────────────────────────────┐
                │              JOB ORCHESTRATOR                │
                │   BullMQ (Redis) — fans out per module,      │
                │   per-module rate limits + failure isolation │
                └───┬───────┬───────┬───────┬───────┬──────┬───┘
                    ▼       ▼       ▼       ▼       ▼      ▼
                 ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐ ┌────┐
                 │ M1 │  │ M2 │  │ M3 │  │ M4 │  │ M5 │ │ M6 │
                 │chain│ │ GH │  │ X  │  │KOL │  │site│ │copy│
                 └──┬─┘  └──┬─┘  └──┬─┘  └──┬─┘  └──┬─┘ └──┬─┘
                    └───────┴───────┴───┬───┴───────┴──────┘
                                        ▼
                ┌─────────────────────────────────────────────┐
                │        EVIDENCE STORE + RESULTS (Postgres)   │
                │  CheckResult rows w/ raw snapshots (S3/blob) │
                └───────────────────┬─────────────────────────┘
                      │                          │
                      ▼                          ▼
          ┌───────────────────────┐   ┌──────────────────────────┐
          │  TERMINAL SITE (live  │   │   CONFIDENCE-GATED        │
          │  stream + archive)    │   │   PUBLISHER               │
          │  SSE/WebSocket        │   │  - auto-post (on-chain)   │
          └───────────────────────┘   │  - human queue (accusatory)│
                                      │  - X post = verdict + link │
                                      └──────────────────────────┘
```

**New vs. the original spec:** the Ingestion/Firehose, Triage Gate, Terminal live-stream, and Confidence-Gated Publisher are all new layers required by the autonomous pivot. The six modules, evidence store, and data model carry over.

---

## 5. Ingestion & Triage (NEW — build alongside Module 1)

### 5.1 Ingestion

Subscribe to new-mint and graduation events on Solana. Options, in order of preference:

1. **Helius webhooks / enhanced transactions** filtered to the Pump.fun program(s) — lowest ops burden.
2. **Geyser / Yellowstone gRPC stream** if we need lower latency / higher throughput.
3. **Direct RPC log subscription** as fallback.

Emit a normalized `LaunchEvent { mint, creator, launch_ts, source, initial_liquidity }` onto an internal queue.

### 5.2 Triage gate — this is what makes the system viable

A token qualifies for the full battery only if it clears all three confirmed filters. Run them cheapest-first so we spend as little as possible rejecting the ~99% that don't qualify:

**Stage A — Eligibility** (cheap, pure on-chain reads, no external cost):

- Age ≥ 1 hour since launch. (Kills instant-death tokens — ~69% never trade past day one.)
- Market cap ≥ $10,000. (Price × circulating supply from on-chain data.)

Anything failing A is logged and dropped immediately. Poll or re-evaluate borderline tokens on a timer so a coin that crosses $10k at hour 3 still gets picked up.

**Stage B — Tech-project classification** (cheap heuristic, runs only on tokens that passed A):

A token must look like a tech project to proceed — this is what makes Modules 2 and 5 worth running. Classify using cheap signals already in the launch metadata, before committing to the full investigation:

- Has a GitHub org/repo link.
- Has a real website (not just a linktree / social aggregator).
- Launch copy / bio uses product-or-tech language (e.g. "protocol," "SDK," "AI agent," "testnet," "mainnet," "API," "infra") rather than pure meme.

Score these signals; require a minimum to pass. Ambiguous cases can be logged for manual spot-check to tune the classifier over time. The precise definition of "tech project" is a config artifact the team owns — it decides the entire input pile, so it should be explicit and versioned, not hardcoded.

**Bypass:** manual submissions via the site skip triage and always run the full battery.

Everything failing A or B is logged and dropped. Expected qualifying volume: dozens–low hundreds/day. All thresholds ($10k, 1hr, tech-signal cutoff) live in config so we can tune volume vs. X posting budget.

> **Note:** "alive ≥ 1 hour" means _worth investigating_, not _safe_. Plenty of rugs happen after hour one. The filter selects what to look at; it never implies a clean result. Reports and posts must never let the threshold read as a safety signal.

---

## 6. The six verification modules

Each module runs independently, has its own rate limits and failure modes, and returns a structured result:

```
CheckResult {
  module: enum,
  status: confirmed | flagged | inconclusive | not_applicable,
  confidence: high | medium | low,
  claim: string,              // the falsifiable statement
  evidence_url: string,       // where anyone can re-verify
  raw_snapshot_ref: string,   // blob store pointer to captured raw data
  checked_at: timestamp
}
```

### Module 1 — On-Chain Verification &nbsp;·&nbsp; confidence: high &nbsp;·&nbsp; **build first**

Checks two things directly against Solana:

- **Lock verification:** query known locker programs (Streamflow + any locker the project names) for the mint; compare actual locked amount / unlock date / beneficiary against the project's public claim.
- **Supply/authority state:** total supply, mint-authority and freeze-authority status, top-holder concentration — via Helius or direct RPC.

Most reliable module; on-chain state can't be faked. This is the foundation and the only module cleared for fully autonomous posting without review.

### Module 2 — GitHub Backdating Detection &nbsp;·&nbsp; confidence: high

Via GitHub REST API: repo creation timestamp, full commit list (author-date), push/event history (Events API), contributor account-creation dates. Flags:

- Claimed history spans months but push events cluster in a tight window → bulk-imported/backdated.
- All contributor accounts created around the same time as the repo.

Output example: _"repo created [date], claims [N] months of history — commits pushed in a single burst on [date]."_

Under tech-only scope this is a core module: most qualifying projects will claim a codebase, so a faked/backdated repo is one of our highest-signal, safest-to-post findings (it's on the auto-post tier — objective, timestamped, falsifiable).

### Module 3 — X Account History & Affiliation &nbsp;·&nbsp; confidence: high &nbsp;·&nbsp; feasibility caveat

Two checks:

- **True age + rename history:** use the numeric user ID (stable across renames), not the handle. Reconstruct rename history from Wayback Machine CDX snapshots. Flag recently-vacated handles re-squatted by unrelated projects riding old followers.
- **Affiliation cross-check:** if the project claims endorsement/partnership from @X, verify whether @X actually follows or has ever mentioned the project.

> **⚠ API caveat (see §2.2):** the official X API's per-resource read metering and the 2M/month read cap make pulling large following-lists expensive and rate-limited, and self-serve follow/engagement endpoints were removed in April 2026. Route Module 3 reads through an abstracted `XDataSource` interface with (a) official API for cheap owned/profile reads and (b) a third-party read provider (Sorsa / SociaVault / Netrows-class) for following-list and historical reads. If cost/latency is prohibitive, descope the follow-check to mentions-only (has @X ever mentioned the project) which is far cheaper, and mark full follow-verification as a later enhancement.

### Module 4 — KOL Insider-Supply Cross-Reference &nbsp;·&nbsp; confidence: low→medium &nbsp;·&nbsp; **ship later, human-gated**

Cross-reference the project's top-holder wallets against a maintained DB of known KOL/influencer wallets; flag a KOL shilling a project who also received early/free supply without disclosure.

- No existing dataset — starts as a manually curated wallet-tag list (seeded from already-public cases) and grows incrementally.
- Must be labeled "only as complete as the current wallet DB, not exhaustive."
- This module's findings **never auto-post.** Any output that names a person routes to the human review queue (§7, §11). Highest legal risk in the system.

### Module 5 — Product/Site Functionality &nbsp;·&nbsp; confidence: low &nbsp;·&nbsp; now core (tech-only scope)

Crawl any claimed product/demo URL; check for a real interactive app (live UI state, real API responses) vs. a static placeholder.

> **Note:** because triage now admits tech projects only, this module is no longer a rare edge case — a claimed-but-fake product is one of the main things we're here to catch. It still flags "needs manual review" more often than it asserts a firm verdict (automated functionality checks are inherently fuzzy), but it should be treated as a primary signal for this audience, not an afterthought.

### Module 6 — AI-Generated Copy Heuristic &nbsp;·&nbsp; confidence: low &nbsp;·&nbsp; signal only

Stylometric check on project copy (em-dash frequency, generic phrasing, sentence-structure uniformity). Returns a low-confidence signal only, explicitly labeled weak/non-definitive. False positives are common; never presented with the same weight as Modules 1–3. Never a basis for a posted accusation.

---

## 7. The Publisher (NEW — the legal firewall)

The publisher decides what leaves the building. It reads the aggregated Report and routes by confidence tier:

| Tier | Example findings | Action |
| --- | --- | --- |
| **Auto-post** | On-chain facts (M1): mint authority not renounced, lock mismatch, supply concentration. GitHub facts (M2): repo age vs. claim. | Published to X automatically, plain-text verdict + one link to report. |
| **Auto-post w/ hedge language** | X account age/rename (M3) where the fact is objective. | Auto-post, but templated neutral phrasing ("X claims Y; on-chain/records show Z"). |
| **Human review queue** | Anything naming a person, any Module 4 KOL claim, any "scam"/intent assertion, any M5/M6-driven conclusion. | Held. A human approves/edits before it can post. |

**Rules:**

- Never assert intent ("this is a rugpull") autonomously — state the falsifiable fact ("mint authority is active; dev can mint unlimited supply").
- Every post links to the immutable, versioned report page.
- Posts are plain-text + single link to keep within the $0.20/link-post metering and the daily post cap.
- Rate-limit the publisher to stay under the account's daily X ceiling; queue overflow rolls to next day, highest-conviction first.

---

## 8. The Terminal Site (NEW)

Two views:

**Live stream ("watch it think").** As a qualified target runs, stream each module's real steps to the browser over SSE/WebSocket:

```
[M1] Querying Streamflow for mint 7xK...9fB
[M1]   locked = 0 SOL  |  claimed = "20% locked 12mo"  →  MISMATCH ✗
[M1] mint_authority = ACTIVE  (dev can mint unlimited)  ✗
[M2] repo created 2026-06-30  |  claims "8 months dev"  →  FLAG ✗
```

**Critical:** every streamed line is a real deterministic check output, not LLM narration. The terminal renders the structured `CheckResult` stream. A hallucinated line here is a published false statement — so the LLM is not in this path. The LLM only writes the human-readable summary at the end, from already-verified results, and that summary is subject to the same publisher gate as X posts.

**Archive.** Every report is a permanent, versioned, shareable page — this is the link every X post points to. Includes claim + status + evidence URL + raw-snapshot download for each check, plus the timestamp and a "re-run" affordance.

**Aesthetic:** terminal / monospace, v0-style. That's fine and on-brand — just keep the deterministic evidence visually distinct from any narrative summary so readers can tell facts from framing.

---

## 9. Data model

- **Project** — submission/launch inputs (mint, X handle, GitHub, site), timestamps, discovery source (triage vs. manual).
- **CheckResult** — module, status, confidence, claim, evidence_url, raw_snapshot_ref, checked_at.
- **KOLWallet** — address, attributed identity, evidence source, confidence. (Curated; append-only with provenance.)
- **Report** — aggregates all CheckResults for a Project at a point in time; versioned (re-runs create new versions, never overwrite).
- **PublishEvent** — what was posted, where, when, which report version, approver (if human-gated), X post ID.

The PublishEvent + versioned Report + raw_snapshot_ref chain is the legal record: for any public claim we can show exactly what evidence existed at post time.

---

## 10. Tech stack

- **Frontend:** Next.js / React. SSE or WebSocket for the live terminal stream.
- **Backend:** Node.js or Python for API + orchestration.
- **Queue:** BullMQ on Redis — async, rate-limited external calls, per-module isolation.
- **DB:** Postgres. Raw snapshots in S3-class blob storage (referenced by pointer).
- **On-chain:** Helius (webhooks + enhanced tx + RPC) or direct Solana RPC. Geyser/Yellowstone gRPC if we need the firehose at lower latency.
- **Locks:** Streamflow SDK + clients for any other named locker.
- **GitHub:** REST API (repo, commits, Events API, users).
- **X data:** `XDataSource` abstraction → official X API (owned/cheap reads, posting) + third-party read provider (Sorsa/SociaVault/Netrows-class) for following-lists and historical reads. Posting account should be Premium+.
- **History:** Wayback Machine CDX API.

---

## 11. Legal & safety guardrails

- **Evidence retention:** store the raw snapshot for every claim at check time. If a claim is ever disputed, we can show what we saw and when.
- **No intent assertions autonomously:** publish falsifiable facts, not conclusions about motive.
- **Human gate for named accusations:** Module 4 and anything naming a person cannot auto-post. Non-negotiable.
- **Dispute mechanism:** a public path for a project/person to contest a finding, plus an internal process to re-run, correct, and (if wrong) retract with a visible correction. Build this before Module 4 ships.
- **Provenance on KOL attributions:** every KOLWallet row carries its evidence source and confidence; low-confidence attributions never drive a public post.
- **Disclaimers:** "Not investment advice" + "point-in-time" on every report and the site.

---

## 12. Build sequence

1. **M1 (on-chain) + Ingestion + Triage + Evidence store + report page.** This is the MVP: it can autonomously detect graduated tokens, verify locks/authorities, and produce a sourced report. Highest signal, lowest legal risk, fully auto-postable.
2. **Terminal live-stream** over the M1 pipeline (the brand surface).
3. **Confidence-gated Publisher + X integration** (start with M1 facts only).
4. **M2 (GitHub).**
5. **M3 (X history)** — behind the `XDataSource` abstraction; start with age/rename, add affiliation if provider economics work.
6. **M5, M6** — low-confidence, clearly labeled, never posting accusations.
7. **M4 (KOL DB)** — last, with the dispute mechanism and human review queue already live.

---

## 13. Open decisions for the team

- **Resolved:** Triage is fixed — tech projects only, market cap ≥ $10k, alive ≥ 1 hour (see §5.2). The remaining sub-question is the precise scoring for "tech project."
- **"Tech project" definition:** finalize the signal list and pass threshold for the Stage-B classifier. This one config artifact decides the entire input pile — own it explicitly and version it.
- **X data provider:** which third-party read provider for Module 3, and is the follow-check worth its cost vs. mentions-only at launch?
- **Posting cadence:** what daily post ceiling do we target, and what's the tie-break when the queue exceeds it (pure confidence rank, or freshness-weighted)?
- **Human-review staffing:** who approves the gated queue, and what's the SLA before a held finding goes stale?
- **Account setup:** Verified/Premium+ account, and whether we need Enterprise X access for any read volume (unlikely at MVP, possible if Module 3 scales).

---

## Appendix — external facts cited

_Verify before budgeting; these move._

- Pump.fun ~21k launches/day, ~69% dead day-one, <2% graduate, ~100 graduations/day (CoinGecko/The Block, 2026).
- X API pay-per-use since Feb 2026; ~$0.015/plain post, ~$0.20/link post; ~50 posts/day cap for unverified since May 2026; follow/like/quote endpoints removed from self-serve April 2026; 2M read/month cap (Postproxy/Blotato/Sorsa/SocialNexis, 2026).
