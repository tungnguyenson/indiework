'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/server/auth/session';
import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from '@/server/auth/rate-limit';
import { userService } from '@/server/services/user.service';

/** Only allow redirecting back into the app, never to an external URL. */
function safeNext(next: string): string {
  return next.startsWith('/app') ? next : '/app';
}

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? '/app'));

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const rateKey = `${ip}:${email.toLowerCase()}`;

  if (isLoginRateLimited(rateKey)) {
    return { error: 'Too many attempts. Try again in a few minutes.' };
  }

  const user = await userService.verifyLogin(email, password);
  if (!user) {
    recordLoginFailure(rateKey);
    return { error: 'Wrong email or password.' };
  }

  clearLoginFailures(rateKey);

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
