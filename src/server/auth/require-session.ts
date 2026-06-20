/**
 * Server-Action auth guard. Next.js Server Actions are public HTTP endpoints:
 * the `proxy` middleware (matcher `/app/:path*`) does NOT cover the routes an
 * action can be dispatched on (`/`, `/login`, `/_next/*`), and per Next's own
 * guidance page/middleware auth never extends to a Server Action — each action
 * is a separate entry point. So every mutating (and data-reading) action must
 * re-verify the session itself. Call `requireSession()` as the FIRST line.
 */
import { cookies } from 'next/headers';
import { SESSION_COOKIE, parseSessionValue } from '@/server/auth/session';
import { userService } from '@/server/services/user.service';
import { unauthorized } from '@/server/services/errors';

/** Throw unless the caller presents a valid, unexpired session cookie. Returns userId. */
export async function requireSession(): Promise<string> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  const parsed = await parseSessionValue(value);
  if (!parsed) throw unauthorized();

  const user = await userService.getById(parsed.userId);
  if (!user) throw unauthorized();

  return parsed.userId;
}

/** Load the current session user (role looked up server-side, not from cookie). */
export async function getCurrentUser() {
  const userId = await requireSession();
  const user = await userService.getById(userId);
  if (!user) throw unauthorized();
  return user;
}
