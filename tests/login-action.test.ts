import { describe, test, expect, vi, beforeEach } from 'vitest';

// Wiring test for the login() server action: that the limiter gates the password
// check, applies the delay, records failures, and resets on success — and that an
// indeterminate IP never hits the per-IP hard lock. The limiter's own arithmetic
// is covered in rate-limit.test.ts; here every collaborator is mocked so we assert
// control flow only. `vi.hoisted` keeps the mock fns reachable from the hoisted
// vi.mock factories.
const m = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  passwordMatches: vi.fn(),
  check: vi.fn(),
  fail: vi.fn(),
  reset: vi.fn(),
  recordGlobalFailure: vi.fn(),
  globalDelayMs: vi.fn(() => 0),
  clientIp: vi.fn<() => string | null>(() => '9.9.9.9'),
  sleep: vi.fn(() => Promise.resolve()),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT'); // mimic Next's redirect control-flow throw
  }),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ set: m.cookieSet }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '9.9.9.9' })),
}));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/server/auth/session', () => ({
  passwordMatches: m.passwordMatches,
  createSessionValue: () => Promise.resolve('sess.value'),
  SESSION_COOKIE: 'iw_session',
  SESSION_MAX_AGE: 100,
}));
vi.mock('@/server/auth/rate-limit', () => ({
  loginRateLimiter: {
    check: m.check,
    fail: m.fail,
    reset: m.reset,
    recordGlobalFailure: m.recordGlobalFailure,
    globalDelayMs: m.globalDelayMs,
  },
  clientIp: m.clientIp,
  sleep: m.sleep,
  LOGIN_CONSTANT_DELAY_MS: 0,
}));

import { login } from '@/app/_actions/auth';

function form(password: string): FormData {
  const f = new FormData();
  f.set('password', password);
  f.set('next', '/app');
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.globalDelayMs.mockReturnValue(0);
  m.clientIp.mockReturnValue('9.9.9.9');
});

describe('login() wiring', () => {
  test('a blocked IP is refused without checking the password or delaying', async () => {
    m.check.mockReturnValue({ blocked: true, retryAfterSec: 12 });

    const res = await login({ error: null }, form('anything'));

    expect(res.error).toMatch(/12s/);
    expect(m.passwordMatches).not.toHaveBeenCalled();
    expect(m.sleep).not.toHaveBeenCalled(); // short-circuited before the delay
    expect(m.fail).not.toHaveBeenCalled();
    expect(m.cookieSet).not.toHaveBeenCalled();
  });

  test('a wrong password delays, returns the generic error, and records a failure', async () => {
    m.check.mockReturnValue({ blocked: false, retryAfterSec: 0 });
    m.passwordMatches.mockResolvedValue(false);

    const res = await login({ error: null }, form('nope'));

    expect(res.error).toBe('Wrong password.');
    expect(m.sleep).toHaveBeenCalledTimes(1); // constant delay on every attempt
    expect(m.fail).toHaveBeenCalledWith('9.9.9.9');
    expect(m.recordGlobalFailure).toHaveBeenCalledTimes(1);
    expect(m.reset).not.toHaveBeenCalled();
    expect(m.cookieSet).not.toHaveBeenCalled();
  });

  test('a correct password resets the limiter and sets the session cookie', async () => {
    m.check.mockReturnValue({ blocked: false, retryAfterSec: 0 });
    m.passwordMatches.mockResolvedValue(true);

    // redirect() throws (Next control-flow signal) — that throw IS the success path.
    await expect(login({ error: null }, form('correct'))).rejects.toThrow('NEXT_REDIRECT');

    expect(m.sleep).toHaveBeenCalledTimes(1);
    expect(m.reset).toHaveBeenCalledWith('9.9.9.9');
    expect(m.cookieSet).toHaveBeenCalledTimes(1);
    expect(m.fail).not.toHaveBeenCalled();
  });

  test('an indeterminate IP skips the per-IP hard lock but still throttles globally', async () => {
    m.clientIp.mockReturnValue(null); // no trusted forwarded header
    m.passwordMatches.mockResolvedValue(false);

    const res = await login({ error: null }, form('nope'));

    expect(res.error).toBe('Wrong password.');
    expect(m.check).not.toHaveBeenCalled(); // never hard-checks the shared bucket
    expect(m.fail).not.toHaveBeenCalled(); // …and never hard-locks it
    expect(m.recordGlobalFailure).toHaveBeenCalledTimes(1); // soft global path still runs
    expect(m.sleep).toHaveBeenCalledTimes(1);
  });
});
