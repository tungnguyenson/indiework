/**
 * Clamp a post-login `next` target to the app shell. Only same-origin `/app`
 * paths are honoured — anything else (external URL, `/login`, junk) falls back
 * to `/app`, which also stops a `/login → /login` redirect loop when an
 * already-authed visitor lands on `/login?next=/login`.
 */
export function safeNext(next: string | undefined | null): string {
  return next && next.startsWith('/app') ? next : '/app';
}
