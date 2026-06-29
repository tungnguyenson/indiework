# 0003 — Client read-cache + base ⊕ draft reconcile for entity detail

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Tung Nguyen
- **Implementation:** pending — tracked in
  [perceived-performance/plan.md](../product/non-functional/perceived-performance/plan.md)
  (PP-R5, PP-F6, and the cross-surface half of PP-W5).

## Context

[ADR 0002](0002-optimistic-updates.md) established that **the server is the cache**: write feedback
is optimistic via `useOptimistic`, and `revalidatePath` re-flows authoritative props — there is **no
client-side read cache** to keep in sync. ADR 0002 explicitly deferred a shared client store as YAGNI,
to "revisit only if cross-surface staleness becomes a real complaint."

Two things have since made that revisit concrete, both on the **read** side that ADR 0002 did not
address:

1. **Re-opening a recently-viewed entity re-pays its load.** The detail panel re-fetches on every
   open/switch ([use-task-detail.ts](../../src/components/app/task-detail/use-task-detail.ts):
   `useEffect` → `getTaskDetailByRef`). Clicking task A → B → A re-reads A from the DB each time —
   wasteful on a healthy DB, painful on the slow/cross-region managed deployment that is the
   perceived-performance design target. This is now requirement **PP-R5**.
2. **Same-screen cross-surface staleness is the real complaint ADR 0002 named.** A list and an open
   detail panel showing the same task can disagree after an edit. This is requirement **PP-W5**
   (promoted from a non-goal, 2026-06-26; tracked as IW-99).

Both want a small, local, per-entity store. Adding one **reintroduces** the exact "apply a server
response onto the UI" step that ADR 0002's design avoided — which is why PP-F5 ("a late/out-of-order
response must not overwrite newer state") holds *by construction* today: there is nothing to clobber.
A read cache breaks that, so the correctness cost must be paid deliberately, not assumed away. That
cost is now an explicit, testable requirement, **PP-F6**.

## Decision

**Introduce a scoped, per-surface client read-store for the detail entity, modelled as
`server-base ⊕ local-draft`, guarded by a per-entity monotonic version.** This reverses the §1 "no
client cache" stance **only for cached entity reads** — not a global `tasks` store (still rejected,
per ADR 0002), not offline durability (DB stays the source of truth).

The full mechanism is reasoned by-section in
[perceived-performance/solution.md §8](../product/non-functional/perceived-performance/solution.md);
the essentials:

- **`base`** = the server snapshot (the cache value). Reads and write responses update it
  **monotonically** — applied only if the incoming version is ≥ the current one, so a late read can
  never move `base` backwards. Version source: the entity's `updatedAt` (to be exposed in
  `toTaskDto`) or a per-entity client epoch as a fallback.
- **`draft`** = `Partial<fields>` the user has changed locally; render is `{ ...base, ...draft }`,
  draft winning per field, cleared per field when that field's write resolves. A read never touches
  `draft`, so a background revalidation cannot stomp an in-progress edit.

The substrate is **shared but not sufficient on its own** — each requirement layers its own wiring:

- **Layer B — read cache + revalidation + version guard** → **PP-R5 / PP-F6** (temporal: one view
  over successive fetches).
- **Layer A — cross-surface propagation** (shared mirror / bidirectional `iw:task-updated`) → the
  **PP-W5** half (spatial: two concurrently-visible views), the bulk of IW-99.

## Consequences

**Positive**

- Re-opening a viewed entity paints instantly from cache, then revalidates (PP-R5) — the slow DB is
  hidden on the warm path, with no network on the cache hit.
- The substrate is the general, every-field mechanism for cross-surface consistency (PP-W5), instead
  of the current title-only `iw:task-updated` special case.
- It is the same optimistic-over-authoritative-base shape as ADR 0002, generalised — not a new
  paradigm.

**Trade-offs**

- **Regresses PP-F5's free correctness.** Once the cache lands, PP-F5's by-construction hold no
  longer covers the read path; **PP-F6** must be met by the version guard + draft overlay. This is
  the deliberate price of the cache, captured as a requirement rather than a footnote. The guard must
  hold **independently** of Server-Action queue ordering — the read fires from a `useEffect`, not a
  transition, so any ordering safety there is unverified and must not be relied on.
- A new piece of client state to reason about (bounded: per-surface, ephemeral, server-authoritative)
  — explicitly *not* the global store ADR 0002 rejected.
- Staleness window for data this client did not change (another tab, or an MCP/external write) — an
  accepted single-client non-goal; bounded by `staleTime` + revalidate-on-focus, not a push channel.

## Alternatives considered

- **A client query library (TanStack Query / SWR).** Gives caching, dedup, and revalidation for
  free, but adds a dependency and a second data-fetching paradigm alongside RSC + Server Actions, and
  still requires the same PP-F6 version/draft guard for free-text edits. Deferred: the scoped store
  above is ~the same code without the dependency, and keeps one fetching model.
- **Server-side cache only** (`unstable_cache` / `use cache: remote`). Durable and cross-instance,
  and still worth doing for first-load latency — but it pays a round-trip on every read, so it does
  **not** deliver PP-R5's no-network instant re-open. Complementary, not a substitute.
- **No cache (status quo).** Leaves PP-R5 unmet and PP-W5 reliant on a coarse `revalidatePath`. The
  re-open cost is real and reproducible on the design-target deployment.

## References

- [ADR 0002](0002-optimistic-updates.md) — optimistic writes; "the server is the cache"; the global
  store this decision still rejects.
- [perceived-performance/spec.md](../product/non-functional/perceived-performance/spec.md) — PP-R5,
  PP-F6, PP-W5 (the requirements) + the 2026-06-27 bar-change note.
- [perceived-performance/solution.md §8](../product/non-functional/perceived-performance/solution.md)
  — the mechanism in full.
- [perceived-performance/plan.md](../product/non-functional/perceived-performance/plan.md) —
  implementation status & build order.
