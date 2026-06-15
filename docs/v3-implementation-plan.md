# IndieWork — v3 Implementation Plan

> Maps the design **v2 → v3** changes (plus v2 **sub-tasks**) onto the real codebase.
> Companion to [roadmap.md](roadmap.md) and [scope.md](scope.md). Source of truth for
> the design: `design-handoff/design_handoff_indiework_pm_v3/README.md` and the delta doc
> `design-handoff/design_handoff_indiework_pm_v3_changes/README.md`. **Where this plan and
> the design CSS disagree, the CSS wins.**

## Baseline reality (important)

The committed codebase is at **v1**, not v2. It has **none** of:
sub-tasks (`parentId`), attachments, the new statuses (`in_review`/`pending`/`--st-danger`),
the views system, display/filter popovers, configurable board, or upgraded modules. It still
ships the 7-state model with `blocked`.

**Scope decided:** full v3 parity **including v2 sub-tasks**. **Attachments:** model + UI shell
now, real file storage **deferred** (wired to a TODO stub).

## Architecture we're mapping onto

| Concern | Current implementation | Consequence for v3 |
|---|---|---|
| Domain enums | `src/lib/domain.ts` — single source feeding Drizzle schema, zod validators, REST, MCP, UI | Status/board/module changes start **here**; types propagate for free, but **DB data + seeds need a migration**. |
| Views | **Real routes**: `/app/p/[KEY]` (Issues), `/board`, `/overview` via `<Link>` in `project-header.tsx` | Per-view List/Board mode means **route-as-mode breaks**. Merge Issues+Board into one route; keep Overview separate. |
| Display state | Ephemeral `useState` in `task-list.tsx` (`groupBy`/`subGroupBy`/`filters`) — resets on nav | v3 adds `fields`, `statusOrder/Hidden`, `boardCfg`, `viewModes`, `customViews` → **persist to `localStorage`** (single-user; namespace all keys `iw-*` after the brand indiework.space). |
| Detail panel | `detail-panel.tsx` fetches via server action, patches + `router.refresh()` | Pattern stays; add sub-tasks + attachments sections, redo status-note. |
| Board | `board.tsx` fixed `BOARD_COLUMNS`, drag→status | Generalize to `boardCfg` + `boardBuckets` + swimlanes. |
| External | REST `/api/v1/*` + MCP `/mcp` over shared validators | Enum/type changes inherit automatically; **DTOs + MCP roster need an explicit field pass**. |

**Persistence philosophy:** this is single-user self-hosted. Keep `?task=` (and add `?view=`)
in the URL for deep-linking; everything else (modes, custom views, group order, board config,
sidebar collapsed) lives in `localStorage`. No new server state for view preferences.
**All keys namespaced `iw-*`** (after the brand indiework.space): `iw-sidebar-w`, `iw-sb-collapsed`,
`iw-view-modes`, `iw-custom-views`, `iw-display-<KEY>`, `iw-board-<KEY>`. The existing `wb-sidebar-w`
in `app-shell.tsx` is renamed to `iw-sidebar-w` in Phase 0.

---

## Phase 0 — Foundation: domain, tokens, schema, migration

Everything downstream depends on this. Land and verify against live Postgres before UI work.

**`src/lib/domain.ts`**
- `TASK_STATUS`: remove `blocked`; add `in_review`, `pending` → 8 states
  `inbox · backlog · todo · in_progress · in_review · pending · done · cancelled`.
- Add `TASK_STATUS_LABEL` entries (`In review`, `Pending`).
- Add `DEFAULT_STATUS_ORDER = ['in_progress','in_review','pending','todo','backlog','done','cancelled']`.
- `BOARD_COLUMNS` → `['todo','in_progress','pending','in_review','done']`.
- Add `MODULE_STATES` (`planned·active·done·archived` → status color keys `backlog·in_progress·done·cancelled`)
  and `MODULE_ICONS` (curated key list).

**`src/styles/tokens.css`** (light + dark blocks)
- Add `--st-in_review` (violet ~305) + `-bg`, `--st-pending` (amber ~73–78) + `-bg`,
  `--st-danger` (red ~32–38) + `-bg`. Alias `--st-blocked: var(--st-danger)` (+ `-bg`) so legacy rules survive.

