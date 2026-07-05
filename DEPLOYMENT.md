# Deployment — Vercel (frontend) + Render (backend) + Neon (DB)

Topology:

```
  Vercel (dda-web, static SPA)
        │  VITE_API_BASE_URL → https://dda-api.onrender.com
        ▼
  Render Web  (dda-api)  ──┐
  Render Worker (dda-workers) ── BullMQ ── Render Redis (dda-redis)
        │                    │
        └──────── Neon (Postgres, external) ───────┘
        └──────── Cloudinary (evidence, external) ─┘
```

---

## 1. Database — Neon (already set up)

- You have a Neon project. Get **two** connection strings:
  - `DATABASE_URL` — the **pooled** host (`...-pooler...`).
  - `DATABASE_URL_DIRECT` — the **direct** host (same string, remove `-pooler`). Used by migrations.
- Migrations run automatically on each backend deploy (`preDeployCommand: npm run db:migrate`).

> ⚠️ Rotate the Neon password that was shared in plaintext earlier, then use the new one below.

## 2. Backend — Render (Blueprint)

The repo ships [`server/render.yaml`](server/render.yaml). It provisions:
`dda-api` (web) + `dda-workers` (all workers in one process) + `dda-redis`.

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo. Render reads `server/render.yaml`.
3. On first apply, open the **dda-secrets** env group and fill:
   - `DATABASE_URL`, `DATABASE_URL_DIRECT` (Neon)
   - `PUBLIC_BASE_URL` = your Render web URL (e.g. `https://dda-api.onrender.com`)
   - `ALLOWED_ORIGINS` = your Vercel URL (e.g. `https://dda-web.vercel.app`)
   - `HELIUS_API_KEY`, `GITHUB_TOKEN`, `CLOUDINARY_URL`, `LLM_API_KEY` (as available)
   - `ADMIN_TOKEN`, `HELIUS_WEBHOOK_SECRET` are auto-generated — copy `ADMIN_TOKEN` for the admin UI.
   - Leave `PUBLISHER_DRY_RUN=true` until you're ready to post to X for real.
4. `REDIS_URL` is wired automatically from the `dda-redis` service.
5. Deploy. `dda-api` health-checks `/health`; `/ready` verifies Postgres + Redis.

**Scaling later:** split `dda-workers` into per-role services (`triage`, `orchestrator`,
`workers`, `aggregator`, `publisher`) using the individual `dist/entrypoints/*.js`. Keep
`publisher` at one instance (daily X ceiling).

## 3. Frontend — Vercel

The repo ships [`web/vercel.json`](web/vercel.json) (SPA rewrites + Vite preset).

1. Vercel → **New Project** → import the repo, set **Root Directory = `web`**.
2. Environment Variables → add `VITE_API_BASE_URL = https://dda-api.onrender.com`.
3. Deploy. Vercel builds the SPA; deep links resolve via the rewrite.
4. Copy the Vercel URL back into Render's `ALLOWED_ORIGINS` and redeploy the backend (CORS).

## 4. Ingestion (autonomous monitoring)

Point a Helius webhook (filtered to the Pump.fun program) at:

```
POST https://dda-api.onrender.com/ingest/helius
Authorization: Bearer <HELIUS_WEBHOOK_SECRET>
```

Or drive it manually from the site's submit bar (`POST /api/submit`).

## 5. X publishing (optional, off by default)

Posts stay **simulated** until you deliberately enable them.

1. Use a **Premium+** X account (raises the 50 posts/day cap; required for meaningful volume).
2. In the X developer portal, create an app with **Read and Write** permission and OAuth 1.0a
   user-context. Grab: API key/secret (consumer) + access token/secret (for the posting account).
3. Set `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` in the Render env group.
4. **Verify without posting:** `npm run x:verify` (or `GET /api/admin/x-status`) → confirms the
   authenticated handle and whether posting is live or dry-run.
5. Only then set `PUBLISHER_DRY_RUN=false`. The publisher auto-posts one link post per report for
   auto-tier on-chain/GitHub facts; everything person-naming stays in the human review queue.

> The write path (OAuth 1.0a signing, 280-char/​t.co length guard, transient retry) is implemented
> and self-tests via `x:verify`, but has **not** been exercised against a real account here —
> validate on a throwaway account first.
>
> **Reads** (Module 3): the official X API is now wired for real account age + numeric id (via the
> same OAuth 1.0a creds), with Wayback for rename/squat detection. Full follower-graph checks are
> gated behind the third-party provider seam (`X_READ_PROVIDER_KEY` + `M3.read_provider`), which is
> a stub until a provider is chosen — so affiliation stays mentions-only.

## 6. Smoke test after deploy

```bash
API=https://dda-api.onrender.com
curl $API/health                      # {"status":"ok"}
curl $API/ready                       # {"status":"ready","db":true,"redis":true}
curl -XPOST $API/api/submit -H 'content-type: application/json' \
  -d '{"mint":"<a-solana-mint>"}'     # → { report_id }
```

Then open the Vercel site → the report appears in the archive; open it live to watch the stream.

## Go-live checklist

- [ ] Neon password rotated; both URLs set (pooled + direct).
- [ ] `ALLOWED_ORIGINS` = exact Vercel origin (not `*`).
- [ ] `ADMIN_TOKEN` set (or the review queue is unusable — fails closed).
- [ ] `HELIUS_API_KEY` set (public RPC throttles holder reads).
- [ ] `CLOUDINARY_URL` set + `npm run evidence:verify` passes (else evidence uses ephemeral local disk on Render — lost on redeploy). Placeholder creds are rejected and fall back to local.
- [ ] `LLM_API_KEY` set + `npm run llm:verify` passes (else summaries use the deterministic template).
- [ ] `PUBLISHER_DRY_RUN=false` **only** after validating X OAuth on a test account.
- [ ] Helius webhook secret configured on both ends.
- [ ] Run one real battery end-to-end; confirm the live stream and a finalized report.

See [server/PRODUCTION.md](server/PRODUCTION.md) for the hardening details.
