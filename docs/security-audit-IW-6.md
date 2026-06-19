# Security Audit — IndieWork (IW-6)

**Date:** 2026-06-19 · **Branch:** `feat/task-improvements` · **Scope:** post REST/MCP surface
**Auditor:** Claude (security review) · **Method:** manual source review of every auth, API,
MCP, server-action, service, and validator file + Next.js security-guidance cross-check (context7).

---

## Threat model & assumptions (load-bearing)

IndieWork is **single-tenant by design**: one `APP_PASSWORD` (web login), one static
`API_TOKEN` (REST + MCP Bearer), one human operator. There is **no user table and no
per-user/per-workspace data isolation** — all data belongs to the one operator.

Consequence for this audit: **"authorization" reduces to "is the caller authenticated?"**
There is no horizontal/IDOR privilege boundary to cross (every row is the one user's), so
raw `id`/`ref` access, the unsigned workspace cookie, and unenforced API-key `scope` are
**not** vulnerabilities in this model — they're rated LOW/informational. The entire security
perimeter is therefore the **authentication gate**: keep unauthenticated internet traffic out
of mutations and reads. That gate is where the one critical defect lives.

---

## Findings summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | 🔴 **CRITICAL** | Server Actions perform no auth check; the `proxy` matcher doesn't cover the action-dispatch routes → unauthenticated read **and** mutation of all data, incl. API-key minting | ✅ **Fixed** (IW-48) |
| 2 | 🟠 **HIGH** | No rate-limit / lockout on the login password → unthrottled brute-force of the single secret | Should fix |
| 3 | 🟡 **MEDIUM** | No security headers (CSP, X-Frame-Options, HSTS, nosniff) — violates the project's own `web/security.md` | Should fix |
| 4 | 🔵 **LOW** | `mdToHtml` (dead code) interpolates link URLs into `href="…"` without escaping `"` → latent stored XSS if ever wired in | Delete or fix |
| 5 | 🔵 **LOW** | Bearer compare short-circuits on length mismatch (`constantTimeEqual`) → leaks token length via timing | Optional |
| 6 | 🔵 **LOW** | `WORKSPACE_COOKIE` is unsigned; managed `api_keys.scope` not enforced | Informational (single-tenant) |
| 7 | ⚪ **INFO** | Attachment file storage deferred — path-traversal/SSRF surface not yet live | Track for Phase 7 |

### Verified clean (in-scope, checked)

- **SQL injection** — Drizzle parameterized throughout; every `sql\`…\`` fragment is a static
  literal with bound schema identifiers, no user-string concatenation. ✅
- **XSS (live paths)** — TipTap editor configured `html: false` (raw HTML escaped); React
  attribute escaping; the one `dangerouslySetInnerHTML` (font boot script) is built from
  server constants, not user input. ✅
- **Input validation** — zod `.parse()` at **every** service boundary (task, project,
  milestone, module, comment, attachment, api-key, workspace). Update schemas are closed
  `z.object`s → unknown keys stripped, so `id`/`seq`/`createdAt` can't be mass-assigned. ✅
- **Secret leakage** — clients get generic messages (`Internal server error`); detail is
  server-only `console.error`; `env.ts` is server-import-only so secrets stay out of the
  client bundle. ✅
- **Secrets in git** — `.env` is git-ignored; only `*.example` files are tracked. ✅
- **Open redirect** — `safeNext()` restricts the post-login `next` to `/app…`. ✅
- **Session cookie** — HMAC-SHA256 signed, `httpOnly`, `sameSite=lax`, `secure` in prod,
  30-day expiry; password compared as HMACs, not raw strings. ✅

---

## 1 — 🔴 CRITICAL: Server Actions have no authentication check

**Files:** [src/app/_actions/tasks.ts](../src/app/_actions/tasks.ts),
[projects.ts](../src/app/_actions/projects.ts),
[structure.ts](../src/app/_actions/structure.ts),
[workspace.ts](../src/app/_actions/workspace.ts),
[apikeys.ts](../src/app/_actions/apikeys.ts),
[queries.ts](../src/app/_actions/queries.ts) · gate: [src/proxy.ts](../src/proxy.ts)

**Principle (sufficient on its own).** Next.js Server Actions are public HTTP endpoints. Per
Next.js's own guidance, *"Page-level authentication checks do not automatically extend to
Server Actions … it is critical to re-verify authentication and authorization directly inside
each Server Action, as the action serves as a separate entry point."* (`data-security.mdx`,
`authentication.mdx`, `production-checklist.mdx`.)

