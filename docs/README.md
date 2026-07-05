# Technical Documentation — Autonomous On-Chain Due-Diligence Agent

Technical reference for the DDA project. For the product rationale, constraints, and
"why," read the [Engineering Brief](../docx.md) first — this set documents the **how**.

## What this system does

An always-on agent that monitors Solana token launches (primarily Pump.fun), triages the
firehose down to a few dozen qualifying "tech project" tokens per day, runs six deterministic
verification modules against each, and publishes falsifiable, evidence-backed findings to a
terminal-style website and an X account. Every published claim is paired with a stored raw
snapshot so it can be independently re-verified.

## Document index

| Doc | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Components, data flow, service boundaries, runtime topology |
| [data-model.md](data-model.md) | Postgres schema, entities, relationships, Cloudinary evidence layout |
| [ingestion-and-triage.md](ingestion-and-triage.md) | Firehose subscription, `LaunchEvent`, Stage A/B triage gate |
| [modules.md](modules.md) | The six verification modules: interfaces, checks, failure modes |
| [publisher.md](publisher.md) | Confidence-tier routing, the legal firewall, X posting economics |
| [terminal-site.md](terminal-site.md) | Live SSE/WebSocket stream, report archive, front-end contract |
| [api-reference.md](api-reference.md) | Internal + public HTTP/SSE endpoints |
| [configuration.md](configuration.md) | Tunable thresholds, the versioned "tech project" definition, env vars |
| [infrastructure.md](infrastructure.md) | Services, queues, deployment, scaling, observability |
| [security-and-legal.md](security-and-legal.md) | Evidence retention, dispute mechanism, guardrails |
| [roadmap.md](roadmap.md) | Build sequence and milestone acceptance criteria |

## Core invariants (do not violate)

1. **Evidence or it didn't happen.** No claim is emitted without a retrievable `evidence_url`
   *and* a stored `raw_snapshot_ref` captured at check time.
2. **Deterministic core, narrative shell.** Evidence is produced only by deterministic module
   code. The LLM never appears in the evidence path — it only summarizes already-verified
   `CheckResult` rows, and its output passes the same publisher gate as everything else.
3. **The publisher is a gate, not a decorator.** Confidence tier decides the *route* (auto-post
   / hedged auto-post / human queue), not just the styling of a report.
4. **No autonomous intent assertions.** Publish falsifiable facts ("mint authority is active"),
   never motive ("this is a rugpull").
5. **Point-in-time, versioned, append-only.** Reports and evidence are never overwritten;
   re-runs create new versions. The `PublishEvent → Report version → raw_snapshot_ref` chain is
   the legal record.

## Glossary

- **Graduation** — a Pump.fun token migrating to an external DEX (Raydium). ~100/day ecosystem-wide.
- **Battery** — the full run of all applicable modules against one qualified target.
- **Qualified target** — a token that cleared both triage stages (A: eligibility, B: tech-project).
- **KOL** — Key Opinion Leader (crypto influencer). Subject of Module 4, highest legal risk.
- **CheckResult** — the structured output unit every module emits (see [data-model.md](data-model.md)).
