import { describe, test, expect, vi, beforeEach } from 'vitest';

// Behaviour test for the /login page guard (IW-55): an already-authed visitor is
// bounced straight to the app shell instead of being shown the form. Mirrors the
// login-action.test.ts mocking style — every collaborator is mocked and we assert
// control flow only. The real safeNext is used (not mocked) so the redirect
// target clamp is exercised end-to-end.
const m = vi.hoisted(() => ({
  cookieGet: vi.fn<(name: string) => { value: string } | undefined>(),
  verify: vi.fn<() => Promise<boolean>>(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT'); // mimic Next's redirect control-flow throw
  }),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: m.cookieGet }),
}));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/server/auth/session', () => ({
  SESSION_COOKIE: 'iw_session',
  verifySessionValue: m.verify,
}));
// Stub the client form so the test doesn't pull in the brand/icon component tree.
vi.mock('@/app/login/login-form', () => ({
  LoginForm: (props: { next: string }) => props,
}));

import LoginPage from '@/app/login/page';

function render(next?: string) {
  return LoginPage({ searchParams: Promise.resolve({ next }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/login auth-status guard', () => {
  test('an authed visitor is redirected to the app shell, form never renders', async () => {
    m.cookieGet.mockReturnValue({ value: 'signed.session' });
    m.verify.mockResolvedValue(true);

    // redirect() throws (Next control-flow signal) — that throw IS the bounce.
    await expect(render()).rejects.toThrow('NEXT_REDIRECT');
    expect(m.redirect).toHaveBeenCalledWith('/app');
  });

  test('an authed visitor is returned to their original /app destination', async () => {
    m.cookieGet.mockReturnValue({ value: 'signed.session' });
    m.verify.mockResolvedValue(true);

    await expect(render('/app/inbox')).rejects.toThrow('NEXT_REDIRECT');
    expect(m.redirect).toHaveBeenCalledWith('/app/inbox');
  });

  test('a hostile or off-app next is clamped to /app before redirecting', async () => {
    m.cookieGet.mockReturnValue({ value: 'signed.session' });
    m.verify.mockResolvedValue(true);

    await expect(render('https://evil.example/steal')).rejects.toThrow('NEXT_REDIRECT');
    expect(m.redirect).toHaveBeenCalledWith('/app');
  });

  test('an unauthenticated visitor sees the form with a clamped next, no redirect', async () => {
    m.cookieGet.mockReturnValue(undefined);
    m.verify.mockResolvedValue(false);

    const out = (await render('/login')) as unknown as { props: { next: string } };

    expect(m.redirect).not.toHaveBeenCalled();
    expect(out.props.next).toBe('/app'); // '/login' clamped away → no self-loop
  });
});
