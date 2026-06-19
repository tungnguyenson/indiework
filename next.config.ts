import type { NextConfig } from "next";

// Static security headers for every response. The Content-Security-Policy is
// NOT here — it carries a per-request nonce and is emitted by src/proxy.ts.
// `frame-ancestors 'none'` (in the CSP) is the modern clickjacking control;
// X-Frame-Options: DENY is kept as a fallback for older browsers.
const securityHeaders = [
  // Browsers ignore HSTS over plain HTTP, so it's safe to send unconditionally.
  // No `preload` — that's a heavy commitment (preload-list submission) we don't opt into.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
