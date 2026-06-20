'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/server/auth/session';
import {
  loginRateLimiter,
  clientIp,
  sleep,
  LOGIN_CONSTANT_DELAY_MS,
} from '@/server/auth/rate-limit';
import { userService } from '@/server/services/user.service';
import { safeNext } from '@/server/auth/safe-next';

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? '/app'));

  const ip = clientIp(await headers());

  // Per-IP HARD lockout only when we have a distinguishable IP. Without a trusted
  // forwarded header every caller collapses into one bucket, and a hard lock there
  // would lock out the sole operator — so an indeterminate IP relies on the soft
  // global throttle + constant delay only. When we do have an IP and it's already
  // locked, refuse before touching the password: no wrong-credentials oracle, no
  // CPU burned on the password hash verify.
  if (ip) {
    const gate = loginRateLimiter.check(ip);
    if (gate.blocked) {
      return { error: `Too many attempts. Try again in ${gate.retryAfterSec}s.` };
    }
  }

  // Constant delay on every attempt, plus any global soft-throttle. Slows naive
  // sequential brute force; see rate-limit.ts for the honest caveats.
  await sleep(LOGIN_CONSTANT_DELAY_MS + loginRateLimiter.globalDelayMs());

  const user = await userService.verifyLogin(email, password);
  if (!user) {
    if (ip) loginRateLimiter.fail(ip);
    loginRateLimiter.recordGlobalFailure();
    return { error: 'Wrong email or password.' };
  }

  if (ip) loginRateLimiter.reset(ip);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionValue(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  redirect(next);
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