**`src/server/db/schema.ts`**
- `tasks`: add `parentId uuid references(tasks.id, onDelete:'cascade')` (self-ref, one level — enforced in service);
  add index on `parentId`.
- `modules`: add `icon text`, `state text {enum: MODULE_STATES} default 'active'`, `desc text`.
- New `attachments` table (metadata only): `{ id, taskId →tasks cascade, name, type('file'|'image'),
  size text, kind/ext text, path text NULL (storage TODO), url text NULL, createdAt }`.

**Migration + seeds** (no data migration — nothing valuable exists yet; reseed instead)
- `pnpm db:generate` → review SQL (additive: new columns + `attachments` table; status is `text`, no enum DDL).
- Rebuild `src/server/db/seed.ts` + `seed-sample.ts` as the v3 reference data: 8-state statuses
  (incl. `in_review`/`pending`, no `blocked`), modules with `icon/state/desc`, a few sub-tasks, sample attachments.

**Validators**
- `validators/module.ts`: add `icon`, `state` (`z.enum(MODULE_STATES)`), `desc` to create/update schemas.
- `validators/task.ts`: add `parentId: z.uuid().nullish()` to `createTaskSchema`. (Status enum auto-updates.)

**Audit:** `grep -rn "blocked"` hits 10 files (`task-row`, `detail-panel`, `overview`, `sidebar`,
`all-projects`, `domain`, `seed-sample`, 3 CSS). Walk each — repoint task-status uses to `pending`,
repoint destructive/overdue styling to `--st-danger`.

---

## Phase 1 — Status model (UI)

- `src/components/ui/interactive.tsx` `CircleCheck`: add glyphs — `in_review` violet pie, `pending` amber dash/disc.
- `task-row.tsx`: warm second-line condition `status === 'blocked'` → `status === 'pending'`; strip a leading
  `PENDING:` prefix for display.
- `detail-panel.tsx`: `blocked` → `pending`; `data-blocked` → `data-pending`. Status-note redesign (Phase done here or in Phase 8 §status-note — see below).
- `bits.tsx` `DuePill`: overdue color → `--st-danger`.
- `lib/grouping.ts` `groupSpec('status')`: order buckets by `DEFAULT_STATUS_ORDER`; honor `statusOrder`/`statusHidden`
  (wired in Phase 3).

**Status-note redesign** (`detail-panel.tsx` `StatusNote`): relabel **"Current state · what's the status?"**
(sparkle icon); `pending` variant **"What's this waiting on?"** (bolt, warm tint). Render only when there's a note
**or** status is `pending`; otherwise collapse to a quiet **"＋ Add status note"**. (Label string is already
half-migrated — finish it.)

---

## Phase 2 — Modules upgraded (icon + state + desc)

- Schema/validators done in Phase 0. `module.service.ts` already has `reorder` — extend create/update to pass new fields.
- New `ModuleIcon` label component (in `bits.tsx`): tinted icon + name (replaces bare color dot).
- Render the tinted icon everywhere a module appears: `task-row` `ModuleTag`, `board.tsx` cards,
  `detail-panel.tsx` Module property, list section headers (`SectionHeadIcon` + `grouping.ts` module buckets carry `icon`).
- Icon picker lives in Overview (Phase 5).

---

## Phase 3 — Views system + Display/Filter popovers

The biggest structural change.

**Header merge** — `project-header.tsx`: collapse `.topbar` + `.tabs` into one `.tabs-lead` row:
emoji (picker) + editable name, separator, then views `Overview · All issues · Active · Backlog · {custom} · ＋`,
with **Filter** + **Display** icon buttons right-aligned.

**Routing** — keep Overview as its own route. Merge **Issues + Board into one route** that renders list-or-board
from the active view's stored mode. Active view id in `?view=` (default `issues`); `?task=` unchanged.
Drop the standalone `/board` route (redirect → `?view=…`).

**Built-in views** (scope predicates over root tasks):
- *All issues* — everything. *Active* — exclude `backlog`/`inbox`, **defaults to Board**.
- *Backlog* — `backlog` only; quick-capture here creates with `status:'backlog'`.

