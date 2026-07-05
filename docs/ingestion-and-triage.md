# Ingestion & Triage

This is the layer that makes the system viable. ~21,000 launches/day enter; **~99% are dropped
here** so we only spend module/API budget on the dozens–low-hundreds/day that qualify.

## Ingestion

### Sources (in order of preference)

1. **Helius webhooks / enhanced transactions**, filtered to the Pump.fun program(s). Lowest ops
   burden — Helius delivers decoded events over HTTP.
2. **Geyser / Yellowstone gRPC** stream if we need lower latency or higher throughput than
   webhooks provide.
3. **Direct RPC log subscription** (`logsSubscribe`) as a fallback if the above are unavailable.

The source is pluggable behind an `IngestionSource` interface so we can switch or run several in
parallel without touching downstream code.

### Normalized event

Every source produces the same envelope onto the `triage` queue:

```ts
interface LaunchEvent {
  mint: string;            // Solana mint address
  creator: string;        // deployer wallet
  launch_ts: string;      // ISO 8601, on-chain launch time
  source: 'helius' | 'geyser' | 'rpc';
  initial_liquidity: number | null;  // SOL, if available at ingest
  trigger: 'new_mint' | 'graduation';
}
```

Ingestion is **deduplicated** on `(mint, trigger)` — a mint that emits both a new-mint and a
later graduation event produces two distinct triage evaluations, but a duplicated webhook
delivery does not.

## Triage gate

A token qualifies for the full battery only if it clears **all three confirmed filters**, run
cheapest-first.

### Stage A — Eligibility (pure on-chain, zero external cost)

| Filter | Threshold (config) | Rationale |
| --- | --- | --- |
| **Age** | ≥ 1 hour since `launch_ts` | Kills instant-death tokens (~69% never trade past day one). |
| **Market cap** | ≥ $10,000 | Price × circulating supply from on-chain data. |

- Both checks are on-chain reads (Helius/RPC) — no paid third-party API is touched in Stage A.
- Anything failing A is written to `triage_log` (stage `A`) and dropped.
- **Borderline re-evaluation:** a token near the mcap threshold, or younger than 1h, is re-queued
  on a timer (delayed BullMQ job) so a coin that crosses $10k at hour 3 still gets picked up. A
  token is only *permanently* dropped after it has aged out of the re-check window (config, e.g.
  24h) without qualifying.

> **Not a safety signal.** "Alive ≥ 1 hour" means *worth investigating*, not *safe*. Rugs happen
> after hour one. This must never surface in a report or post as a clean-bill signal — see
> [security-and-legal.md](security-and-legal.md).

### Stage B — Tech-project classification (cheap heuristic, only on Stage-A survivors)

A token must look like a tech project to proceed — that's what makes Modules 2 (GitHub) and 5
(product) worth running. Classify on cheap signals already present in launch metadata:

| Signal | Weight (config) |
| --- | --- |
| Has a GitHub org/repo link | e.g. 2 |
| Has a real website (not a linktree / social aggregator) | e.g. 2 |
| Launch copy uses product/tech language (`protocol`, `SDK`, `AI agent`, `testnet`, `mainnet`, `API`, `infra`, …) | e.g. 1 per hit, capped |

- Sum the weighted signals; require a minimum score to pass (config).
- Ambiguous cases (near the cutoff) are logged with full `signals` jsonb for **manual spot-check
  and classifier tuning** over time.
- The signal list, weights, and threshold are a **single versioned config artifact** — it decides
  the entire input pile. See [configuration.md](configuration.md). It must be explicit and
  versioned, never hardcoded.

### Bypass

Manual submissions via the site **skip triage entirely** and always run the full battery
(`discovery_source = manual`).

## Output

A qualified target:
1. Upserts a `project` row (keyed on `mint`).
2. Creates a new `report` (version = last + 1, status `pending`).
3. Enqueues the orchestrator fan-out.

Everything dropped lands in `triage_log`. Expected steady-state qualifying volume:
**dozens–low hundreds/day**, sized to the X posting ceiling and external-API budget.
