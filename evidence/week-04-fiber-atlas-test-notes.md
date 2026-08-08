# Week 4 community test notes — Fiber Atlas

**Project tested:** Fiber Atlas  
**Test mode:** Local run with synthetic CKB transactions  
**Result:** Core classification behavior worked; two data-consistency issues were identified.

## What worked

I tested Fiber Atlas locally with synthetic CKB transactions. The core event classification worked for:

- cooperative close / settlement flows;
- penalty-related events;
- force-close-related state transitions represented by the synthetic transaction set.

The local test confirmed that the main classification pipeline could distinguish the intended close/settlement/penalty cases in the supplied synthetic scenarios.

## Issue 1 — `/faultline/unresolved` may include spent cells

### Observation

The `/faultline/unresolved` endpoint can include cells that have already been spent but have not yet been assigned a recognized classification.

### Why this matters

A cell that has already been spent is no longer unresolved in the operational sense used by the dashboard. Returning spent-but-unclassified cells can inflate the unresolved count and make the Faultline view look more severe than the actual live state.

### Recommendation

Filter unresolved cells using the actual spend state:

```sql
spend_tx_hash IS NULL
```

This makes the endpoint represent currently unspent unresolved cells rather than mixing live unresolved state with historical unclassified state.

## Issue 2 — duplicate unattributed events can be stored

### Observation

Duplicate unattributed events can be inserted when the available deduplication key is nullable or otherwise absent for an event.

### Why this matters

Repeated ingestion of the same underlying event can create duplicate records, distort counts, and make downstream analytics less reliable.

### Recommendation

Use a stable non-null identifier for event deduplication whenever possible, for example:

```text
commitment_outpoint
```

A database-level uniqueness constraint or idempotent upsert keyed by that identifier would provide stronger protection than application-only duplicate checks.

## Feedback message sent / prepared

> GM! I tested Fiber Atlas locally with synthetic CKB transactions. The core close/settlement/penalty classification worked.
>
> I found two issues: `/faultline/unresolved` can include already-spent but unclassified cells, and duplicate unattributed events can be stored.
>
> Recommendation: use `spend_tx_hash IS NULL` for unresolved cells and a non-null identifier such as `commitment_outpoint` for event deduplication.

## Contribution value

This test focused on correctness of the observatory's state interpretation rather than UI behavior. Both findings affect the reliability of operational metrics exposed to users or downstream API consumers, so they are useful candidates for regression tests before broader deployment.
