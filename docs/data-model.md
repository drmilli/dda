# Data Model

Neon (serverless Postgres) is the system of record — standard Postgres, so everything below is
plain SQL. Raw evidence (snapshots + images) lives in Cloudinary and is referenced by pointer
(`raw_snapshot_ref`). Everything that backs a public claim is **append-only**: rows are versioned,
never overwritten. Connection/pooling notes are in [infrastructure.md](infrastructure.md#neon-specifics).

## Entity overview

```
Project 1──* Report 1──* CheckResult *──1 (raw snapshot in Cloudinary)
   │             │
   │             *
   │         PublishEvent *──1 (approver, X post id)
   │
   *
TriageLog                         KOLWallet (standalone, curated, append-only)
```

## Tables

### `project`

Discovered launch or manual submission — the subject under investigation.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `mint` | text, unique | Solana mint address. |
| `creator` | text | Deployer wallet. |
| `x_handle` | text, null | Claimed project X handle (resolve to numeric ID in M3). |
| `github_url` | text, null | Claimed repo/org. |
| `website_url` | text, null | Claimed product/site. |
| `launch_ts` | timestamptz | On-chain launch time. |
| `discovery_source` | enum(`triage`,`manual`) | Manual submissions bypass triage. |
| `first_seen_at` | timestamptz | When ingestion first observed it. |
| `created_at` | timestamptz | |

### `report`

A point-in-time aggregation of all CheckResults for a project. Versioned.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `project_id` | uuid FK → project | |
| `version` | int | Monotonic per project; `(project_id, version)` unique. |
| `status` | enum(`pending`,`running`,`complete`,`failed`) | |
| `summary` | text, null | LLM-written, from finalized CheckResults only. Gated before publish. |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz, null | |

### `check_result`

The atomic evidence unit every module emits. Immutable once written.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `report_id` | uuid FK → report | |
| `module` | enum(`M1`…`M6`) | |
| `status` | enum(`confirmed`,`flagged`,`inconclusive`,`not_applicable`) | |
| `confidence` | enum(`high`,`medium`,`low`) | |
| `claim` | text | The falsifiable statement. |
| `evidence_url` | text | Where anyone can re-verify. |
| `raw_snapshot_ref` | text | Blob-store pointer to captured raw data. |
| `checked_at` | timestamptz | |

> **Invariant:** a row with a non-`not_applicable` status must have both a non-null
> `evidence_url` and a resolvable `raw_snapshot_ref`. Enforce with a CHECK constraint + a
> write-time guard in the module SDK.

### `publish_event`

The record of anything that left the building. Ties a public post to the exact report version
and evidence it was based on.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `report_id` | uuid FK → report | The **version** that was posted. |
| `tier` | enum(`auto`,`auto_hedged`,`human`) | Route taken. |
| `channel` | enum(`x`,`site_only`) | |
| `x_post_id` | text, null | Populated on successful X write. |
| `approver` | text, null | Set when tier = `human`. |
| `posted_at` | timestamptz | |
| `payload` | text | Exact text posted. |

### `kol_wallet`

Curated wallet→identity attributions powering Module 4. Append-only with provenance; low-
confidence rows never drive a public post.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `address` | text | Wallet. |
| `attributed_identity` | text | Person/handle. |
| `evidence_source` | text | URL / case reference for the attribution. |
| `confidence` | enum(`high`,`medium`,`low`) | |
| `added_by` | text | Curator. |
| `added_at` | timestamptz | |

### `triage_log`

Every dropped token, for classifier tuning and volume auditing. High-volume, retention-capped.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `mint` | text | |
| `stage` | enum(`A`,`B`) | Where it was dropped. |
| `reason` | text | e.g. `mcap_below_10k`, `tech_score_2_of_5`. |
| `signals` | jsonb | Raw signal values, for retroactive classifier tuning. |
| `evaluated_at` | timestamptz | |

## Evidence storage layout

All evidence lives in **Cloudinary**, split only by media type via `resource_type`:
**raw non-image snapshots** (JSON/HTML) as `resource_type: 'raw'`, **image evidence**
(screenshots, mainly Module 5) as `resource_type: 'image'`. Everything is foldered identically so
a check's artifacts line up:

```
{CLOUDINARY_FOLDER}/{project_id}/{report_version}/{module}/{check_id}
  · raw  snapshot  → resource_type 'raw'   (API/RPC JSON, captured DOM/HTML)
  · image evidence → resource_type 'image' (screenshots)
```

Uploads use a deterministic `public_id` with `overwrite: false`, so evidence is effectively
write-once; a re-run lands under a new `{report_version}` folder, preserving point-in-time
immutability. For raw snapshots, request provenance (endpoint, params, `fetched_at`, http status)
is attached as Cloudinary `context` metadata on the same object.

The returned `secure_url` is stored as the check's `raw_snapshot_ref` (or `evidence_url`) so
anyone can re-fetch the exact captured artifact.

## Retention

- `check_result`, `report`, `publish_event`, **all Cloudinary evidence** (raw snapshots + images)
  — **retain indefinitely** (legal record). Do not enable Cloudinary auto-deletion/TTL on the
  evidence folder.
- `triage_log` — retain 90 days (config), then aggregate to daily counters. Enough to tune the
  Stage-B classifier without unbounded growth.