None of `_actions/*.ts` calls `verifySessionValue` or any session check. The **only** thing
standing between the internet and `deleteTask` / `createApiKey` / `archiveProject` is the
`proxy` middleware.

**Concrete exploitation vector — the matcher gap.** The gate matches one prefix:

```ts
// src/proxy.ts
export const config = { matcher: ['/app/:path*'] };
```

`/`, `/login`, `/api/*`, `/mcp` are **not** matched, so `proxy` never runs for them. A Server
Action is dispatched by its **action ID** (the `Next-Action` header), independent of the URL
path the POST lands on — and action IDs ship in the public `/_next/static` JS bundles. An
unauthenticated attacker POSTs a known action ID to **`/`** or **`/login`** (both App-Router
pages, both outside the matcher): `proxy` doesn't run, no action checks the cookie, and the
mutation executes with **no session**.

**Impact:** full unauthenticated CRUD over every task, project, milestone, module, and
workspace; permanent `deleteTask`/`deleteMilestone`; and **`createApiKey`**, which mints a key
and returns its secret. The read actions in `queries.ts` (`loadSearchIndex`, `getTaskDetail*`)
likewise leak all data unauthenticated. This is effectively a full auth bypass for the web tier.

> Next's built-in Server-Action CSRF defense (Origin must equal Host) does **not** mitigate
> this: a non-browser attacker (curl) sets `Origin` to match `Host` trivially. It only blocks
> cross-origin *browser* CSRF, not direct invocation.

**Why the REST/MCP tier is not affected:** every `/api/v1/*` route and `/mcp` calls
`requireBearer()` *inside the handler* — the correct pattern. The defect is specific to the
Server-Action tier, which leans on middleware instead.

### Fix (required)

Add a server-side session guard and call it at the top of **every** mutating (and ideally every
read) action — do **not** merely widen the matcher (middleware auth is fragile; cf.
CVE-2025-29927, patched in 16.2.9 but the architectural lesson stands).

```ts
// src/server/auth/require-session.ts
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionValue } from '@/server/auth/session';
import { ServiceError } from '@/server/services';

/** Throw unless the caller presents a valid session cookie. Call first in every action. */
export async function requireSession(): Promise<void> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionValue(value))) {
    throw new ServiceError('unauthorized', 'Not authenticated');
  }
}
```

```ts
// e.g. src/app/_actions/tasks.ts
export async function deleteTask(id: string) {
  await requireSession();          // ← add to every action
  await taskService.delete(id);
  refresh();
}
```

Keep `proxy.ts` as defense-in-depth for the page redirect UX, but it is no longer the security
boundary. **Verification PoC:** with the dev server running, `curl -X POST http://localhost:3000/`
with a captured `Next-Action` ID and no cookie should mutate before the fix and return
unauthorized after.

> **✅ Remediated (IW-48, branch `feat/task-improvements`).** Added
> [src/server/auth/require-session.ts](../src/server/auth/require-session.ts) (`requireSession()`
> → reads `iw_session` → `verifySessionValue`, throws `ServiceError('unauthorized')`) and call it
> as the first line of **every** action in `tasks.ts`, `projects.ts`, `structure.ts`,
> `workspace.ts`, `apikeys.ts`, and the reads in `queries.ts`. `login`/`logout` stay ungated
> (login is the auth entry; logout is a safe no-op). Added an `'unauthorized'` service-error code
> (→ 401 in `api-response.ts`) and `tests/auth.test.ts` (11 tests: session crypto round-trip,
> tamper/expiry rejection, Bearer check, and the guard with a mocked cookie jar). Full suite 67
> passing, typecheck clean.

