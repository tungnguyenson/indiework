/**
 * Server-Action auth guard. Next.js Server Actions are public HTTP endpoints:
 * the `proxy` middleware (matcher `/app/:path*`) does NOT cover the routes an
 * action can be dispatched on (`/`, `/login`, `/_next/*`), and per Next's own
 * guidance page/middleware auth never extends to a Server Action — each action
 * is a separate entry point. So every mutating (and data-reading) action must
 * re-verify the session itself. Call `requireSession()` as the FIRST line.
 */
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionValue } from '@/server/auth/session';
import { unauthorized } from '@/server/services/errors';

/** Throw unless the caller presents a valid, unexpired session cookie. */
export async function requireSession(): Promise<void> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionValue(value))) {
    throw unauthorized();
  }
}
