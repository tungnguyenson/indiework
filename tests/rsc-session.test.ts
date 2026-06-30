import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '@/server/services/errors';

// Behaviour test for the RSC session guard (IW-101). A signed-but-DB-stale
// session (e.g. after the demo reset truncates the users table) throws
// `unauthorized` mid-render; the guard must convert ONLY that case into a
// redirect to the cookie-clearing expire route, and pass everything else
// through untouched. `redirect` is mocked to throw like Next's control-flow
// signal so we can assert the bounce; the real ServiceError class is shared
// with the module under test via the mocked services barrel.
const m = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`); // mimic Next's redirect control-flow throw
  }),
}));

vi.mock('next/navigation', () => ({ redirect: m.redirect }));
// The module imports ServiceError from the barrel; re-export the real class so
// `instanceof` holds without dragging the rest of the service/db tree into the test.
vi.mock('@/server/services', async () => {
  const errors = await import('@/server/services/errors');
  return { ServiceError: errors.ServiceError };
});

import { withFreshSession } from '@/server/auth/rsc-session';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withFreshSession', () => {
  test('passes a successful load through untouched', async () => {
    await expect(withFreshSession(async () => 'shell-data')).resolves.toBe('shell-data');
    expect(m.redirect).not.toHaveBeenCalled();
  });

  test('a stale session (unauthorized) redirects to the cookie-clearing expire route', async () => {
    const load = async () => {
      throw new ServiceError('unauthorized', 'Not authenticated');
    };
    await expect(withFreshSession(load)).rejects.toThrow('NEXT_REDIRECT:/auth/expire');
    expect(m.redirect).toHaveBeenCalledWith('/auth/expire');
  });

  test('a forbidden error is rethrown for the normal boundary, never redirected', async () => {
    const err = new ServiceError('forbidden', 'Not allowed');
    await expect(withFreshSession(async () => { throw err; })).rejects.toBe(err);
    expect(m.redirect).not.toHaveBeenCalled();
  });

  test('a non-service signal (an inner redirect / notFound) propagates untouched', async () => {
    // The inner load's own redirect()/notFound() must not be swallowed.
    const signal = new Error('NEXT_NOT_FOUND');
    await expect(withFreshSession(async () => { throw signal; })).rejects.toBe(signal);
    expect(m.redirect).not.toHaveBeenCalled();
  });
});
