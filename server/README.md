# dda-server

Backend for the Autonomous On-Chain Due-Diligence Agent — ingestion, triage, the six
verification modules, aggregation, the confidence-gated publisher, and the HTTP/SSE API.

**Stack:** Node.js 20+ · TypeScript (ESM) · Fastify · BullMQ (Redis) · Drizzle ORM ·
Neon (serverless Postgres) · Cloudinary (all evidence: raw snapshots + images) · pino · zod.

> Design docs live in the sibling `../docs/` folder. Start with
> [architecture](../docs/architecture.md), [data model](../docs/data-model.md), and
> [modules](../docs/modules.md).

## Layout

```
config/                     versioned runtime config artifacts (see docs/configuration.md)
  tech-project.v1.json      the artifact that decides the entire input pile
  triage.json  publisher.json  modules.json
src/
  lib/        env (zod-validated) + pino logger
  types/      shared domain types (LaunchEvent, CheckResult, StreamLine)
  db/         Drizzle schema (docs/data-model.md) + pooled/direct Neon clients
  queue/      BullMQ connection + one queue per stage/module
  config/     loader for the versioned config artifacts
  storage/    cloudinary.ts (client) + blob.ts (raw snapshots) + images.ts (image evidence)
  ingestion/  source abstraction (helius | geyser | rpc) → normalized LaunchEvent
  triage/     stage-a (eligibility) + stage-b (tech-project) + processor
  orchestrator/  fans out one module job per applicable module
  modules/    module.ts contract + m1..m6 + registry
  aggregator/ finalize report + LLM summary (downstream of persistence only)
  publisher/  routing.ts (legal firewall) + x-client + service
  api/        Fastify server + routes (reports, stream, submit, disputes, admin)
  entrypoints/  one process per service (web, ingestion, triage, orchestrator, workers, aggregator, publisher)
```

## Services (one deployable, split by BullMQ queue)

Per [infrastructure.md](../docs/infrastructure.md), services are co-located at MVP and split by
queue — each has its own entrypoint and can be scaled/separated later without code changes:

| Entrypoint | Role |
| --- | --- |
| `web` | Fastify HTTP + SSE API. |
| `ingestion` | Solana/Pump.fun feed → `LaunchEvent` → triage queue. |
| `triage` | Stage A/B gate; drops ~99%, promotes qualified targets. |
| `orchestrator` | Fan out module jobs for a qualified target. |
| `workers` | One BullMQ Worker per module (M1–M6), per-module concurrency. |
| `aggregator` | Finalize report + LLM summary → publish queue. |
| `publisher` | Tier-route findings; auto-post or human-queue; rate-limited to daily X ceiling. |

## Getting started

```bash
cp .env.example .env         # fill in Neon (required) + optional keys
npm install
docker compose up -d         # local Redis for BullMQ (Neon is cloud)
npm run db:migrate           # apply migrations to Neon (uses DATABASE_URL_DIRECT)

# run every service in one terminal:
npm run dev:all
# …or individually: dev:web dev:ingestion dev:triage dev:orchestrator dev:workers dev:aggregator dev:publisher
```

Requires a reachable **Redis** (BullMQ) and a **Neon** database. Use the pooled connection string
for `DATABASE_URL` and the direct/unpooled host (no `-pooler`) for `DATABASE_URL_DIRECT`
(see [Neon specifics](../docs/infrastructure.md#neon-specifics)).

### Drive it

```bash
# Manual submission (skips triage, runs the full battery):
curl -XPOST localhost:3000/api/submit -H 'content-type: application/json' \
  -d '{"mint":"<solana-mint>"}'
# → { report_id }.  Watch it live:
curl -N localhost:3000/api/stream/<report_id>
# Read the finished report:
curl localhost:3000/api/reports/<project_id>
# Simulate a launch event into triage:
curl -XPOST localhost:3000/ingest/helius -H 'content-type: application/json' \
  -d '{"mint":"<solana-mint>","trigger":"graduation"}'
```

## What works vs. what needs keys

Everything is implemented and typechecks/builds; integrations degrade gracefully when a key is
absent (they emit `inconclusive`, never crash).

| Area | Status |
| --- | --- |
| Ingestion webhook → triage → orchestrator → workers → aggregator → publisher | Wired end-to-end over BullMQ. |
| DB persistence (Neon/Drizzle), evidence invariant, versioned reports | Working (verified against Neon). |
| Live SSE stream (Redis pub/sub) | Working. |
| M1 on-chain (authorities, holders, concentration) | Real RPC; **needs `HELIUS_API_KEY`** (public RPC throttles `getTokenLargestAccounts`). |
| M2 GitHub, M3 Wayback, M5 site crawl, M6 stylometry | Real `fetch`; M2 uses `GITHUB_TOKEN` for rate limits. |
| M4 KOL cross-reference | Real; only fires when `kol_wallet` has rows. |
| Triage Stage A/B | Real (on-chain mcap + Helius metadata for tech-signal scoring). |
| Evidence store | Cloudinary (signed REST) if configured, else local `./.evidence` fallback. |
| LLM summary | Anthropic via `fetch` if `LLM_API_KEY`, else deterministic template. |
| X publishing | **Dry-run by default** (`PUBLISHER_DRY_RUN`); live OAuth posting intentionally not wired. |

See the [roadmap](../docs/roadmap.md) for sequencing and **[PRODUCTION.md](PRODUCTION.md)** for
the production-readiness checklist (hardening done, env to configure, what to verify before launch).

## Production hardening

Graceful shutdown (drains in-flight jobs), queue retry/backoff + bounded DLQ, admin bearer-auth
(fail-closed), Redis rate limiting on public writes, webhook secret verification, safe error
handler, env-scoped CORS, `/health` + `/ready` probes, and a non-root multi-stage `Dockerfile`.
Details in [PRODUCTION.md](PRODUCTION.md).
