import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth/session';
import { safeNext } from '@/server/auth/safe-next';

/**
 * Clear a stale session cookie, then bounce to `/login`.
 *
 * The edge proxy and `/login` gate on the cookie's *signature* only, while the
 * RSC loaders verify the `userId` against the DB. After a demo reset (or any
 * user deletion) a cookie can stay signature-valid yet point at a row that's
 * gone — so a render-time `requireSession()` throws `unauthorized`. The RSC
 * paths redirect here (see `withFreshSession`) instead of 500-ing.
 *
 * Deleting the cookie is what breaks the `/login ⇄ /app` trap: `/login`'s
 * signature-only gate would otherwise bounce the still-present cookie straight
 * back into the failing app shell, and the logout button lives in that shell —
 * which never renders. A GET (not the `logout` Server Action) so a server-side
 * `redirect()` can target it; it lives outside `/app`, so the proxy's auth gate
 * never applies.
 */
export function GET(req: Request): NextResponse {
  const next = safeNext(new URL(req.url).searchParams.get('next'));
  const res = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
  // Overwrite-and-expire with the SAME attributes login set it with — crucially
  // `path: '/'` (see auth.ts). A bare `delete(name)` would emit a Set-Cookie
  // whose default Path is derived from this request (`/auth`), which does NOT
  // match the live `/`-scoped cookie — the browser would keep it and the
  // `/app → /auth/expire → /login → /app` bounce would loop forever.
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
