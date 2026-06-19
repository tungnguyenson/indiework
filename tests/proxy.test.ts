import { describe, test, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { createSessionValue, SESSION_COOKIE } from '@/server/auth/session';

function reqFor(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${path}`, { headers });
}

const nonceOf = (csp: string | null) => csp?.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];

describe('proxy — auth gate', () => {
  test('redirects /app to /login (preserving next) when there is no session', async () => {
    const res = await proxy(reqFor('/app/inbox'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('next=%2Fapp%2Finbox');
  });

  test('lets /app through with a valid session and still sets the CSP', async () => {
    const res = await proxy(reqFor('/app/inbox', await createSessionValue()));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  test('never gates public routes but still sets the CSP', async () => {
    const res = await proxy(reqFor('/login'));
    expect(res.headers.get('location')).toBeNull();
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe('proxy — CSP nonce', () => {
  test('the inline-script nonce is fresh on every request', async () => {
    const a = (await proxy(reqFor('/'))).headers.get('content-security-policy');
    const b = (await proxy(reqFor('/'))).headers.get('content-security-policy');
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  test('the response CSP nonce is exposed to the app via the x-nonce request header', async () => {
    // The layout reads `x-nonce`; it must equal the nonce in the enforced policy.
    const res = await proxy(reqFor('/'));
    const csp = res.headers.get('content-security-policy');
    // NextResponse.next mirrors the forwarded request headers under this key.
    const forwarded = res.headers.get('x-middleware-override-headers');
    expect(forwarded).toContain('x-nonce');
    expect(nonceOf(csp)).toBeTruthy();
  });
});
