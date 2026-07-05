# Production readiness

What's hardened, what to configure, and what to verify before going live.

## Hardened in code

- **Graceful shutdown** — SIGTERM/SIGINT close the HTTP server, drain in-flight
  BullMQ jobs (`worker.close()`), and end the Postgres pools + Redis (15s cap).
- **Queue resilience** — every job: 3 attempts, exponential backoff; completed jobs
  trimmed; failed jobs retained (bounded) as a lightweight DLQ. Worker `failed`/`error`
  events are logged.
- **Admin auth** — `/api/admin/*` require `Authorization: Bearer $ADMIN_TOKEN`,
  constant-time compare, **fail closed** if unset.
- **Rate limiting** — Redis fixed-window per-IP on `/api/submit`, `/api/disputes`,
  `/ingest/helius` (protects the paid module/X budget). Fails open if Redis is down.
- **Webhook auth** — `/ingest/helius` verifies `HELIUS_WEBHOOK_SECRET` when set.
- **Error handling** — global handler logs 5xx internally, returns a safe shape (no
  stack/internal leakage). `unhandledRejection` / `uncaughtException` captured.
- **CORS** — scoped to `ALLOWED_ORIGINS` (set explicitly in prod; `*` warns).
- **Body limit**, `trustProxy` for correct client IPs behind a load balancer.
- **Probes** — `/health` (liveness), `/ready` (checks Postgres + Redis, 503 if degraded).
- **Evidence invariant** — enforced by a DB CHECK constraint *and* the runner’s normalize step.
- **Container** — multi-stage `Dockerfile`, runs as non-root `node`, healthcheck baked in.

## Must configure before production

| Var | Why |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_DIRECT` | Neon pooled + direct (no `-pooler`) hosts. |
| `REDIS_URL` | Managed Redis. |
| `ADMIN_TOKEN` | Or the review queue is unusable (fails closed). |
| `ALLOWED_ORIGINS` | Lock CORS to the site origin(s). |
| `HELIUS_API_KEY` / `SOLANA_RPC_URL` | Public RPC throttles holder reads (429). |
| `GITHUB_TOKEN` | GitHub rate limits without it. |
| `CLOUDINARY_URL` | Otherwise evidence uses the local `./.evidence` fallback. |
| `LLM_API_KEY` | Otherwise summaries use the deterministic template. |
| `HELIUS_WEBHOOK_SECRET` | Authenticate the ingestion webhook. |
| `PUBLISHER_DRY_RUN=false` + `X_*` | Only when ready to post for real (Premium+ account). |

## Deploy topology

One image, one process per role (scale independently):

```
web         node dist/entrypoints/web.js          # API + SSE (behind LB)
triage      node dist/entrypoints/triage.js
orchestrator node dist/entrypoints/orchestrator.js
workers     node dist/entrypoints/workers.js      # M1–M6
aggregator  node dist/entrypoints/aggregator.js
publisher   node dist/entrypoints/publisher.js    # keep at 1 replica (daily X ceiling)
```

Run `npm run db:migrate` once per deploy (uses `DATABASE_URL_DIRECT`).

## Still open (verify / decide before launch)

- [ ] **Run one real battery end-to-end** through Redis (not yet observed live —
      no Redis in the build env). `POST /api/submit` → watch `/api/stream/:id` → report.
- [ ] **X live posting** path is implemented (OAuth 1.0a) but **untested with real
      credentials** — validate against a test account before enabling.
- [ ] **Helius webhook parsing** is best-effort; confirm against real Helius payloads
      and set the webhook filter to the Pump.fun program(s).
- [ ] **M1 lock verification** returns `inconclusive` — wire Streamflow for a real lock check.
- [ ] **Metrics** — logs are structured; add a Prometheus/OTel exporter for dashboards.
- [ ] **Secrets** — rotate anything ever committed; load from a secret manager, not `.env`.
- [ ] **Evidence retention** — ensure Cloudinary has no auto-delete/TTL on the evidence folder.
