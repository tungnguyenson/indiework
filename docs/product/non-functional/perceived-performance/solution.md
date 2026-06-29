# Perceived Performance — Technical Solution (IndieWork)

> **How** IndieWork meets the responsiveness bar in [spec.md](spec.md), organised **by
> mechanism** rather than by requirement ID. This is the durable design: the patterns, why
> they hold, the trade-offs, and the target shape for designs not yet built.
>
> The triad: **[spec.md](spec.md)** = *what* (requirements, source of truth) · **this file**
> = *how* (design) · **[plan.md](plan.md)** = *status* (living tracker, links back here).
> When a mechanism here changes, update this file; when a requirement is met/measured, update
> plan.md. Requirement text and met/not verdicts live in those two files, **not** here.
>
> Stack snapshot: Next.js 16.2.9 · React 19.2.4 (`reactCompiler: true`) · Drizzle 0.45 ·
> dual-driver (Postgres `pg` 8.21 / libsql). No client query library (no TanStack Query / SWR).

---

## 1. The core loop — optimistic paint over a server-owned cache

Everything write-side builds on one loop ([ADR 0002](../../../adr/0002-optimistic-updates.md)):

```
gesture
  └─ startTransition(() => {
        applyOptimistic(action)        // 1. paint now      (useOptimistic reducer)
        await serverAction(args)       // 2. mutate         ('use server')
     })                                //    └ revalidatePath('/app','layout')
                                       // 3. authoritative props re-flow (RSC re-render)
                                       // 4. React rebases optimistic state onto fresh props
```

The decisive architectural choice: **there is no client cache to keep in sync.** The server
(RSC + `revalidatePath`) *is* the cache. `useOptimistic` holds the predicted value only for
the duration of the transition, then discards it as the re-flowed `tasks` prop becomes the new
base. The optimistic reducer is pure ([src/lib/optimistic.ts](../../../../src/lib/optimistic.ts));
the surfaces ([board.tsx](../../../../src/components/app/board.tsx),
[task-list.tsx](../../../../src/components/app/task-list.tsx),
[inbox.tsx](../../../../src/components/app/inbox.tsx)) own the gesture → transition wiring.

This loop is the mechanism behind instant write feedback (**PP-W1**) and guaranteed convergence
(**PP-F4**): a thrown action makes React auto-revert the optimistic value, and a successful one
is superseded by re-flowed truth either way.

> **"No client cache" is refined for reads (§8).** The claim above holds for the **write loop**.
> **PP-R5** (instant re-open) and **PP-W5** (cross-surface sync) require a deliberate, scoped
> client read-store; see §8 and [ADR 0003](../../../adr/0003-client-read-cache-reconcile.md). It is
> additive — the write loop here is unchanged.

**Deliberate exclusion:** `createTask` stays non-optimistic (board `addTo`) — it needs a
server-generated id/ref, so it `router.refresh()`es instead of predicting.

---

## 2. Action serialisation — ordering correctness comes for free

The race that worries every optimistic UI (rapid edits to the same entity persisting
out of order; a stale response clobbering newer state — **PP-W4 / PP-F5**) is **structurally
absent** in this stack, for a reason specific to Next's App Router.

**Confirmed in Next 16 source** (`packages/next/src/client/components/app-router-instance.ts`,
`AppRouterActionQueue`): Server Actions from a single client are **queued and run
sequentially**. A second action invoked while one is pending is appended (`actionQueue.last.next
= newAction`); the next node is only handed to `runAction` by `runRemainingActions` *after* the
previous action resolves. Because `runAction` is what **dispatches the request**, B's request is
withheld until A's round-trip (including its `revalidatePath` result) completes — the queue defers
the *request*, not merely the application of the result. This applies to programmatic calls inside
`startTransition` (the board's `updateTask`, not a `<form action>`): every server-action dispatch
becomes a `ReducerActions` queue node regardless of how it was invoked.

This is established at the **framework-source level**; the matching `[~]` in plan.md (PP-W4/PP-F5)
tracks an end-to-end remote trace to confirm it on the real target, not doubt about the mechanism.

Consequences for our model:

- **No Race 1 (server applies out of order).** Action B's request is not even sent until A has
  fully resolved. The server applies edits in invocation order = the user's intent order. The
  last write reflects the last intent.
- **No Race 2 (stale response overwrites newer UI).** Responses return in order, and there is
  **no manual "apply server response" step** to guard — reconciliation is React rebasing
  `useOptimistic` onto re-flowed props. The classic fixes (client sequence token, drop-stale
  response, per-entity mutation queue) target a **client-cache** model; they have nothing to
  attach to here and are intentionally **not** implemented.

> **This guarantee is write-path only — a read cache reintroduces the step it relies on.** "No manual
> apply-server-response step" stops being true once §8's client read-cache lands: a background
> revalidation *is* a manual apply, so PP-F5's by-construction hold does **not** extend to it.
> **PP-F6** makes that read-path correctness explicit, met by §8's version guard (drop a response
> whose version is older than `base`) + draft overlay (never stomp an in-progress edit) — i.e. the
> exact "drop-stale-response" fix called unnecessary here, now necessary there.