**Custom views** — `＋` appends `{id,label}`; inline rename/remove. Persist `localStorage["iw-custom-views"]`.

**Per-view mode** — `viewModes: {[tabId]:'list'|'board'}`, tab icon reflects mode. Persist `localStorage["iw-view-modes"]`.

**Display popover** (rework `display-control.tsx`, split into Display + Filter):
- View type (List/Board) · **Grouping** + **Sub-grouping** dropdowns (`.dp-dd-btn`, replacing `.seg-btn`) ·
  Show sub-tasks · Hide done · **Show fields** (Task ID/Priority/Module/Milestone/Status — each toggle renders a
  **live mini-example**) → `filters.fields`.
- **Group-ordering sub-screen** when grouping by Status: drag-reorder + eye-toggle hidden → `statusOrder`/`statusHidden`.
- Available grouping dims already computed per project (`computeAvailDims`).
- **Filter popover**: status + priority chips (existing chip UI, moved out).
- Persist display prefs to `localStorage` (per project key).

**`task-row.tsx`**: gate each reveal-meta element on `filters.fields` (taskId/priority/module/milestone/status).

---

## Phase 4 — Configurable board

- `boardCfg = { columns, rows, ordering, showEmptyCols, showEmptyRows, hideDone, fields, colOrder, hiddenCols }`;
  persist `localStorage`. Default `columns` = `BOARD_COLUMNS`.
- `boardBuckets()` (new, in `grouping.ts` — parallel to `buildSections`): expand a dimension into ordered
  columns; `rows` dim adds swimlanes (header row + lanes).
- `board.tsx`: render from `boardBuckets`; drag→column applies that bucket's **patch** (status/module/milestone/priority,
  not only status); cards respect `boardCfg.fields`. Add a **Board Display popover** mirroring the list one + a
  column reorder/hide sub-screen.

---

## Phase 5 — Overview rebuilt (vertical rail)

`overview.tsx` → vertical sub-tab rail `.ov-vnav` / `.ov-vtab` / `.ov-vpanel`:
- **Info** — short description, status + status note, prefix/key, **tag editor**, Markdown description.
- **Milestones** — cards with drag-reorder grip (service `reorder` exists), inline name, **state picker**
  (Planned/Active/Done/Archived), compact inline date (text until clicked), progress + done count.
- **Modules** — same + **icon + color picker** popover (`MODULE_ICONS` + swatches) and inline **description**.

---

## Phase 6 — Sub-tasks (v2 parity)

**Refs.** `parseRef`/`getByRef` assume `KEY-<digits>` and the DB has `tasks_project_seq_unique(projectId, seq)`.
**Decision (revised):** sub-tasks are **first-class tasks** — they allocate their own per-project `seq`, so they get a
normal `KEY-<n>` ref (e.g. `DISK-15`) and are addressable by every ref-based tool (`update_task`, `get_task`,
`add_comment`, …) with no special parsing. The earlier dot-ref scheme (`seq = NULL` + derived `${parentRef}.N`) is
dropped; it left sub-tasks unaddressable over MCP. Sub-tasks under an **Inbox** parent keep `seq = NULL` (like any
Inbox task) until the parent is assigned.

- **Service** (`task.service.ts`): `addSubtask(parentId, title, status?)` — inherits parent
  `projectId/moduleId/milestoneId`, defaults `status:'todo'`, allocates `seq` via `allocateSeq` when the parent is in a
  project (else `seq:null`). Enforce **one level** (reject if parent already has `parentId`). Delete cascades via FK;
  ensure bulk-delete also covers children.
- **Derived** (`load.ts` or client): `rootTasks` (`parentId == null`) and `childrenMap` (`parentId → child[]`).
  List/board/search/grouping operate on **root tasks only**.
- **`task-row.tsx`**: sub-task count pill (`N/M`, green when complete) + optional inline checklist when
  "Show sub-tasks" is on.
- **`detail-panel.tsx`**: parent **breadcrumb** when viewing a sub-task; **Sub-tasks section** (progress bar + child
  rows + inline "Add sub-task" that keeps focus).
