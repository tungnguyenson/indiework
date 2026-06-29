# Perceived Performance — Solution Status (Living Tracker)

> Maps each requirement in **[spec.md](spec.md)** (the source of truth) to its current state.
> **Unmet requirements stay unchecked todos here.** The *design* behind each item — patterns,
> trade-offs, target shape — lives in **[solution.md](solution.md)** (organised by mechanism);
> this file links into it and only tracks status. This file changes whenever a solution ships or
> a measurement is taken; the requirements file changes only when the bar itself moves.

**Legend:** `[x]` ✅ met · `[~]` 🚧 partial / by-construction-unverified · `[ ]` ⬜ not started
**Snapshot date:** 2026-06-26 · against `main`. Shipped this pass: **(#1)** failure-feedback layer
(toast + mutation runner — [toast.tsx](../../../../src/components/ui/toast.tsx),
[app/error.tsx](../../../../src/app/app/error.tsx)); **(#2)** route-level streaming —
`loading.tsx` per leaf app segment + dimension-matched skeletons
([skeletons.tsx](../../../../src/components/app/skeletons.tsx)); **(#3)** return-row reconcile for
pure same-surface field edits (scoped no-revalidate actions + a client task mirror —
[use-reconciled-tasks.ts](../../../../src/lib/use-reconciled-tasks.ts)); **(#4)** reorders collapsed
to one bulk `CASE` update ([positionByOrder](../../../../src/server/services/util.ts)) + read-path
N+1 audit. Still absent: per-sub-region `<Suspense>` inside a page; tag-based read caching (still
`force-dynamic`); live-deploy measurement (PP-R4/PP-B5); client read-cache for instant re-open + the base ⊕ draft
reconcile substrate (**PP-R5 / PP-F6** new this pass, and the cross-surface half of **PP-W5** —
all not started). `reactCompiler: true`.

---

## PP-W — Write responsiveness

- [x] **PP-W1** — Optimistic paint via `useOptimistic` + `startTransition`, per surface
  ([optimistic.ts](../../../../src/lib/optimistic.ts), [board.tsx](../../../../src/components/app/board.tsx),
  [task-list.tsx](../../../../src/components/app/task-list.tsx), [inbox.tsx](../../../../src/components/app/inbox.tsx);
  [ADR 0002](../../../adr/0002-optimistic-updates.md)). Met for board drag, list/inbox toggle, bulk single-field.
  → design: [solution.md §1](solution.md).
- [~] **PP-W2** — Surface stays mounted under `startTransition`, holds **by construction**; but
  **no explicit pending affordance** and **not load-verified**. *Todo: verify INP < 200 ms during a pending save.*
  → design: [solution.md §1, §7](solution.md).
- [~] **PP-W3** — Independent gestures use independent transitions; holds **by construction**.
  Not verified back-to-back on a slow DB. *Todo: trace two rapid edits remote.* → design: [solution.md §2](solution.md).
- [~] **PP-W4** — Last-intent convergence under rapid same-entity writes. Holds **by construction**:
  Next serialises Server Actions per client (`AppRouterActionQueue`), so writes apply in intent
  order. *Todo: confirm with a back-to-back board-drag trace remote.* → design: [solution.md §2](solution.md).
- [ ] **PP-W5** — Same-screen cross-surface consistency (list ↔ open detail panel) on **every**
  field. **Not met — only partially wired.** The client event bus `iw:task-updated`
  ([use-task-detail.ts](../../../../src/components/app/task-detail/use-task-detail.ts),
  [task-list.tsx](../../../../src/components/app/task-list.tsx)) syncs **title** list→panel only:
  status/priority/module/milestone do **not** reach an open panel (list edits are scoped + don't
  broadcast), and panel→list waits on `revalidatePath` (~1 s+ on a remote DB). Promoted from a former
  non-goal ([spec.md](spec.md) §3 bar-change, 2026-06-26). *Plan: make `iw:task-updated` a
  first-class **bidirectional** sync — every task mutation publishes its patch; the list
  `useReconciledTasks` mirror **and** the open panel both subscribe — paired with scoped actions;
  keep `revalidatePath` where the shell (sidebar counts) depends. Verify all 4 matrix cells
  (title/status × list↔panel) via DevTools.* **Shares the base ⊕ draft substrate now documented in
  [solution.md §8](solution.md), but PP-W5 is the *spatial* half — it additionally needs the
  cross-surface propagation (shared mirror / bidirectional event), which is the bulk of this task
  and distinct from the PP-R5 read cache (the *temporal* half).** (Tracked: **IW-99**.) → design:
  [solution.md §1, §8](solution.md).

## PP-R — Read & navigation responsiveness

- [x] **PP-R1** — Shell paints without blocking on data. **Met:** the persistent app layout
  (sidebar/chrome) renders independently of the page; each segment's slow data now streams behind a
  `loading.tsx` Suspense fallback instead of blocking the shell. (`loadShell` itself is a small
  same-region read.) → design: [solution.md §3](solution.md).
- [x] **PP-R2** — Immediate loading state on navigation. **Met:** `loading.tsx` per leaf app
  segment ([skeletons.tsx](../../../../src/components/app/skeletons.tsx)) — project view, overview,
  inbox, all-projects, settings, workspace-settings — so a navigation paints a structural skeleton
  at once, never a blank screen or a frozen copy of the previous view. → design: [solution.md §3](solution.md).
- [~] **PP-R3** — Progressive streaming of slow regions. **Partial:** each segment streams behind a
  skeleton that **reuses the real layout container classes** (`.topbar`/`.qcap`/`.scroll-body`/
  `.task-row`…) so the swap holds layout dimensions (CLS target met by construction). *Not yet
  done:* per-**sub-region** streaming **within** a page (e.g. task list streaming separately from
  the project chrome) — pages still load their data as a unit. Deferred (the monolithic client
  views would need splitting; same-region DB makes it low-priority until measured — YAGNI).
  → design: [solution.md §3](solution.md).
- [ ] **PP-R4** — LCP < 2.5 s on production target. **Unmeasured** (needs the live deploy). Trace
  once on Vercel+Supabase.
  → design: [solution.md §3](solution.md).
- [ ] **PP-R5** — Instant re-open of an already-viewed entity. **Not started.** Today the detail
  panel re-fetches on every open/switch ([use-task-detail.ts](../../../../src/components/app/task-detail/use-task-detail.ts)
  `useEffect` → `getTaskDetailByRef`), so A → B → A re-pays the load each time. *Plan: a per-`ref`
  client read-store seeds content instantly on re-open, then revalidates in the background under a
  monotonic version guard (Layer B of the base ⊕ draft substrate). Reverses the §1 "no client cache"
  stance for cached reads — see [ADR 0003](../../../adr/0003-client-read-cache-reconcile.md). Verify
  with the network throttled: re-open paints cached content within budget, never blocks on a fresh
  round-trip.* (Tracked: **IW-100**.) → design: [solution.md §8](solution.md).

## PP-B — Server/DB latency budget

- [x] **PP-B1** — Region colocation. **Met (documented operator requirement):**
  [deploy-vercel-supabase.md](../../../infra/deploy-vercel-supabase.md) Step 1. *Deploy-time choice,
  not enforced in code.* → design: [solution.md §6](solution.md).
- [x] **PP-B2** — Connection pooling. **Met:** transaction pooler on `6543` for the app runtime
  (same doc); direct/IPv6 rejected. → design: [solution.md §6](solution.md).
- [x] **PP-B3** — No N+1 / sequential waterfall. **Met & audited.** All three reorders (task,
  module, milestone) collapsed from N per-row `UPDATE`s to **one** bulk `CASE` update via
  [`positionByOrder`](../../../../src/server/services/util.ts) (covered by
  [services.int.test.ts](../../../../tests/services.int.test.ts), which caught a pg type-cast bug).
  Read paths audited clean: `loadProject`/`loadShell`/`assembleTaskDetail` fan out with `Promise.all`
  (one dependent batched `getByIds`, not N+1); `taskService.list` joins `attachmentCount`;
  `projectService` uses one `groupBy`; bulk ops fan out concurrently. → design: [solution.md §5](solution.md).
- [~] **PP-B4** — Scoped invalidation. **Implemented; mechanism verified, latency unmeasured.**
  High-frequency pure same-surface field edits (board drag, list checkbox, list bulk
  status/priority/module/milestone) now use **return-row reconcile** — scoped no-revalidate actions
  + a per-surface task mirror ([use-reconciled-tasks.ts](../../../../src/lib/use-reconciled-tasks.ts),
  [toast.tsx](../../../../src/components/ui/toast.tsx) `useReconcileRun`) commit the returned row
  instead of re-reading the whole subtree. Shell-coupled edits (inbox assign → sidebar badge,
  creates, deletes, rename) deliberately **keep** `revalidatePath`. `revalidateTag` ruled out
  (inert under `force-dynamic`). *The query-count/latency reduction is network-bound — unmeasurable
  on the same-region dev DB; confirm on the live deploy alongside PP-B5.* → design:
  [solution.md §4](solution.md).
- [ ] **PP-B5** — P95 action round-trip < 400 ms. **Unmeasured** (no telemetry). *Todo: add action
  timing; read Vercel observability.* → design: [solution.md §2, §4](solution.md).

## PP-F — Failure feedback & reconciliation

- [x] **PP-F1** — Visible error on failure. **Met:** the mutation runner
  ([toast.tsx](../../../../src/components/ui/toast.tsx) `useRun`/`useOptimisticRun`) catches every
  action failure and raises a dismissable error toast (`role="alert"`, `aria-live="assertive"`)
  tied to the failed gesture, wired across **all** write surfaces (board/list/inbox, detail panel +
  comments + sub-tasks + attachments, overview module/milestone config, sidebar, tabs, settings,
  forms); `app/error.tsx` is the route-level backstop for load/render faults. *Verified by fault
  injection of the real runner (forced throw → toast).* → design: [solution.md §7](solution.md).
- [x] **PP-F2** — Revert **plus** retry path. **Met:** React auto-reverts on throw (PP-F4) and the
  toast carries a **Retry** that re-applies the whole optimistic gesture (verified: retry re-flips
  the optimistic value, then re-runs). Drafts (comment/sub-task/forms) are kept on failure, never
  silently dropped. Creates use a no-retry toast (avoids duplicate-write on a lost response).
  → design: [solution.md §7](solution.md).
- [x] **PP-F3** — "Still saving…" after ~1 s. **Met:** a global in-flight counter in the provider
  arms a `1000 ms` timer on the 0→1 edge; the indicator stays hidden for fast writes and reveals
  only past the threshold, clearing when all writes settle. *Verified: hidden at 300 ms, shown at
  1200 ms, cleared on resolve.* → design: [solution.md §7](solution.md).
- [x] **PP-F4** — Convergence to server truth. **Met:** awaited action's `revalidatePath` re-flows
  authoritative `tasks`; `useOptimistic` reconciles, a thrown action auto-reverts — **confirmed
  empirically** that catching the error inside the transition still reverts to truth. → design:
  [solution.md §1](solution.md).
- [~] **PP-F5** — Late / out-of-order **write** response must not overwrite newer state. Holds **by
  construction** *for the write path*: actions serialise (PP-W4) and there is no manual
  response-apply step to clobber. **Scope note:** this by-construction hold does **not** extend to a
  client read cache — a background revalidation *is* a manual apply — so the read path is split out
  as PP-F6 below rather than silently relying on this line. → design: [solution.md §2](solution.md).
- [ ] **PP-F6** — A read / revalidation must not clobber an in-progress draft or a newer committed
  value, on **every** field. **Not started** (the failure mode only exists once PP-R5's read cache
  lands). *Plan: the base ⊕ draft substrate ([solution.md §8](solution.md)) — a per-entity monotonic
  version guard (`updatedAt` exposed in `toTaskDto`, or a client epoch) so a stale read never moves
  `base` backwards, plus a draft overlay so a background read never touches a field being edited.
  Don't lean on Server-Action queue ordering for the read (the read fires from a `useEffect`, not a
  transition — ordering there is unverified and the guard must hold regardless). Verify by
  fault-injecting a delayed/stale read while editing each field (see [spec.md](spec.md) §4).*
  (Tracked: **IW-100**, with PP-R5.) → design: [solution.md §8](solution.md).

---

## Open todos — prioritized

The user flagged **error feedback** as the top intent gap. Infra (PP-B1/B2) is already satisfied by
the deploy doc, so the open, in-repo work, in priority order:

1. ~~**Failure feedback (PP-F1, PP-F2, PP-F3)**~~ — ✅ **done** (IW-93): toast + mutation runner +
   slow-save indicator + route error boundary. Closes the ADR 0002 silent-revert gap.
2. ~~**Streaming reads (PP-R1, PP-R2, PP-R3)**~~ — ✅ **done** (PP-R1/R2 met; PP-R3 partial):
   `loading.tsx` per leaf segment + dimension-matched skeletons. Remaining: per-sub-region
   `<Suspense>` within a page (deferred — needs splitting the monolithic client views).
3. ~~**Scoped invalidation (PP-B4)**~~ — ✅ **done** (mechanism verified; latency remote-only):
   return-row reconcile for pure same-surface field edits; shell-coupled edits keep `revalidatePath`.
4. ~~**Query-shape audit (PP-B3)**~~ — ✅ **done**: reorders collapsed to one bulk `CASE` update;
   read paths audited clean (no N+1). Fractional-index `position` deferred (YAGNI until volume warrants).
5. **Measurement (PP-R4, PP-B5, verify PP-W2/W3/W4)** — trace against the real Vercel+Supabase deploy
   so targets are checked with data, not assumed. *(Also worth a smoke-test of PP-F1/F2/F3 on the
   real surfaces against remote latency, to complement the local fault-injection verification.)*
6. **Client read-cache + base ⊕ draft reconcile (PP-R5, PP-F6, and the cross-surface half of PP-W5)**
   — the one **new** design this pass ([solution.md §8](solution.md), [ADR 0003](../../../adr/0003-client-read-cache-reconcile.md)).
   Build order: (a) the substrate — server-base ⊕ local-draft in `useTaskDetail`, with the monotonic
   version guard (expose `updatedAt` in `toTaskDto` first); (b) Layer B — per-`ref` read cache +
   revalidation triggers (PP-R5/PP-F6); (c) Layer A — cross-surface propagation to close PP-W5
   (IW-99). Each layer ships + verifies independently. Carries a real correctness tax (PP-F6) —
   land it with the fault-injection tests, not after.

> Each item above is a candidate IndieWork task in project **IW**. Mirror them with the `indiework`
> skill when you want them on the board.
