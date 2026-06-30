import { describe, test, expect } from 'vitest';
import { GET } from '@/app/auth/expire/route';
import { SESSION_COOKIE } from '@/server/auth/session';

// The expire route (IW-101) is the one thing that breaks the demo-reset trap:
// it deletes the still-signed session cookie before bouncing to /login, so
// /login's signature-only gate can't bounce it straight back to /app.
function get(path: string) {
  return GET(new Request(`http://localhost${path}`));
}

describe('GET /auth/expire', () => {
  test('clears the session cookie and redirects to /login', () => {
    const res = get('/auth/expire');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    // A deletion is an immediately-expired cookie.
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
    // MUST be Path=/ to overwrite the login cookie; a default `/auth`-scoped
    // deletion wouldn't match it and would loop the redirect forever.
    expect(setCookie).toMatch(/path=\//i);
  });

  test('preserves an /app destination as next', () => {
    const res = get('/auth/expire?next=%2Fapp%2Finbox');
    expect(res.headers.get('location')).toContain('next=%2Fapp%2Finbox');
  });

  test('clamps a hostile next to /app before redirecting', () => {
    const res = get('/auth/expire?next=https%3A%2F%2Fevil.example%2Fsteal');
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('next=%2Fapp');
    expect(loc).not.toContain('evil.example');
  });
});
