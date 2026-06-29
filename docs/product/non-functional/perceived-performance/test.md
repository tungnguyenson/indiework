# Perceived Performance — DevTools Verification Run

> Measurement evidence for the requirements in **[spec.md](spec.md)**, complementing the
> by-construction status in **[plan.md](plan.md)**. Records *what was actually traced in a browser
> against a slow remote DB* — the measurement the same-region dev DB could not show.
>
> **Run date:** 2026-06-26 · branch `feat/perceived-perf` · Chrome DevTools MCP.

## Environment under test

| | |
|---|---|
| **App** | `next dev` (Turbopack), on the local Mac |
| **DB** | Supabase Postgres, **Seoul** (`aws-1-ap-northeast-2`), transaction pooler `:6543` |
| **Topology** | **app (local) → DB (Seoul) over the public internet** |
| **Driver** | `pg` (managed path) |
| **Data** | 5 projects (DISK 89-task heaviest / SITE / API / MOBILE / TEST 2-task scratch), 1 workspace |
| **Tooling** | Chrome DevTools MCP — performance traces, network panel, DOM probes, DB cross-checks |

### ⚠️ Topology caveat (governs how results are read)

This topology is **harsher than production**, not equal to it. Production is **colocated** (Vercel
Seoul + Supabase Seoul, app↔DB typically <5 ms). Here the app sits on a home connection and every
query crosses the public internet to Seoul (observed TTFB ~1.2–1.6 s).

- **Mechanism tests are valid here** (Section A). A slow backend is the ideal stress test for the
  latency-hiding behaviours that were *unmeasurable* on the fast local DB. Relative comparisons hold
  regardless of absolute RTT.
- **Absolute-latency targets are NOT valid here** (Section B). PP-R4 (LCP) and PP-B5 (P95 round-trip)
  are inflated by home→Seoul RTT; a "fail" there is a **topology artifact**, not a code verdict.
  They stay open pending the colocated Vercel+Supabase deploy.

### ⚙️ Setup gotcha discovered (must read before re-running)

The app must be driven via **`http://localhost:3000`**, *not* `http://127.0.0.1:3000`. Next 16's
`allowedDevOrigins` default allows `localhost` but **blocks `127.0.0.1`** as a cross-origin dev
resource. Loading via `127.0.0.1` leaves the page **server-rendered but never hydrated** — every
button is dead (no optimistic update, no toast), and the HMR socket fails with
`ERR_INVALID_HTTP_RESPONSE`. The user's normal browser uses `localhost`, so the app works there; the
DevTools probe initially used `127.0.0.1` and saw a "dead" app. *(Optional fix:
`allowedDevOrigins: ['127.0.0.1']` in `next.config.ts`.)* This is a **dev-only / origin-only**
issue — not a code defect, not present in prod.

### Auth

Session is an `httpOnly` signed cookie; the public-demo login page prints its own creds
(`admin@example.com` / `demo`), so a single real form login carries the run. No secret exposure.

---

## A. Verifiable on this topology — **8 clean PASS + A5 (mechanism OK, absolute CLS unconfirmed)**

### A1 · PP-W1 — Optimistic paint is instant ✅
- **Probe:** toggle a list checkbox; time the `aria-pressed` flip vs the action round-trip.
- **Result:** **optimistic flip at 30 ms** while the Seoul write was still in flight (settled ~1.9 s
  later). Paint is fully decoupled from the round-trip. **PASS.**

### A2 · PP-W2 — INP < 200 ms during a pending save ✅
- **Probe:** DevTools performance trace around a *trusted* checkbox click on the **heaviest** list
  (DISK, 89 tasks).
- **Result:** **INP = 152 ms (< 200 ms)** despite the slow DB — the cost is the optimistic
  re-render of a large list, never the ~2 s round-trip. CLS during the interaction = 0.01. **PASS**
  (worst-case list; smaller lists are faster). Dev React is slower than prod (no full compiler
  output + dev overhead), so prod INP is **≤** this — the pass is **conservative**. **Verifies the
  `[~]` PP-W2 in plan.md.**

### A3 · PP-W3 / PP-W4 — Independent writes serialize; last intent wins ✅
- **Probe:** fire two rapid *opposite* toggles on one task; observe optimistic states + final DB.
- **Result:** painted `true → false → true` (each intent reflected instantly); after both drained,
  UI **and DB** = **done = last intent**. Network shows the toggles as discrete serialized POSTs.
  **PASS. Verifies the `[~]` PP-W3/W4 in plan.md** (was source-level only).

### A4 · PP-R1 / PP-R2 — Shell-first + skeleton on navigation ✅
- **Probe:** cold full-load of a project with a rAF observer for `.skel*` elements; plus a soft
  sidebar navigation.
- **Result:** cold load rendered **31 skeleton elements** (`.skel` / `.skel-strip` — the ProjectView
  skeleton) before content; the persistent shell stayed painted. Soft-navs to **prefetched** routes
  were **instant** (no skeleton needed — Next prefetch). `loading.tsx` present for all 6 leaf
  segments. **PASS.**

### A5 · PP-R3 — Skeleton holds layout (low CLS) 🟡 *(mechanism OK; absolute CLS unconfirmed)*
- **Probe:** CLS across the skeleton→content swap (warm vs cold), per-shift source attribution, and a
  code check of the font setup.