**The real UI case.** On the board, a drag is a **cross-column status patch** (`updateTask`),
committed **on drop** (one write per drop — [board.tsx](../../../../src/components/app/board.tsx)
`drop()`), not on intermediate hover. Dragging a card B→C→… in quick succession enqueues status
patches that apply in order. (`reorderTasks` exists in
[_actions/tasks.ts](../../../../src/app/_actions/tasks.ts) but is **not wired into any
component** yet; the only live reorder is module/milestone in
[overview.tsx](../../../../src/components/app/overview.tsx).)

**The trade-off serialisation creates.** Correctness is free, but **confirmation latency
stacks**: a burst of N rapid edits drains one-at-a-time, each paying a full round-trip *including
its coarse `revalidatePath`* (§4). Optimistic paint stays instant, but the tail of the queue
confirms late on a remote DB. This is why §4 (scoped invalidation, to drain the queue faster)
and the slow-save affordance (**PP-F3**, gated on `isPending` which naturally spans the queued
tail) matter more here than any ordering guard.

**Caveat — scope of the guarantee.** Serialisation is per client/tab (one `AppRouterActionQueue`).
A second tab, or the MCP surface ([app/mcp/route.ts](../../../../src/app/mcp/route.ts)) writing
concurrently, can still interleave at the DB. That is the multi-client case, an explicit
**non-goal** ([spec.md](spec.md) §3); convergence still holds because each surface re-reads
authoritative truth after its own write.

---

## 3. Reads — stream the shell instead of awaiting data

Write-side optimism cannot touch first paint and navigation (**PP-R**). The shell is decoupled
from data by **route-level Suspense via `loading.tsx`** — the App Router wraps each segment's
`page` in a Suspense boundary whose fallback is the segment's `loading.tsx`.

- **As built:**
  1. **`loading.tsx` per leaf app segment** (project view, overview, inbox, all-projects, settings,
     workspace-settings) renders a structural skeleton at once on navigation (**PP-R2**). Pure
     redirects (`/app`, `/board`) get none — they resolve before painting. The persistent layout
     shell stays painted while the page's slow data streams behind the skeleton (**PP-R1**).
  2. Skeletons ([skeletons.tsx](../../../../src/components/app/skeletons.tsx)) **reuse the real
     layout container classes** (`.topbar`, `.qcap`, `.scroll-body`, `.section`, `.task-row`,
     `.ov-vlayout`…) with shimmer bars inside, so the placeholder occupies the same boxes as the
     real content — holding layout dimensions to keep **CLS** low across the swap. Widths vary
     deterministically by index (never random — no hydration drift).
- **Not yet done (the PP-R3 tail):** **per-sub-region** streaming *within* a page — e.g. the task
  list streaming independently of the project chrome. Each page still loads its data as a unit
  (`loadProject` is one `Promise.all`), so the whole region appears at once behind its skeleton
  rather than filling in piece by piece. Splitting it means breaking the monolithic client views
  (`ProjectView`/`OverviewScreen`) into a fast chrome + a Suspense-wrapped slow region fed by an
  un-awaited promise. Deferred: same-region DB makes the marginal win small until telemetry shows a
  page where one slow query dominates (YAGNI).
- **Optional later:** **PPR / `cacheComponents`** (Next 16) for a static shell + dynamic holes once
  finer boundaries exist.

These are read-path structural changes, independent of the write loop in §1.

---

## 4. Reconciliation scope — stop refetching the whole subtree

Most actions end in `revalidatePath('/app','layout')`
([_actions/tasks.ts](../../../../src/app/_actions/tasks.ts) `refresh()`) — a **coarse
full-subtree refetch** (re-runs `loadShell` + `loadProject`). Cheap against an idle local DB,
expensive across a network, and it compounds the §2 queue: each serialized action drags a full
re-read behind it (**PP-B4**).

