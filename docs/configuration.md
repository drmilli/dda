# Configuration

All thresholds live in config so volume can be tuned against the X posting budget without code
changes. Two classes: **runtime config** (versioned artifacts, especially the tech-project
definition) and **secrets/env** (credentials, endpoints).

## The tech-project definition (versioned artifact)

> This single artifact decides the entire input pile. **Own it explicitly and version it** — do
> not hardcode. It is the #1 open decision (see [roadmap.md](roadmap.md)).

Proposed shape (`config/tech-project.v{N}.json`):

```json
{
  "version": 1,
  "signals": [
    { "key": "has_github",   "weight": 2 },
    { "key": "has_website",  "weight": 2, "exclude": ["linktr.ee", "beacons.ai", "linkin.bio"] },
    { "key": "tech_language","weight": 1, "per_hit": true, "cap": 3,
      "terms": ["protocol","SDK","AI agent","testnet","mainnet","API","infra"] }
  ],
  "pass_threshold": 3
}
```

- Each triage evaluation records which config `version` it used, plus the raw `signals` values in
  `triage_log`, so the classifier can be retuned against real dropped-token data.
- Changing the definition mints a new version file; old versions stay for auditability.

## Triage thresholds (`config/triage.json`)

```json
{
  "stage_a": {
    "min_age_hours": 1,
    "min_market_cap_usd": 10000,
    "recheck_window_hours": 24,
    "recheck_interval_minutes": 30,
    "borderline_mcap_band_pct": 20
  }
}
```

- `recheck_*` control re-evaluation of borderline / too-young tokens so late bloomers are caught.
- `borderline_mcap_band_pct` — tokens within this band below $10k are re-queued rather than
  permanently dropped.

## Publisher config (`config/publisher.json`)

```json
{
  "daily_post_ceiling": 40,
  "overflow_policy": "conviction_first",
  "post_format": "verdict_plus_one_link",
  "x_account_tier": "premium_plus"
}
```

`overflow_policy` and `daily_post_ceiling` are open decisions — the tie-break when the queue
exceeds the ceiling (pure conviction rank vs. freshness-weighted) is unresolved.

## Module config (`config/modules.json`)

Per-module concurrency, rate limits, timeouts, and provider selection:

```json
{
  "M1": { "concurrency": 8, "timeout_ms": 15000, "rpc": "helius" },
  "M2": { "concurrency": 4, "timeout_ms": 20000 },
  "M3": {
    "concurrency": 2, "timeout_ms": 30000,
    "follow_check": "mentions_only",           // "mentions_only" | "full_following"
    "read_provider": "sorsa"                    // third-party read provider selector
  },
  "M5": { "concurrency": 2, "timeout_ms": 45000, "headless": true },
  "M6": { "concurrency": 4, "timeout_ms": 5000 }
}
```

`M3.follow_check` lets us launch with the cheap mentions-only path and upgrade to full
following-list verification if provider economics work out.

## Secrets & environment (`.env`, never committed)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection (web/API + short-lived invocations). |
| `DATABASE_URL_DIRECT` | Neon **direct/unpooled** connection (long-lived BullMQ workers + migrations). |
| `REDIS_URL` | BullMQ backend. |
| `CLOUDINARY_URL` | Evidence store — all snapshots + images. Encodes cloud name + key + secret. |
| `CLOUDINARY_FOLDER` | Base folder for all uploaded evidence (default `dda-evidence`). |
| `HELIUS_API_KEY` | Ingestion webhooks + RPC + on-chain reads. |
| `GEYSER_ENDPOINT` | Optional firehose. |
| `GITHUB_TOKEN` | Module 2 REST API (raise rate limits). |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_*` | Official X API (owned reads + posting). |
| `X_READ_PROVIDER_KEY` | Third-party read provider (M3 following/historical). |
| `LLM_API_KEY` | Summary generation (downstream of persistence only). |

## Precedence

Runtime config files are the source of truth for tunables; env holds only secrets and endpoints.
Config changes are reviewable in version control; the tech-project artifact and its `version` are
the most sensitive — treat changes as product decisions, not config tweaks.
