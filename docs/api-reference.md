# API Reference

All endpoints are served by the Node.js web service (the React front end consumes them). Public read endpoints back the archive;
the stream endpoint backs the live terminal; write endpoints cover manual submission and disputes.
Internal orchestration happens over BullMQ, not HTTP — not documented here.

> Status: proposed contract for MVP. Shapes track the [data model](data-model.md); adjust as the
> schema firms up.

## Public — reports

### `GET /api/reports/:projectId`
Latest report version for a project.

**200**
```json
{
  "project": {
    "id": "…", "mint": "7xK…9fB", "x_handle": "@proj",
    "github_url": "https://github.com/…", "website_url": "https://…",
    "launch_ts": "2026-07-04T09:00:00Z", "discovery_source": "triage"
  },
  "report": {
    "id": "…", "version": 3, "status": "complete",
    "summary": "…LLM narration…",
    "started_at": "…", "completed_at": "…"
  },
  "checks": [
    {
      "module": "M1", "status": "flagged", "confidence": "high",
      "claim": "mint_authority is ACTIVE; dev can mint unlimited supply",
      "evidence_url": "https://…", "raw_snapshot_ref": "https://res.cloudinary.com/…",
      "checked_at": "…"
    }
  ]
}
```

### `GET /api/reports/:projectId/v/:version`
A pinned, immutable report version. **This is the URL every X post links to.**

### `GET /api/snapshots/:checkId`
Redirects to (or streams) the stored raw snapshot blob for a check. The re-verification artifact.

## Public — live stream

### `GET /api/stream/:reportId` — Server-Sent Events
Streams `StreamLine` events for an in-flight (or replayed) report.

```
event: line
data: {"report_id":"…","module":"M1","seq":4,"text":"mint_authority = ACTIVE …","kind":"flag","ts":"…"}

event: done
data: {"report_id":"…","status":"complete"}
```

Clients reconnect with `Last-Event-ID` to resume from `seq`. Closed with a `done` event when the
report finalizes.

## Public — submission (triage bypass)

### `POST /api/submit`
Manually submit a mint for a full-battery run; skips triage (`discovery_source = manual`).

**Request**
```json
{ "mint": "7xK…9fB" }
```
**202**
```json
{ "project_id": "…", "report_id": "…", "version": 1, "stream_url": "/api/stream/…" }
```
Rate-limited per IP to prevent abuse of the paid module budget.

## Public — disputes

### `POST /api/disputes`
Contest a published finding. Creates a dispute record and notifies the review queue.

**Request**
```json
{ "report_id": "…", "check_id": "…", "contact": "…", "statement": "…" }
```
**202** → `{ "dispute_id": "…" }`

See [security-and-legal.md](security-and-legal.md) for the resolution workflow (re-run, correct,
retract with visible correction).

## Admin — review queue (authenticated)

### `GET /api/admin/review-queue`
Findings held for human approval (tier = `human`).

### `POST /api/admin/review/:findingId`
Approve/edit/reject a held finding.
```json
{ "action": "approve" | "edit" | "reject", "text": "…optional edited post text…" }
```
On `approve`/`edit`, the publisher posts and records a `PublishEvent` with `approver` set.

## Conventions

- All timestamps ISO 8601 UTC.
- Errors: `{ "error": { "code": "…", "message": "…" } }` with appropriate HTTP status.
- Admin endpoints require authentication; public write endpoints are rate-limited.
