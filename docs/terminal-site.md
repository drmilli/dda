# Terminal Site

The brand surface. Two views: a **live "watch it think" stream** and a **permanent report
archive**. Terminal/monospace aesthetic (v0-style).

## View 1 — Live stream

As a qualified target runs, each module's real steps stream to the browser over SSE (or WebSocket):

```
[M1] Querying Streamflow for mint 7xK...9fB
[M1]   locked = 0 SOL  |  claimed = "20% locked 12mo"  →  MISMATCH ✗
[M1] mint_authority = ACTIVE  (dev can mint unlimited)  ✗
[M2] repo created 2026-06-30  |  claims "8 months dev"  →  FLAG ✗
```

> **Critical invariant.** Every streamed line is a **real deterministic check output**, not LLM
> narration. The terminal renders the structured `CheckResult`/`StreamLine` stream directly. A
> hallucinated line here is a published false statement — so **the LLM is not in this path**. The
> LLM only writes the end-of-run human-readable summary, from already-verified results, and that
> summary passes the same publisher gate as an X post.

### StreamLine event

Modules emit these via `ctx.emit()`; the web service relays them to subscribed clients keyed by
report version:

```ts
interface StreamLine {
  report_id: string;
  module: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
  seq: number;              // ordering within a report
  text: string;             // pre-rendered deterministic line
  kind: 'info' | 'flag' | 'pass' | 'error';
  ts: string;               // ISO 8601
}
```

The client renders `kind` as color/glyph (`✗` for `flag`/`error`, `✓` for `pass`). It never
transforms the text — it prints what the module computed.

## View 2 — Archive

Every report is a **permanent, versioned, shareable page** — this is the link every X post points
to. Each page shows, per check:

- The `claim`, `status`, and `confidence`.
- The `evidence_url` (re-verify link).
- A **raw-snapshot download** (the stored blob).
- The `checked_at` timestamp.
- Plus the LLM summary, visually separated from the evidence.
- A **"re-run" affordance** — creates a new report version, never overwrites.

### Facts vs. framing

Keep deterministic evidence **visually distinct** from the narrative summary so readers can tell
facts from framing. The summary is clearly labeled as generated narration; the CheckResult table
is the ground truth.

## Front-end contract

- **Stream:** `GET /api/stream/:reportId` (SSE) — see [api-reference.md](api-reference.md).
- **Archive:** `GET /reports/:projectId` (latest) and `/reports/:projectId/v/:version` (pinned).
  Report links in X posts always use the **pinned version** URL.
- **Submission bypass:** a form that POSTs a mint for a full-battery run, skipping triage.
- **Dispute intake:** a public form to contest a finding (see security doc).

## Tech

React front end (SPA), served alongside the Node API. SSE is the default transport (simpler,
one-way fits the stream);
WebSocket is the fallback if we later need bidirectional interaction. The live view degrades
gracefully to polling the report status if the stream drops.
