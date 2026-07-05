# Infrastructure & Operations

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Front end | React | SSE (default) or WebSocket for the live terminal. |
| Backend | Node.js | API + orchestration. All modules share one Node module SDK. |
| Queue | BullMQ on Redis | Async, rate-limited external calls, per-module failure isolation. |
| Database | Neon (serverless Postgres) | System of record. Standard Postgres wire protocol — schema in [data-model.md](data-model.md) is unchanged. |
| Evidence store | Cloudinary | All evidence, referenced by pointer (`secure_url`): raw non-image snapshots (JSON/HTML) as `resource_type: 'raw'` + image evidence (screenshots) as `'image'`. Legal record. |
| On-chain | Helius (webhooks + enhanced tx + RPC) | Geyser/Yellowstone gRPC for lower-latency firehose. |
| Locks | Streamflow SDK + clients per named locker | Module 1. |
| GitHub | REST API (repo, commits, Events, users) | Module 2. |
| X data | `XDataSource` → official API + third-party read provider | Posting account must be Premium+. |
| History | Wayback Machine CDX API | Module 3 rename history. |
| LLM | Any provider (Claude default) | Summary only, downstream of persistence. |

## Queue topology

One BullMQ queue per stage/module, each with independent concurrency and rate limits:

```
triage            → triage workers
orchestrate       → orchestrator (fan-out)
module:M1 … module:M6  → per-module worker pools (isolated rate limits)
aggregate         → report finalizer + LLM summary
publish           → publisher (globally rate-limited to daily X ceiling)
```

Failure in `module:M3` (e.g. X read cap hit) never blocks `module:M1` or ingestion. Per-module
retry/backoff is configured in [configuration.md](configuration.md).

## Scaling & bottlenecks

- **Ingestion** is I/O-light; one primary + hot standby handles the firehose. Dedup at ingest.
- **Triage** is the volume sink (~21k/day in, ~99% dropped). Stage A is pure on-chain reads —
  cheap; scale workers with launch volume.
- **Modules** scale independently; the real bottleneck is each external API's rate limit, not CPU.
  M3 is the most constrained (X read metering + 2M/month cap) — hence the read-provider abstraction
  and mentions-only fallback.
- **Publisher** is bounded by the daily X post ceiling, not compute. Overflow rolls to the next
  day, conviction-first.

## External cost controls

- **X reads** are metered and capped (2M/month). Route heavy reads through the third-party
  provider; keep official-API use to cheap owned/profile reads + posting.
- **X posts** ~$0.20/link post; daily ceiling in config; one link per post.
- **On-chain/RPC** bounded by triage (only qualified targets run the battery).
- Emit per-module cost/request counters to observability so budget drift is visible.

## Observability

- **Metrics:** launches ingested, triage pass rate (Stage A / Stage B), batteries run, per-module
  latency + error rate + external-request count, posts published vs. daily ceiling, review-queue
  depth + age.
- **Structured logs** per battery keyed by `report_id`; every dropped token in `triage_log`.
- **Alerts:** X read cap approaching, GitHub/RPC rate-limit saturation, review-queue SLA breach,
  publisher backlog exceeding daily ceiling for N days.

## Deployment

- MVP: services co-located in one deployable, split by BullMQ queue — can be broken into separate
  workers later without code change.
- Neon (Postgres) + managed Redis; Cloudinary for evidence, uploaded write-once
  (`overwrite: false`, per-report-version folders) since immutability of evidence is a legal
  requirement — see [security-and-legal.md](security-and-legal.md).
- Secrets via environment / secret manager, never committed.

### Neon specifics

- **Connection strings.** Use Neon's **pooled** connection string (PgBouncer) for the web/API tier
  and any short-lived/serverless invocations; use the **direct** (unpooled) string for long-lived
  BullMQ workers and for migrations. Keep both in env (`DATABASE_URL` pooled, `DATABASE_URL_DIRECT`
  unpooled).
- **Driver.** Standard Postgres clients work (`pg`/Prisma/Drizzle). For any edge/serverless
  function, use `@neondatabase/serverless` (HTTP/WebSocket driver); long-lived Node workers use the
  normal TCP driver.
- **Branching.** Use Neon branches for preview/staging environments and for testing migrations
  against a copy of prod without touching the legal-record data.

## Backups & durability

- Neon: retention/point-in-time restore configured to cover the legal record. The
  `report` / `check_result` / `publish_event` chain — losing it is not acceptable; set Neon's
  history-retention window accordingly and verify restore.
- Cloudinary: no auto-deletion/TTL on the evidence folder — assets referenced by a `check_result`
  are retained indefinitely. Uploads are write-once (`overwrite: false`). Consider Cloudinary's
  backup/replication option so the evidence store itself is not a single point of failure.
