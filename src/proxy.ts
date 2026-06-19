import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionValue } from '@/server/auth/session';

/**
 * Runs at the edge of every HTML document, with two jobs:
 *
 *  1. Auth gate — anything under `/app/*` needs a valid session cookie, else we
 *     redirect to `/login`. The landing (`/`), `/login`, `/api/*` and `/mcp` are
 *     public (API/MCP carry their own Bearer auth) and skip the gate.
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
  // 1) Auth gate for the app shell only.
  if (req.nextUrl.pathname.startsWith('/app')) {
    const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
    if (!ok) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', req.nextUrl.pathname);
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
  // Every route except API/MCP (own auth + error shapes), Next's static assets,
  // and the favicon. The `missing` clause skips client-side prefetches so a
  // prefetched payload never carries a nonce that won't match its document.
  matcher: [
    {
      source: '/((?!api|mcp|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
