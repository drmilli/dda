# The Publisher (Legal Firewall)

The publisher decides what leaves the building. It reads a finalized `Report` and routes each
finding by **confidence tier**. The tier decides the *route*, not just the styling — this is the
system's legal firewall, not a decoration.

## Tier routing

| Tier | Example findings | Action |
| --- | --- | --- |
| **Auto-post** | On-chain facts (M1): mint authority not renounced, lock mismatch, supply concentration. GitHub facts (M2): repo age vs. claim. | Posted to X automatically — plain-text verdict + exactly one link to the report version. |
| **Auto-post w/ hedge** | X account age/rename (M3) where the fact is objective. | Auto-posted with **templated neutral phrasing**: "X claims Y; on-chain/records show Z." |
| **Human review queue** | Anything naming a person, any M4 KOL claim, any "scam"/intent assertion, any M5/M6-driven conclusion. | **Held.** A human approves or edits before it can post. |

### Routing algorithm

```
for each finding in report:
    if finding names a person OR finding.module in {M4}:        → human queue
    elif finding is an intent/motive assertion:                 → human queue   (must not exist autonomously)
    elif finding.module in {M5, M6} and finding is a conclusion:→ human queue
    elif finding.module == M3 and finding is objective:         → auto-post (hedged template)
    elif finding.module in {M1, M2} and confidence == high:     → auto-post
    else:                                                        → human queue (default-deny)
```

Default is **deny** — anything not explicitly cleared for an auto tier goes to a human.

## Hard rules

1. **Never assert intent autonomously.** State the falsifiable fact — "mint authority is active;
   dev can mint unlimited supply" — never the motive — "this is a rugpull."
2. **Every post links** to the immutable, versioned report page (`report.version`). The link
   target can never mutate under the post.
3. **Plain-text + single link.** No threads of links. Each URL post is metered at ~$0.20; one
   link per post keeps cost and the daily cap predictable.
4. **Rate-limited to the account's daily X ceiling.** Overflow rolls to the next day,
   **highest-conviction first**. (Tie-break policy is an open decision — see
   [roadmap.md](roadmap.md).)

## X economics (drives the design)

| Action | Cost | Consequence for us |
| --- | --- | --- |
| Plain/media post | ~$0.015 | Cheap, but rarely used — our posts carry a link. |
| Post containing a URL | ~$0.20 | Our normal post. One link only. |
| Post read | ~$0.005 | M3 reads (metered). |
| User-resource read (profile/follower) | ~$0.010 | M3 following-list reads — expensive at scale. |
| Owned read | ~$0.001 | Cheap. |
| Read cap | 2M reads/month | Hard ceiling on pay-per-use → M3 uses a third-party read provider. |
| Post cap | 50 original/day (unverified) | **Post from a Premium+ account** to raise this. |

Removed April 2026 (Enterprise-only now): follow / like / quote-post writes. We don't need to
*write* those, but the removal is why M3 *reads* route through a third-party provider.

**Implication:** at most a few dozen posts/day. That's a feature — it forces high-conviction-only
publishing, which is exactly the confidence discipline we want.

## Publish flow

1. Report finalizes (`status = complete`).
2. Publisher iterates findings, applies routing.
3. Auto-tier findings → format post (verdict + one report link) → check daily budget → write to X
   → record `PublishEvent` with `x_post_id`.
4. Human-tier findings → enqueue to review UI. On approval, an editor can amend text; posting then
   follows the same PublishEvent path with `approver` set.
5. Budget exceeded → remaining findings queue for the next day, ranked by conviction.

Every post — auto or human — produces a `PublishEvent` tying the exact text to the exact report
version and its evidence snapshots. That chain is the legal record; see
[security-and-legal.md](security-and-legal.md).