**`revalidateTag` was ruled out:** every app route is `force-dynamic`, so nothing is tag-cached —
`revalidateTag` has nothing to invalidate. It would first require introducing `use cache`/
`cacheTag` over the read path; deferred.

**As built — return-row reconcile (the chosen path).** For pure single-field edits shown on the
*same* surface, the action returns the authoritative changed row(s) via **scoped (no-revalidate)
variants** (`updateTaskScoped`, `toggleTaskDoneScoped`, `bulkUpdateTasksScoped`), and the client
**commits** that row into a per-surface **task mirror** instead of refetching:

- [use-reconciled-tasks.ts](../../../../src/lib/use-reconciled-tasks.ts) holds the list in a
  `useState` mirror seeded from the server prop, re-synced whenever the prop changes (navigation, or
  a *revalidating* mutation from another path). It is **not** the global store ADR 0002 rejected —
  it's per-surface and defers to server truth; the optimistic prediction still layers on via
  `useOptimistic` + the pure `applyTaskOptimistic` reducer.
- [toast.tsx](../../../../src/components/ui/toast.tsx) `useReconcileRun` is the §1 optimistic runner
  plus a `commit(returnedRow)` on success, so the prediction **survives** the transition ending
  (no refetch). On throw it commits nothing and reverts to the mirror — same return-to-truth + Retry
  as §7. Verified by fault injection: success → commit persists (no revert); throw → revert to
  mirror + toast; prop change → re-sync.

**Scoped deliberately, per mutation (the key correctness rule).** Reconcile is applied **only** to
edits the shell/other surfaces don't depend on — board drag, list checkbox, list bulk
status/priority/module/milestone. `ProjectView` owns the single mirror and feeds the board
(now presentational) through it, so a drag stays consistent across board↔list. Everything that
moves shell-coupled state **keeps `revalidatePath`**: inbox **assign-to-project** (sidebar
inbox-count badge), all **creates**, **deletes**, **rename** (cross-surface), and pin/config.
Blanket-dropping the revalidate would have staled the sidebar — a real in-session regression, not a
cross-surface non-goal.

This shortens the §2 queue-drain on the highest-frequency edits. The actual query-count/latency win
is **network-bound, so unmeasured locally** (same-region dev DB is too fast to show it) — see
[plan.md](plan.md) PP-B4 / the measurement todo.

---

## 5. Query shape & ordering data

- **Sequential waterfalls (PP-B3) — fixed for reorder.** All three reorders (`taskService.reorder`,
  module, milestone) used to loop per-row `UPDATE` inside a transaction (N statements
  one-after-another). They now issue **one** bulk
  `UPDATE … SET position = CASE … END WHERE id IN (ids)` via the shared
  [`positionByOrder`](../../../../src/server/services/util.ts) helper — queries-per-reorder bounded
  to **1** regardless of list size. (The index is inlined as an integer *literal*, not a bound
  param: Postgres can't infer the type of an untyped `$n` inside `CASE … THEN` and rejects the
  assignment to the integer `position` column — a real bug the int-test caught; `i` is a loop index
  so inlining is injection-safe.) Covered by [services.int.test.ts](../../../../tests/services.int.test.ts).
- **Read-path audit — clean.** The other service reads are already bounded: `loadProject`/`loadShell`
  fan out with `Promise.all`; `assembleTaskDetail` runs its six independent reads concurrently and
  its one dependent read (`userService.getByIds(authorIds)`) is a single batched `inArray`, not an
  N+1; `taskService.list` pulls `attachmentCount` via a subquery join (not per-row); `projectService`
  uses a single `groupBy` for the inbox count; bulk task ops fan out with `Promise.all`. No N+1 or
  sequential-independent waterfall remains in the service layer.
- **Reorder representation (future PP-B optimisation).** `position` is still a dense integer, so a
  reorder rewrites the moved rows' positions (now in one statement). If reorder volume grows, prefer
  **fractional indexing / LexoRank**: a move becomes a single write to the moved row (a key between
  its neighbours) with no renumber. A **PP-B** cost optimisation, *not* a PP-W4 correctness fix —
  ordering is already correct by §2 and the full-array idempotence of the current reorder.

---

## 6. Dual-driver — the cross-cutting constraint