- **Result:** **warm reload CLS ≈ 0** and **interaction CLS 0.01** — the skeleton holds dimensions. A
  **cold-load transient of 0.17** appeared once, but **its shift sources were NOT directly captured**
  (the source observer happened to fire on a *warm* reload, which had ~0 shift). Font-swap — the one
  prod-relevant CLS source here — is **mitigated by construction**: all four families load via
  `next/font/google` with the default metric-adjusted fallback (`size-adjust`; no raw `@font-face`),
  and only the active face is preloaded. That leaves the 0.17 most plausibly **dev-only**
  (route-compile reflow + the Next devtools overlay) — but **unconfirmed**. **Mechanism holds on warm
  loads; the cold-load 0.17 is an unconfirmed source, so the absolute steady-state CLS stays a
  prod-build measurement (bucket with B1). Not a clean pass.**

### A6 · PP-B4 — Return-row reconcile vs full-subtree revalidate ✅ **(centerpiece)**
- **Probe:** compare the action response of a reconcile edit (checkbox) vs a revalidate edit (pin).
- **Result — the win solution.md §4 said it couldn't measure locally:**

  | Action | Path | Response payload | Subtree re-read? |
  |---|---|---|---|
  | Checkbox toggle | **reconcile** (`toggleTaskDoneScoped`) | **602 B** (one task row) | **No** — no `x-action-revalidated`, no refetch |
  | Project pin POST | revalidate | **25,483 B** | Yes — header `x-action-revalidated: 1` |
  | → follow-on `GET …?_rsc=` | revalidate | **25,157 B** | full subtree (sidebar projects + task rows) |

  Reconcile = **602 B, no follow-on request**; revalidate ≈ **50 KB across two requests** + the server
  re-running `loadShell`+`loadProject` against Seoul. **~40–80× smaller payload on the highest-frequency
  edits, and it skips the slow part. PASS.** *Traced via the checkbox; board drag and list bulk edits
  share the same `useReconcileRun` / `useReconciledTasks` path (so checkbox is representative) but were
  not directly traced.*

### A7 · PP-F1 / PP-F2 — Visible error + revert + retry on failure ✅
- **Probe:** DevTools **Offline** emulation, then attempt a checkbox write; then restore + Retry.
- **Result:** optimistic flip at 32 ms → on failure **reverted to truth at 59 ms** + dismissable
  **error toast `"Couldn't update that task."`** (`role="alert"`) with a working **Retry**. Back
  online, **Retry re-applied the gesture and the write persisted** (DB `completed_at` set, toast
  cleared). **PASS (PP-F1; PP-F2 revert+retry leg; PP-F4 revert leg).** *Scope: the
  draft-preservation half of PP-F2 (comment / sub-task / form text kept on a failed save) was **not
  exercised** here — only the toggle's revert+retry.*

### A8 · PP-F3 — "Still saving…" after ~1 s, clears on settle ✅
- **Probe:** single checkbox write on the slow DB; watch the indicator.
- **Result:** indicator **appeared at 1011 ms** (armed on the 1 s threshold) and **cleared at 1920 ms**
  on settle. **First real observation of it firing** — it never triggered on the fast local DB.
  **PASS.**

### A9 · PP-F4 — Convergence to server truth ✅
- **Probe:** after reconcile, revalidate, failed-then-retried, and serialized writes — cross-check UI
  vs a direct DB query.
- **Result:** UI matched **DB truth on every path** (e.g. both TEST tasks `status=done` +
  `completed_at` set after their writes; DISK-47 = last intent). Reconcile committed the returned row
  *and* the server persisted it without a refetch. **PASS.**

---

## B. Indicative only — needs the colocated deploy

Recorded for signal; home→Seoul RTT inflates these. **Not** flipped to met — they remain open in
plan.md pending Vercel+Supabase.

### B1 · PP-R4 — LCP < 2.5 s ⏸️ indicative
- **Result:** cold-load LCP **2615 ms** then **2953 ms**, of which **TTFB ~1.2–1.6 s is the home→Seoul
  round-trip** for the shell's data (CLS-clean render otherwise). On a colocated deploy TTFB collapses
  to single-digit ms. **Indicative > 2.5 s here = topology artifact; verdict needs prod.**

### B2 · PP-B5 — P95 action round-trip < 400 ms ⏸️ indicative
- **Result:** observed action settle times **~1.9 s** (reconcile toggle) up to ~3 s (revalidate +
  refetch), dominated by home→Seoul latency. **Indicative >> 400 ms = topology artifact; verdict needs
  prod telemetry.** Note A6 shows the reconcile path already minimizes the *server* work behind each
  round-trip.

---

## Findings summary

- **Section A (8 clean PASS + A5 mechanism-OK):** every interactive perceived-performance mechanism
  holds under a *harsher than production* backend; only A5's absolute cold-load CLS is unconfirmed.
  Highlights:
  - Optimistic paint **30 ms**, INP **152 ms** on the 89-task list — write feedback is decoupled from
    the ~2 s round-trip.
  - **A6 (the centerpiece):** reconcile **602 B / no refetch** vs revalidate **~50 KB + subtree
    re-read** — the PP-B4 win is now *measured*, not asserted.
  - Failure path is real: revert **+ toast + working Retry**; **"Still saving…"** fires at **1011 ms**
    and clears on settle (first time it's been seen live).
  - Convergence cross-checked against the DB on every path.
- **plan.md updates earned by this run:** PP-W2, PP-W3, PP-W4 move from `[~]` (by-construction) to
  **verified**; PP-F3 and PP-B4 gain real measurements behind their `[x]`/`[~]`.
- **Section B (PP-R4, PP-B5): unchanged** — open, pending the colocated Vercel+Supabase deploy. The
  numbers here are topology-inflated and must not be read as the production verdict.
- **Setup note:** drive via `localhost`, not `127.0.0.1` (see the gotcha above) — the only reason the
  app first appeared "broken" in the automation browser.
