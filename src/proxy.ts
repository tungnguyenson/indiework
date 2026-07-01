import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionValue } from '@/server/auth/session';

/**
 * Runs at the edge of every HTML document, with two jobs:
 *
 *  1. Session routing — anything under `/app/*` needs a valid session cookie,
 *     else we redirect to `/login`. Conversely, an authed visitor landing on the
 *     marketing page (`/`) is bounced straight to `/app`, so a logged-in user
 *     never has to re-enter through `/login` to be recognised. Both use the same
 *     signature+expiry check (`verifySessionValue`, no DB lookup) as `/login`, so
 *     the three never disagree and loop; a signature-valid-but-DB-stale cookie is
 *     caught downstream by the app layout's `withFreshSession`. `/login`, `/api/*`
 *     and `/mcp` stay public (API/MCP carry their own Bearer auth). The landing is
 *     still served to anonymous visitors — a missing cookie short-circuits before
 *     any crypto, so they never pay the verify.
 *
 *  2. Per-request CSP — emit a fresh nonce and a strict Content-Security-Policy
 *     built around it. Next auto-applies the nonce to its own framework/bundle
 *     scripts; the one app-authored inline script (the font boot in layout.tsx)
 *     reads it back from the `x-nonce` request header. The static header set
 *     (HSTS, nosniff, frame, referrer, permissions) lives in next.config.ts.
 *
 * Next 16 `proxy` runs on the Node runtime, so the Web Crypto session check works.
 */
export async function proxy(req: NextRequest) {
  // 1) Session routing. Gate the app shell; conversely, bounce an already-authed
  //    visitor off the landing page into the app. An anonymous visitor (no
  //    cookie) short-circuits inside verifySessionValue, so `/` stays free.
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/app')) {
    const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
    if (!ok) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  } else if (pathname === '/') {
    const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
    if (ok) {
      const url = req.nextUrl.clone();
      url.pathname = '/app';
      return NextResponse.redirect(url);
    }
  }

  // 2) Per-request CSP nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' trusts the nonced loader to pull the rest of the bundles;
    // 'self' is the CSP2 fallback. 'unsafe-eval' is dev-only (React Refresh).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Inline styles can't be nonced (React `style` props, next/font and TipTap
    // all emit un-nonced inline styles), so 'unsafe-inline' — per web/security.md.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    // Same-origin fetch / Server Actions; ws: for the dev HMR socket.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // No `upgrade-insecure-requests`: it adds nothing here (every subresource is
    // same-origin, and HSTS already pins HTTPS) but WOULD white-screen a
    // plain-HTTP deploy — which deploy-vps.md lists as a valid option — by
    // upgrading same-origin requests to an https host that has no TLS.
  ];
  const csp = directives.join('; ');

  // Next reads the nonce from the CSP on the *request* headers to nonce its own
  // scripts; we also set it on the response so the browser enforces the policy.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  // Every route except API/MCP (own auth + error shapes), all of `_next`, and the
  // favicon. Excluding all of `_next` (not just static/image) keeps the proxy off
  // the dev HMR WebSocket upgrade at `/_next/webpack-hmr` — returning a normal HTTP
  // response there breaks the 101 handshake (ERR_INVALID_HTTP_RESPONSE) and kills
  // hot reload. The `missing` clause skips client-side prefetches so a prefetched
  // payload never carries a nonce that won't match its document.
  matcher: [
    {
      source: '/((?!api|mcp|_next|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