- New icon `listTree`.

---

## Phase 7 — Attachments (model + UI shell; storage deferred)

- Table + DTO field from Phase 0; `TaskDto` carries `attachments[]`.
- `detail-panel.tsx` **Attachments section** (`.dp-attach`): header (count + ＋ Add), `.attach-item` rows
  (image thumb **or** extension-tinted file tile; name; ext · size · day; download + remove), drag/drop + browse dropzone.
- `task-row.tsx`: 📎 count in reveal-meta (gated by `filters.fields`).
- New icons: `paperclip`, `fileText`, `image`, `download`, `bookmark`.
- **TODO (deferred):** real upload — POST endpoint writing to the chosen backend (local volume recommended later),
  storing `path`. For now: UI shell + metadata CRUD; uploads either disabled or stubbed (object URL, session-only).
  Mark clearly so it isn't mistaken for finished.

---

## Phase 8 — External surfaces, sidebar, cleanup

- **MCP** `src/app/mcp/route.ts`: roster is `create_task · list_tasks · get_task · update_task · add_comment ·
  set_status_note · list_projects · list_inbox`. Status enum updates free; **explicitly** extend tool schemas/descriptions
  for new fields (`parentId`/sub-tasks, `attachments`, module `icon/state/desc`). Consider `add_subtask`, module tools.
- **REST** `/api/v1/*`: confirm new task/module fields serialize; status enum migration reflected in route validators.
- **Sidebar** (`sidebar.tsx`): add collapsible toggle (persist `iw-sb-collapsed`); project grouping already by status.
- **Comments**: `COMMENT_SOURCE` already includes `mcp` (codebase extends design's web/api/agent) — leave as is.
- **Tests**: update `tests/domain.test.ts` (8-state set, board columns, status order) and
  `tests/services.int.test.ts` (status migration, `addSubtask` + dot-ref + one-level guard, module fields, attachment CRUD).

---

## Files touched (quick index)

| Area | Files |
|---|---|
| Domain/tokens | `lib/domain.ts`, `styles/tokens.css`, `styles/app.css`, `styles/screens.css` |
| Schema/migration | `server/db/schema.ts`, `drizzle/*` (generated), `server/db/seed.ts`, `seed-sample.ts` |
| Validators | `validators/task.ts`, `validators/module.ts` (+ `milestone.ts` if state set changes) |
| Services | `services/task.service.ts` (subtask, derived), `module.service.ts`, `dto.ts`, `load.ts` |
| List/grouping | `lib/grouping.ts`, `components/app/task-list.tsx`, `task-row.tsx`, `display-control.tsx` |
| Detail | `components/app/detail-panel.tsx`, `components/ui/interactive.tsx`, `components/ui/bits.tsx` |
| Views/header/board | `components/app/project-header.tsx`, `board.tsx`, `app/app/p/[projectKey]/(board|overview)/page.tsx` |
| Overview | `components/app/overview.tsx` |
| Sidebar/icons | `components/app/sidebar.tsx`, `components/ui/icons.tsx` |
| External | `app/mcp/route.ts`, `app/api/v1/**` |

## Risks / watch-items

1. **Status change** — no data migration (nothing valuable exists); both seed files are rebuilt for v3. The column is
   `text`, so the schema change is additive only.
2. **Dot-refs** — must not flow through `parseRef`/`tasks_project_seq_unique`; settle the scheme before coding Phase 6.
3. **Views routing churn** — merging Issues/Board + per-view mode is the riskiest refactor; do it behind `?view=` and
   keep Overview untouched to bound blast radius.
4. **localStorage sprawl** — namespace keys (`iw-*`) and centralize read/write so SSR hydration doesn't flash.
5. **Attachments "looks done" trap** — keep the deferred upload visibly stubbed.

## Suggested order

`0 → 1 → 2` (foundation + status + modules, all schema-rooted) → `5` (Overview consumes module pickers) →
`3 → 4` (views, then board config) → `6` (sub-tasks) → `7` (attachments shell) → `8` (external + cleanup).
Phases 1, 2, 5, 6, 7 are largely independent once Phase 0 lands and can be parallelized.
