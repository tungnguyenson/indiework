import { describe, test, expect } from 'vitest';
import {
  LoginRateLimiter,
  RequestRateLimiter,
  apiRateState,
  clientIp,
  sleep,
} from '@/server/auth/rate-limit';

/** Small, explicit config so every assertion's arithmetic is obvious. */
const makeLimiter = () =>
  new LoginRateLimiter({
    threshold: 3,
    windowMs: 60_000,
    baseLockMs: 2_000,
    maxLockMs: 10_000,
    globalSoftThreshold: 2,
    globalDelayStepMs: 100,
    maxGlobalDelayMs: 500,
  });

const KEY = '1.2.3.4';

describe('LoginRateLimiter — per-key backoff', () => {
  test('allows attempts below the threshold', () => {
    const rl = makeLimiter();
    expect(rl.fail(KEY, 1000).blocked).toBe(false); // 1st
    expect(rl.fail(KEY, 1001).blocked).toBe(false); // 2nd
    expect(rl.check(KEY, 1002).blocked).toBe(false);
  });

  test('locks out on the threshold-th failure for the base duration', () => {
    const rl = makeLimiter();
    rl.fail(KEY, 1000);
    rl.fail(KEY, 1001);
    const r = rl.fail(KEY, 1002); // 3rd → lockedUntil = 1002 + 2000
    expect(r.blocked).toBe(true);
    expect(r.retryAfterSec).toBe(2);
  });

  test('doubles the lockout for each failure past the threshold', () => {
    const rl = makeLimiter();
    rl.fail(KEY, 1000);
    rl.fail(KEY, 1001);
    expect(rl.fail(KEY, 1002).retryAfterSec).toBe(2); // base 2s
    expect(rl.fail(KEY, 1003).retryAfterSec).toBe(4); // 4s
    expect(rl.fail(KEY, 1004).retryAfterSec).toBe(8); // 8s
  });

  test('caps the lockout at maxLockMs', () => {
    const rl = makeLimiter();
    [1000, 1001, 1002, 1003, 1004].forEach((t) => rl.fail(KEY, t));
    expect(rl.fail(KEY, 1005).retryAfterSec).toBe(10); // 16s computed → capped to 10s
    expect(rl.fail(KEY, 1006).retryAfterSec).toBe(10); // stays capped
  });

  test('retryAfterSec counts down as time passes', () => {
    const rl = makeLimiter();
    rl.fail(KEY, 1000);
    rl.fail(KEY, 1001);
    rl.fail(KEY, 1002); // lockedUntil = 3002
    expect(rl.check(KEY, 1002).retryAfterSec).toBe(2);
    expect(rl.check(KEY, 2002).retryAfterSec).toBe(1);
    expect(rl.check(KEY, 3002).blocked).toBe(false); // lock elapsed
  });

  test('a failure after the window restarts the count (no immediate lock)', () => {
    const rl = makeLimiter();
    rl.fail(KEY, 1000);
    rl.fail(KEY, 1001);
    // Past the window: this is treated as the FIRST failure again, not the 3rd.
    const r = rl.fail(KEY, 1001 + 60_001);
    expect(r.blocked).toBe(false);
  });

  test('reset() clears an active lockout', () => {
    const rl = makeLimiter();
    rl.fail(KEY, 1000);
    rl.fail(KEY, 1001);
    rl.fail(KEY, 1002);
    expect(rl.check(KEY, 1002).blocked).toBe(true);
    rl.reset(KEY);
    expect(rl.check(KEY, 1002).blocked).toBe(false);
  });

  test('keys are throttled independently', () => {
    const rl = makeLimiter();
    rl.fail('a', 1000);
    rl.fail('a', 1001);
    rl.fail('a', 1002); // 'a' locked
    expect(rl.check('a', 1002).blocked).toBe(true);
    expect(rl.check('b', 1002).blocked).toBe(false);
  });
});

describe('LoginRateLimiter — global soft-delay', () => {
  test('no delay until the global threshold is exceeded', () => {
    const rl = makeLimiter();
    rl.recordGlobalFailure(1000);
    rl.recordGlobalFailure(1001);
    expect(rl.globalDelayMs(1002)).toBe(0); // 2 == threshold → still 0
  });

  test('adds a capped delay as global failures accumulate', () => {
    const rl = makeLimiter();
    [1000, 1001, 1002].forEach((t) => rl.recordGlobalFailure(t));
    expect(rl.globalDelayMs(1003)).toBe(100); // 3 → over 1 → 100ms
    rl.recordGlobalFailure(1004);
    expect(rl.globalDelayMs(1005)).toBe(200); // 4 → over 2 → 200ms
    [1006, 1007, 1008, 1009].forEach((t) => rl.recordGlobalFailure(t));
    expect(rl.globalDelayMs(1010)).toBe(500); // capped at maxGlobalDelayMs
  });

  test('global failures age out of the window', () => {
    const rl = makeLimiter();
    [1000, 1001, 1002, 1003].forEach((t) => rl.recordGlobalFailure(t));
    expect(rl.globalDelayMs(1004)).toBeGreaterThan(0);
    expect(rl.globalDelayMs(1004 + 60_001)).toBe(0); // all aged out
  });
});

describe('clientIp', () => {
  test('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers({ 'x-forwarded-for': '  9.9.9.9  ' }))).toBe('9.9.9.9');
  });

  test('falls back to x-real-ip, then to null when no forwarded header is present', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('sleep', () => {
  test('resolves immediately for non-positive delays', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe('RequestRateLimiter — per-key request cap', () => {
  const makeLimiter = () => new RequestRateLimiter({ limit: 3, windowMs: 1_000 });

  test('allows up to the limit, then blocks', () => {
    const rl = makeLimiter();
    expect(rl.hit('k', 0).limited).toBe(false); // 1
    expect(rl.hit('k', 1).limited).toBe(false); // 2
    expect(rl.hit('k', 2).limited).toBe(false); // 3
    const over = rl.hit('k', 3); // 4 → over quota
    expect(over.limited).toBe(true);
    expect(over.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  test('retryAfterSec reflects when the oldest hit ages out', () => {
    const rl = makeLimiter();
    rl.hit('k', 0);
    rl.hit('k', 0);
    rl.hit('k', 0); // window anchored at t=0, frees at t=1000
    expect(rl.hit('k', 100).retryAfterSec).toBe(1); // 900ms remaining → ceil → 1s
  });

  test('the window slides — a slot frees once the oldest hit expires', () => {
    const rl = makeLimiter();
    rl.hit('k', 0);
    rl.hit('k', 0);
    rl.hit('k', 0);
    expect(rl.hit('k', 500).limited).toBe(true); // still inside the window
    expect(rl.hit('k', 1001).limited).toBe(false); // the first three aged out
  });

  test('keys are throttled independently', () => {
    const rl = makeLimiter();
    rl.hit('a', 0);
    rl.hit('a', 0);
    rl.hit('a', 0);
    expect(rl.hit('a', 0).limited).toBe(true);
    expect(rl.hit('b', 0).limited).toBe(false);
  });
});

describe('apiRateState', () => {
  const req = (ip?: string) =>
    new Request('http://x/api', ip ? { headers: { 'x-forwarded-for': ip } } : undefined);

  test('runs end-to-end against the real singleton and starts unlimited', () => {
    // Fresh, distinct IPs so this doesn't collide with the shared bucket.
    expect(apiRateState(req('198.51.100.5')).limited).toBe(false);
    expect(apiRateState(req()).limited).toBe(false); // header-less → shared "unknown" bucket
  });
});
