# Build Sequence & Roadmap

Ordered by signal-per-legal-risk: ship the highest-signal, lowest-risk, fully-auto-postable
capability first; defer the person-naming, high-legal-risk module until the safety scaffolding is
live.

## Milestones

### 1. MVP — M1 + Ingestion + Triage + Evidence store + report page
The system can autonomously detect graduated tokens, verify locks/authorities, and produce a
sourced report. Highest signal, lowest legal risk, fully auto-postable.

**Done when:**
- Ingestion emits normalized `LaunchEvent`s from Helius (or fallback).
- Triage Stage A + Stage B drop ~99% and promote qualified targets; drops logged to `triage_log`.
- M1 writes snapshot-backed `CheckResult` rows for lock + supply/authority checks.
- A versioned report page renders claims, evidence URLs, and raw-snapshot downloads.

### 2. Terminal live-stream over the M1 pipeline
The brand surface — real deterministic `StreamLine` events over SSE, LLM out of the path.

**Done when:** an in-flight battery streams real check lines live, and the archive replays them.

### 3. Confidence-gated Publisher + X integration (M1 facts only)
The legal firewall goes live with the safest tier.

**Done when:** M1 auto-tier findings post to X (plain text + one report link), each producing a
`PublishEvent`; publisher respects the daily ceiling; overflow rolls over.

### 4. Module 2 — GitHub backdating
High-confidence, auto-postable. Core under tech-only scope.

### 5. Module 3 — X history
Behind the `XDataSource` abstraction. Start with age/rename (hedged auto-post); add affiliation
only if provider economics work. Ship mentions-only first; upgrade to full following-list later.

### 6. Modules 5 & 6 — product check + AI-copy heuristic
Low-confidence, clearly labeled, conclusions to the human queue, never posting accusations.

### 7. Module 4 — KOL insider-supply (LAST)
Highest legal risk. **Do not ship until the dispute mechanism and human review queue are already
live** (see [security-and-legal.md](security-and-legal.md)).

## Dependency graph

```
Ingestion ─┐
Triage ────┼─▶ M1 ─▶ Report page ─▶ Live stream ─▶ Publisher(M1) ─▶ M2 ─▶ M3 ─▶ M5/M6 ─┐
Evidence ──┘                                                                            │
                                    Dispute mechanism + Review queue ──────────────────┴─▶ M4
```

## Open decisions (must resolve before the dependent milestone)

| Decision | Blocks | Notes |
| --- | --- | --- |
| **"Tech project" scoring** — final signal list + pass threshold for Stage-B classifier. | MVP (triage). | One versioned config artifact decides the entire input pile. See [configuration.md](configuration.md). |
| **X data provider** — which third-party read provider; is the follow-check worth its cost vs. mentions-only at launch? | Milestone 5 (M3). | `M3.read_provider` + `M3.follow_check` config. |
| **Posting cadence** — daily ceiling target; tie-break when queue exceeds it (pure conviction rank vs. freshness-weighted). | Milestone 3 (Publisher). | `publisher.overflow_policy`. |
| **Human-review staffing** — who approves the gated queue; SLA before a held finding goes stale. | Milestone 7 (M4). | Until resolved, default to holding. |
| **X account tier / Enterprise access** — Premium+ confirmed; Enterprise read access only if M3 scales. | Milestone 3 / 5. | Unlikely at MVP. |

**Resolved:** Triage scope is fixed — tech projects only, market cap ≥ $10k, alive ≥ 1 hour. Only
the precise "tech project" scoring remains open.

## Facts to re-verify before budgeting (these move)

- Pump.fun ~21k launches/day, ~69% dead day-one, <2% graduate, ~100 graduations/day
  (CoinGecko / The Block, 2026).
- X API pay-per-use since Feb 2026; ~$0.015/plain post, ~$0.20/link post; ~50 posts/day cap for
  unverified since May 2026; follow/like/quote endpoints removed from self-serve April 2026;
  2M read/month cap (Postproxy / Blotato / Sorsa / SocialNexis, 2026).
