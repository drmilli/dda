# Architecture

## Runtime topology

The system is a set of cooperating services communicating through a Redis-backed job queue
(BullMQ) and a shared Postgres database. External-facing surfaces (the site, the X publisher)
read from Postgres; they never call modules directly.

```
 Solana / Pump.fun
        │  (new-mint + graduation events)
        ▼
┌───────────────────┐      LaunchEvent      ┌───────────────────┐
│  INGESTION SVC    │ ────────────────────▶ │   TRIAGE SVC      │
│  Helius webhook / │      (queue)          │  Stage A → Stage B│
│  Geyser / RPC     │                       │  ~99% dropped     │
└───────────────────┘                       └─────────┬─────────┘
                                                       │ qualified target
                                                       ▼
                                        ┌──────────────────────────┐
                                        │   JOB ORCHESTRATOR        │
                                        │   BullMQ fan-out, one     │
                                        │   sub-job per module      │
                                        └──┬───┬───┬───┬───┬───┬────┘
                                           ▼   ▼   ▼   ▼   ▼   ▼
                                          M1  M2  M3  M4  M5  M6   (worker pool)
                                           └───┴───┴─┬─┴───┴───┘
                                                     ▼  CheckResult rows
                                        ┌──────────────────────────┐
                                        │  POSTGRES + CLOUDINARY    │
                                        │  results + raw snapshots  │
                                        └──────┬──────────────┬─────┘
                        emits live events      │              │  reads aggregated Report
                                ▼              ▼              ▼
                    ┌──────────────────┐              ┌──────────────────┐
                    │  TERMINAL SITE   │              │   PUBLISHER      │
                    │  SSE / WS stream │              │  tier routing +  │
                    │  + report archive│              │  X integration   │
                    └──────────────────┘              └──────────────────┘
```

## Services

| Service | Responsibility | Scaling axis |
| --- | --- | --- |
| **Ingestion** | Subscribe to Solana/Pump.fun events; normalize to `LaunchEvent`; enqueue. Stateless. | Event throughput (one primary + hot standby is enough). |
| **Triage** | Consume `LaunchEvent`; run Stage A (on-chain eligibility) then Stage B (tech-project classifier); drop or promote to a qualified target. | CPU-cheap; scale with launch volume. |
| **Orchestrator** | On a qualified target, fan out one BullMQ job per applicable module with per-module rate limits and failure isolation. | Number of concurrent batteries. |
| **Module workers** | Six independent worker types (M1–M6). Each does deterministic checks, writes `CheckResult` + raw snapshot, emits a live event per step. | Per-module: bottleneck is the external API each one hits. |
| **Aggregator** | When a battery completes (or a per-module timeout fires), assemble a `Report` version and invoke the LLM summary. | Low volume. |
| **Publisher** | Read the finished `Report`, route each finding by confidence tier, post to X or enqueue for human review. Rate-limited to the daily X ceiling. | Bounded by X posting cap. |
| **Web/API** | React front end + Node API: report archive, live SSE stream, manual submission bypass, dispute intake. | Read traffic. |

Services can be co-located in a single deployable at MVP; the boundaries above are logical, and
each maps to a distinct BullMQ queue so they can be split later without code changes.

## Data flow, end to end

1. **Ingest.** Ingestion receives a Helius webhook (or Geyser stream frame), extracts the mint,
   creator, launch timestamp, and initial liquidity, and emits a normalized `LaunchEvent` onto
   the `triage` queue.
2. **Triage.** Triage runs **Stage A** (age ≥ 1h, market cap ≥ $10k — pure on-chain reads, no
   paid API). Survivors run **Stage B** (tech-project classifier on launch metadata). Failures
   are written to a `triage_log` and dropped. Borderline Stage-A tokens (e.g. mcap near $10k)
   are re-queued on a timer so late-blooming tokens are re-evaluated.
3. **Orchestrate.** A qualified target creates a `Project` row (or updates an existing one) and
   a new `Report` version in `pending` state. The orchestrator fans out module jobs.
4. **Check.** Each module worker performs its deterministic checks, captures raw responses to
   Cloudinary, writes one or more `CheckResult` rows, and emits `stream.line` events keyed to the
   report version for the live terminal.
5. **Aggregate.** When all modules finish or time out, the aggregator finalizes the `Report`,
   invokes the LLM to write a human-readable summary **from the stored CheckResults only**, and
   marks the report `complete`.
6. **Publish.** The publisher reads the finished report, routes each finding by tier, and either
   auto-posts to X (with a link to the report version) or enqueues it for human review. Every post
   creates a `PublishEvent`.

## Why these boundaries

- **Queue between every stage** so a slow or failing external API (X read metering, GitHub rate
  limits) isolates to one module and never stalls ingestion or the site.
- **Postgres as the single source of truth** the site and publisher read from — neither ever
  triggers a module or trusts an in-flight result. A finding is publishable only once it is a
  persisted, snapshot-backed row.
- **LLM strictly downstream of persistence.** The summary step reads finalized rows; it cannot
  inject a claim that has no `raw_snapshot_ref`. See [modules.md](modules.md) and
  [publisher.md](publisher.md).

## Idempotency & re-runs

- A `(mint, trigger)` pair is deduplicated at ingestion so the same launch/graduation event
  doesn't spawn duplicate batteries.
- Re-running a project (manual "re-run" affordance or scheduled refresh) always creates a **new
  `Report` version**; prior versions and their snapshots are immutable. This is what makes every
  post link to exactly the evidence that existed at post time.
