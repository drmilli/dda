# DDA — Autonomous On-Chain Due-Diligence Agent

An always-on agent that monitors new Solana token launches (primarily Pump.fun), triages the
firehose down to the few that gain real traction, runs a battery of **mechanical, evidence-based
verification checks** against them, reasons about them in public on a terminal-style website, and
publishes **falsifiable, evidence-backed verdicts** to an X account.

> **Core principle:** every published finding is falsifiable and sourced. We never emit an opaque
> "trust score" or a "safe to buy" verdict — only specific claims, each paired with a specific
> evidence source (URL, timestamp, raw on-chain/API snapshot). That is what makes the output
> credible and legally defensible instead of just another opinion.

## Why it works this way

Three hard constraints shape the whole design:

- **Volume is mostly noise.** ~21,000 launches/day, ~69% dead after day one, <2% ever graduate. We
  can't test everything — a hard triage gate drops ~99% and only runs the full battery on tech
  projects with market cap ≥ $10k that are alive ≥ 1 hour.
- **Publishing is capped and metered.** X's pay-per-use pricing and daily post caps throttle us to
  a few dozen posts/day. That's a *feature* — it forces high-conviction-only posting.
- **Legal exposure scales with autonomy.** On-chain facts are provable and safe to auto-post;
  accusations that name people are not. Confidence tiers **gate the publisher**, not just decorate
  the report.

## Three product surfaces

- **The agent** — the always-on backend that ingests, triages, tests, and publishes.
- **The terminal site** — a live "watch it think" stream where each check runs visibly, plus a
  permanent, versioned archive of every report.
- **The X account** — where high-conviction verdicts auto-post, each linking back to its on-site
  report.

## How it flows

```
Solana / Pump.fun  →  Ingestion  →  Triage gate (~99% dropped)  →  Orchestrator
                                                                        │  fan-out
                                        ┌───────────────────────────────┘
                                        ▼
                          6 verification modules (M1–M6)
                                        │  snapshot-backed CheckResults
                                        ▼
                          Postgres + Cloudinary (evidence)
                                   │                 │
                          Terminal site        Confidence-gated publisher
                          (live + archive)     (auto-post / hedged / human queue)
```

## The six verification modules

| # | Module | Confidence | Auto-post? |
| --- | --- | --- | --- |
| M1 | On-chain (locks, mint/freeze authority, holder concentration) | high | ✅ fully autonomous |
| M2 | GitHub backdating detection | high | ✅ |
| M3 | X account history & affiliation | high\* | ⚠ hedged, objective facts only |
| M4 | KOL insider-supply cross-reference | low→med | ❌ human-gated (names people) |
| M5 | Product/site functionality | low | ❌ conclusions human-gated |
| M6 | AI-generated copy heuristic | low | ❌ signal only |

\* High-confidence in principle, with a data-provider feasibility caveat.

## Core invariants

1. **Evidence or it didn't happen** — no claim without a retrievable source + stored raw snapshot.
2. **Deterministic core, narrative shell** — modules produce all evidence; the LLM only summarizes
   already-verified results and never enters the evidence path.
3. **The publisher is a gate, not a decorator** — confidence tier decides the route.
4. **No autonomous intent assertions** — publish facts ("mint authority is active"), never motive.
5. **Point-in-time, versioned, append-only** — reports and evidence are never overwritten.

## Tech stack

React front end (SSE live stream) · Node.js backend · BullMQ on Redis ·
Neon (serverless Postgres) + Cloudinary (all evidence: raw snapshots + images) ·
Helius / Geyser / Solana RPC · Streamflow SDK · GitHub REST API ·
`XDataSource` (official X API + third-party read provider) · Wayback Machine CDX.

## Documentation

- **[Engineering Brief](docx.md)** — the product rationale and the "why."
- **[Technical Docs](docs/README.md)** — the "how":
  [architecture](docs/architecture.md) ·
  [data model](docs/data-model.md) ·
  [ingestion & triage](docs/ingestion-and-triage.md) ·
  [modules](docs/modules.md) ·
  [publisher](docs/publisher.md) ·
  [terminal site](docs/terminal-site.md) ·
  [API reference](docs/api-reference.md) ·
  [configuration](docs/configuration.md) ·
  [infrastructure](docs/infrastructure.md) ·
  [security & legal](docs/security-and-legal.md) ·
  [roadmap](docs/roadmap.md)

## Status

Early / pre-implementation. The design is documented; the MVP (Module 1 + ingestion + triage +
evidence store + report page) is the first build milestone — see the
[roadmap](docs/roadmap.md).

---

_Not investment advice. Every report is a point-in-time snapshot; results can change as on-chain
state and public records mutate._