IndieWork runs on **two database drivers** behind one `db`
([db/index.ts](../../../../src/server/db/index.ts)), chosen by `DB_DRIVER`: **Postgres `pg`**
(managed path — Vercel + Supabase) and **libsql** (self-host / public demo). Every
latency-hiding mechanism above must hold on **both**, and a few PP-B items only exist on one:

- **Pooling (PP-B2) is a pg-path concern.** `pg.Pool { max: 10, keepAlive, idleTimeout }` plus
  the Supabase **transaction pooler on `:6543`** (mandated by
  [deploy-vercel-supabase.md](../../../infra/deploy-vercel-supabase.md); direct/IPv6 rejected).
  libsql is in-process — no pool, just a `busy_timeout` guard.
- **Region colocation (PP-B1)** only means anything on the managed path (app and DB across a
  network); trivially met when self-hosted in one process.
- **Driver choice is forced by transactions.** The service layer uses async transaction
  callbacks, which synchronous `better-sqlite3` cannot run — hence libsql. Any design that
  assumes Postgres-only features (e.g. `revalidateTag` is driver-agnostic, but a Postgres-only
  SQL trick for §5 would not be) must degrade cleanly on libsql.

The **managed remote path is the design target** (worst-case envelope, [spec.md](spec.md) §1);
solutions are validated there but must not break the in-process driver.

---

## 7. Failure feedback — surface the revert (as built)

ADR 0002 deliberately shipped a **silent revert**: React reverts the optimistic value on a thrown
action (the §1 convergence), but the user was never told and could not retry. That is the top
intent gap (**PP-F1/F2/F3**), now closed by a **mutation runner + toast layer**
([toast.tsx](../../../../src/components/ui/toast.tsx)), mounted once as `FeedbackProvider` in
[app/layout.tsx](../../../../src/app/app/layout.tsx) so it wraps every write surface.

**The provider** owns a toast stack (portalled to `document.body`, `z-index` above modals) and a
single global **in-flight counter**. Two hooks layer over it, one per mutation shape:

- **`useRun`** — wraps a plain (non-optimistic) action: tracks pending, and on rejection raises an
  error toast tied to the action (**PP-F1**). Returns the resolved value or `undefined` on failure,
  so callers branch on success (navigate / clear a draft only when it actually saved). Used for
  creates, detail-panel edits, comments, attachments, overview config, sidebar, tabs, settings.
