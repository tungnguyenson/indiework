# IndieWork design system — how to build with it

IndieWork is a **calm, light-first project manager for solo devs** (soft elevation, airy spacing, a single green accent). These are small, presentational React primitives — status chips, tags, pickers, a modal, a popover — composed into task rows, detail panels, and pickers.

## Setup — no provider, just the stylesheet + theme attribute
The components are **pure and presentational — there is no context/provider to wrap them in.** They style themselves; all you must do is load the design system's `styles.css` (already bound), which carries the tokens, the fonts (**Hanken Grotesk** UI face, **IBM Plex Mono** for refs), and the component CSS.

- **Theme:** light is the default. For dark mode set `data-theme="dark"` on a wrapping element (or `<html>`) — a full dark palette ships and every token re-resolves. Don't hand-pick dark colors; just flip the attribute.
- **Status / priority are data-driven:** pass the real string (`status="in_progress"`, `priority="high"`) and the component selects its own palette colour. Never restyle a chip yourself.

## The styling idiom — semantic classes + CSS-variable tokens (NOT utilities, NOT style props)
Components render their own semantic classes (`.chip`, `.st-chip`, `.meta-tag`, `.pri-bars`, `.progress`, `.due-pill`, `.circle-check`, `.ref-tag`, `.popover`, `.modal`). For **your own layout glue around them**, use the design tokens — never hardcoded hex/px:

| Role | Tokens |
|---|---|
| Surfaces | `--bg-canvas` (page), `--bg-surface` (cards/menus), `--bg-sunken`, `--bg-hover` |
| Text | `--text-strong` (headings), `--text` (body), `--text-muted`, `--text-faint` |
| Lines | `--border`, `--border-soft`, `--border-strong` |
| Accent | `--accent` (brand green), `--accent-strong` (hover), `--accent-ring` (focus), `--accent-softer` (tint) |
| Radii | `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-pill` |
| Shadow | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |
| Status | `--st-<status>` + `--st-<status>-bg` for `inbox · backlog · todo · in_progress · in_review · pending · done · cancelled`; destructive = `--st-danger` |
| Priority | `--pr-none · --pr-low · --pr-medium · --pr-high · --pr-urgent` |
| Fonts | `--font-ui` (Hanken Grotesk), `--font-mono` (IBM Plex Mono) |

Reusable composition classes you can apply to your own elements: `.field` (label + input block), `.btn` and `.btn.btn-primary` (actions — the primary is accent-filled), `.prop-control` (a quiet inline trigger button), `.dot` (an 8px status dot — `<span className="dot" style={{ background: 'var(--st-in_progress)' }} />`), `.popover` (a floating menu surface).

## Where the truth lives
- **Tokens & component CSS:** read `styles.css` and its `@import` closure (the tokens file + `_ds_bundle.css`) for the full, authoritative variable list.
- **Per-component API + usage:** each component ships `<Name>.d.ts` (props contract) and `<Name>.prompt.md` (usage) under `components/<group>/<Name>/`. Read those before composing a component.

## One idiomatic example — a compact task row
```tsx
// Components come from the IndieWork bundle (window.IndieWork.*).
import { RefTag, PriorityBars, DuePill, StatusChip } from 'indiework';

<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)' }}>
  <RefTag value="IW-42" />
  <span style={{ flex: 1, color: 'var(--text-strong)' }}>Wire the webhook retry queue</span>
  <PriorityBars priority="high" />
  <DuePill due="2026-06-30" />
  <StatusChip status="in_progress" />
</div>
```
The controls are real library components; the row, spacing, and surface are your own glue built only from tokens. That is the whole idiom.