---

## 2 — 🟠 HIGH: Login password has no rate limiting / lockout

**Files:** [src/app/_actions/auth.ts](../src/app/_actions/auth.ts),
[src/app/login/login-form.tsx](../src/app/login/login-form.tsx)

`login()` checks `passwordMatches()` with no attempt counter, delay, or lockout. The whole app
is protected by this **one** password, so an attacker can brute-force it at full speed (and via
the same matcher gap, the action can be hammered off-route). "rate-limit endpoint" is explicitly
in IW-6's scope.

**Fix:** throttle by IP (and globally) on the login action — e.g. a fixed/sliding-window counter
in the DB or an in-memory limiter, with exponential backoff after N failures, plus a small
constant delay on every attempt. Recommend a high-entropy `APP_PASSWORD` as compensating control
in the meantime. The Bearer endpoints are lower risk (token is high-entropy random) but adding a
limiter there too guards against abuse/DoS.

---

## 3 — 🟡 MEDIUM: No security headers

**File:** [next.config.ts](../next.config.ts) (no `headers()`); no CSP anywhere.

The project's own standard ([web/security.md]) mandates a production CSP. Currently shipped with
none of: `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` (clickjacking),
`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy`.

**Fix:** add a `headers()` block (or `vercel.ts`) emitting the set from `web/security.md`. A CSP
also limits blast radius of any future XSS (e.g. finding #4).

---

## 4 — 🔵 LOW: `mdToHtml` href-attribute injection (latent / dead code)

**File:** [src/lib/markdown.ts](../src/lib/markdown.ts)

`escapeHtml` escapes `&`/`<`/`>` but **not** `"`, and the link rule interpolates the URL into an
attribute: `<a href="$2" …>`. A crafted link such as
`[x](https://a" onmouseover="alert(document.cookie))` breaks out of the `href` and injects an
event handler → stored XSS. **Currently inert:** `grep` confirms `mdToHtml` is exported but never
imported; live rendering goes through TipTap (`html:false`). 

**Fix:** delete the unused module, or — if it will be used — escape `"` (and `'`) in attribute
context and keep the `https?:`-only allowlist. Don't let it get wired in as-is.

---

## 5 — 🔵 LOW: Bearer comparison leaks token length

**File:** [src/server/auth/token.ts](../src/server/auth/token.ts) — `constantTimeEqual`
returns early on `a.length !== b.length`, leaking the secret's length via timing. Minor (token is
high-entropy random). **Fix (optional):** compare fixed-length digests, e.g. HMAC both sides and
compare the HMACs (as `session.ts` already does for the password).

---

## 6 — 🔵 LOW / informational (single-tenant)

- **Unsigned `WORKSPACE_COOKIE`** ([workspace.ts](../src/app/_actions/workspace.ts)) — a client
  can set any workspace id, but all workspaces belong to the one operator, so there's no
  boundary crossed. Sign it if multi-workspace/multi-user lands (Phase 4).
- **`api_keys.scope` not enforced** — managed keys aren't wired into `requireBearer` yet (still
  the static `API_TOKEN`); `verify()` ignores scope. Enforce scope when managed keys replace the
  env token (Phase 4).

---

## 7 — ⚪ INFO: Attachment storage (deferred)

[attachment.service.ts](../src/server/services/attachment.service.ts) stores metadata only;
`path`/`url` stay null until storage is wired (Phase 7). When connected, audit for path
traversal in stored filenames, MIME sniffing, SSRF on any fetch-by-URL, and an authz check on the
download route. Not exploitable today.

---

## Recommended remediation order

1. **#1 (CRITICAL, blocking):** add `requireSession()` to every server action — ~30 min, unblocks merge.
2. **#2 (HIGH):** login rate-limit / lockout.
3. **#3 (MEDIUM):** security headers + CSP.
4. **#4/#5 (LOW):** delete/fix `mdToHtml`; length-safe Bearer compare.
5. Track #6/#7 against Phase 4 / Phase 7.

Only **#1 blocks**. Everything else is rated recommendation.