- **`useOptimisticRun(applyOptimistic)`** — wraps the ADR 0002 gesture (board drag, list/inbox
  toggle, bulk). It runs `applyOptimistic` + the action inside `startTransition`; on throw, React
  reverts the optimistic value to truth (the action didn't revalidate — §1) **and** the runner
  raises a toast whose **Retry** re-runs the *whole* gesture in a fresh transition (**PP-F2**).

**Why a global counter, not `isPending`.** The original target gated the slow-save indicator on a
`useTransition` `isPending`. The as-built uses a provider-level counter instead: it is incremented
as each write goes in-flight and decremented when it settles, and it **spans every surface**, not
one component's transition. A `1000 ms` timer is armed on the 0→1 edge and cleared on the →0 edge —
so intermediate count changes during a draining burst don't reset it, and one **"Still saving…"**
indicator (`aria-live="polite"`) correctly covers a burst (**PP-F3**). This still relies on §2's
serialisation for *ordering*, but no longer on a single `isPending` to span the tail.

**Retry & draft safety.** Idempotent updates default to a Retry action; **creates use a no-retry
toast** (a retry could duplicate a write whose response was merely lost). Surfaces that compose a
draft — comment composer, sub-task add, the workspace/project forms — clear or close **only on a
truthy (success) result**, so a failed save keeps what the user typed (**PP-F2**: never lost without
acknowledgement). `app/error.tsx` is the route-level backstop for the *other* failure class — a
fault thrown while a route's data loads or renders (e.g. Server Action version-skew after a deploy).

**Verified, not assumed.** The decisive risk was whether catching the thrown error *inside* the
transition still lets `useOptimistic` revert to truth. Fault injection of the real runner confirms
it: the optimistic value paints, then reverts to truth at the throw, with the error toast and a
working Retry; the slow-save indicator stays hidden for sub-1 s writes and appears past the
threshold. (Local fault-injection of the runner path; a remote-latency smoke test on the live
surfaces is tracked as the PP-F slice of the §measurement todo in [plan.md](plan.md).)

---

## 8. Client read-cache & the base ⊕ draft reconcile substrate (target — not yet built)

§1–§7 hold the write path instant and the read shell streaming **without ever caching read data on
the client** — "the server *is* the cache" (§1). Two requirements break that stance and need a small,
deliberate client-side store: **PP-R5** (re-opening a recently-viewed entity must paint instantly,
not re-pay the load) and **PP-W5** (a list and an open detail panel must stay consistent on every
field). The detail panel today does its **own independent fetch** on every open/switch
([use-task-detail.ts](../../../../src/components/app/task-detail/use-task-detail.ts) `useEffect` →
`getTaskDetailByRef`) with **no** mirror and **no** `useOptimistic` — so clicking A → B → A re-reads
A from the (possibly slow) DB each time, and a list edit never reaches an open panel.

**The shared substrate: server-base ⊕ local-draft.** Model each open entity as two layers, rendered
merged:

```
render(entity) = { ...base, ...draft }     // draft wins, per field
```

- **`base`** — the server snapshot (the cache value). Reads **and** write responses write here, but
  **monotonically**: an incoming value is applied only if its version is **≥** the base's current
  version, so a late read can never move `base` backwards. Version source: the entity's `updatedAt`
  (currently in the DB schema but **not** exposed in `toTaskDto` — a small DTO addition) or, as a
  fallback, a per-entity client epoch bumped on each local mutation.
- **`draft`** — `Partial<fields>` the user has changed locally and not yet reconciled. Set on edit;
  **cleared per field** when that field's write resolves (its returned row updates `base`). A read
  never touches `draft`, so a background revalidation cannot stomp an in-progress edit.

This is the same *optimistic-over-authoritative-base* shape ADR 0002 uses for the board/list
(`useOptimistic` over the `tasks` prop), generalised to a free-text, multi-field surface and made to
persist a draft across the typing window rather than only for a transition's duration.

**The substrate is necessary but not sufficient** — each requirement layers its own wiring on top,
and they are **different problems**:

- **Layer A — cross-surface propagation (PP-W5, spatial).** Two concurrently-visible views of the
  same entity must converge. base ⊕ draft *in the panel alone does not do this* — the list and panel
  must read from a **shared source** (one mirror feeding both) or publish patches both subscribe to
  (a first-class bidirectional `iw:task-updated`, extending the current title-only event). This is
  the bulk of **IW-99** and is larger than "add a cache". → tracked as PP-W5 in [plan.md](plan.md).
- **Layer B — read cache + revalidation + version guard (PP-R5 / PP-F6, temporal).** One view over
  successive fetches. A per-`ref` cache store seeds `base` instantly on re-open (PP-R5); a background
  revalidation (on open / on focus / past a `staleTime`) refreshes `base` under the monotonic version
  guard; the draft overlay + version guard together are the **PP-F6** correctness tax — the step §2
  says the no-cache design avoided. The cache primarily buys **perceived** instant paint; `staleTime`
  is the knob that also cuts real refetches, and single-user lets it be generous (only the rare MCP /
  external write changes data this client didn't make).

**Scope guard.** This is a per-surface read store for the detail entity, **not** the global
`tasks` store ADR 0002 rejected (and not offline durability — DB stays the source of truth, [spec.md
§3](spec.md)). It reverses the §1 "no client cache" stance **only** for cached entity reads, with the
version guard as the price. Reasoned in [ADR 0003](../../../adr/0003-client-read-cache-reconcile.md).

**Failure & convergence.** A failed field write clears its `draft` entry → reverts to `base` + the
existing toast/Retry (§7). Convergence to server truth (**PP-F4**) is unchanged: `base` always settles
to the latest authoritative row; `draft` only ever delays a *stale* value from winning, never a newer
one.

---

## References

- [spec.md](spec.md) — the requirements these mechanisms satisfy.
- [plan.md](plan.md) — per-ID status; links into the sections above.
- [ADR 0002](../../../adr/0002-optimistic-updates.md) — the optimistic-update decision (§1, §7).
- [ADR 0003](../../../adr/0003-client-read-cache-reconcile.md) — the client read-cache + base ⊕ draft
  reconcile decision (§8); reverses the §1 "no client cache" stance for cached reads.
- [deploy-vercel-supabase.md](../../../infra/deploy-vercel-supabase.md) — managed-path infra (§6).
- Next 16 action queue: `packages/next/src/client/components/app-router-instance.ts`
  (`AppRouterActionQueue`, `runRemainingActions`) — the basis for §2.
