# Security & Legal Guardrails

Legal exposure scales with autonomy. On-chain facts are provable and safe to auto-post;
interpretive or accusatory claims are not. These guardrails are **load-bearing requirements**, not
best-effort niceties.

## The guardrails

1. **Evidence retention.** Store the raw snapshot for every claim **at check time**. If a claim is
   ever disputed, we can show exactly what we saw and when. Snapshots are write-once and retained
   indefinitely.
2. **No autonomous intent assertions.** Publish falsifiable facts ("mint authority is active"),
   never conclusions about motive ("this is a rugpull"). Enforced in the publisher routing —
   intent-shaped findings default to the human queue.
3. **Human gate for named accusations.** Module 4 and **anything naming a person** cannot
   auto-post. **Non-negotiable.**
4. **Dispute mechanism.** A public path for a project/person to contest a finding, plus an
   internal process to re-run, correct, and — if wrong — retract with a visible correction. **Must
   be built before Module 4 ships.**
5. **Provenance on KOL attributions.** Every `kol_wallet` row carries its evidence source and
   confidence; low-confidence attributions never drive a public post.
6. **Disclaimers.** "Not investment advice" + "point-in-time" on every report and across the site.

## The legal record (chain of custody)

For any public claim we can reconstruct exactly what evidence existed at post time:

```
PublishEvent  →  Report (specific version)  →  CheckResult[]  →  raw_snapshot_ref (immutable blob)
   what was        the exact evidence set        the falsifiable      the raw captured data,
   posted, when,   the post was based on         claim + source URL   write-once, timestamped
   by whom
```

- `report.version` is immutable; a re-run mints a new version, so a post's link never changes
  under it.
- `publish_event.payload` stores the exact text posted; `approver` records the human for gated
  posts.
- Blob store versioning is enabled and snapshots referenced by a `check_result` are never deleted.

## "Alive ≥ 1 hour" is not a safety signal

The triage filter selects *what to investigate*; it never implies a clean result. Rugs happen
after hour one. Reports, posts, and UI copy must **never** let the threshold read as a
safety/endorsement signal. This is a content-review checklist item, not just a code concern.

## Dispute workflow

1. **Intake** — public `POST /api/disputes` (see [api-reference.md](api-reference.md)) creates a
   record and notifies the review queue.
2. **Re-run** — trigger a fresh report version to see if on-chain/records changed (locks unlock,
   history mutates — results are point-in-time).
3. **Correct** — if the original was wrong, publish a **visible correction** and retract the
   claim. Corrections are themselves `PublishEvent`s, linked to the disputed report version.
4. **Record** — the full chain (original evidence, dispute, re-run, correction) is retained.

## Human review queue

Held-finding SLA is an open decision (who staffs it, how long before a held finding goes stale).
Until resolved, **default to holding** — a stale held finding is a non-event; a wrong auto-post is
a legal liability.

## LLM containment

The LLM never produces evidence and never appears in the live-stream path (a hallucinated stream
line is a published false statement). It only writes the end-of-run summary from finalized
`CheckResult` rows, and that summary passes the **same publisher gate** as any X post. See
[modules.md](modules.md) and [terminal-site.md](terminal-site.md).

## Access & secrets

- Admin/review endpoints authenticated; public write endpoints (submit, dispute) rate-limited to
  protect the paid module/X budget.
- Credentials (Helius, GitHub, X, read provider, LLM) in a secret manager, never committed.
- The X posting account is Premium+ (raises the 50-post/day unverified cap) and its credentials
  are the most sensitive — a compromise means false posts under our identity.
