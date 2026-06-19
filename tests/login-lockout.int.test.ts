import { describe, test, expect, vi } from 'vitest';

// Integration check: drive the REAL login() against the REAL loginRateLimiter
// singleton (default config — threshold 5) so a misconfigured singleton or
// mis-wired action can't pass. Only the I/O collaborators are mocked; the limiter
// runs for real, with just the constant delay stubbed out so the test is fast.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ set: vi.fn() }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/server/auth/session', () => ({
  passwordMatches: () => Promise.resolve(false), // every attempt is wrong
  createSessionValue: () => Promise.resolve('sess'),
  SESSION_COOKIE: 'iw_session',
  SESSION_MAX_AGE: 100,
}));
// Keep the real singleton + clientIp; stub only the delay so 6 attempts are instant.
vi.mock('@/server/auth/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/auth/rate-limit')>();
  return { ...actual, sleep: () => Promise.resolve(), LOGIN_CONSTANT_DELAY_MS: 0 };
});

import { login } from '@/app/_actions/auth';

function wrongPassword(): FormData {
  const f = new FormData();
  f.set('password', 'wrong');
  f.set('next', '/app');
  return f;
}

describe('login() lockout — real limiter, default config', () => {
  test('locks out after the configured threshold of wrong passwords', async () => {
    // threshold = 5: attempts 1–5 report a wrong password (the 5th trips the lock),
    // so the 6th is refused up front with the retry message.
    for (let i = 0; i < 5; i++) {
      const res = await login({ error: null }, wrongPassword());
      expect(res.error).toBe('Wrong password.');
    }
    const blocked = await login({ error: null }, wrongPassword());
    expect(blocked.error).toMatch(/^Too many attempts\. Try again in \d+s\.$/);
  });
});
