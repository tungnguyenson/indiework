/**
 * Basic in-memory rate limiter for the login surface (brute-force mitigation).
 * Single-process only — sufficient for the indie single-tenant deploy model.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

type Entry = { count: number; resetAt: number };

const attempts = new Map<string, Entry>();

function prune(key: string, now: number): Entry {
  const cur = attempts.get(key);
  if (!cur || now >= cur.resetAt) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, fresh);
    return fresh;
  }
  return cur;
}

/** Returns true when the caller should be blocked. */
export function isLoginRateLimited(key: string): boolean {
  const entry = prune(key, Date.now());
  return entry.count >= MAX_ATTEMPTS;
}

/** Record a failed login attempt for the given key (email or IP). */
export function recordLoginFailure(key: string): void {
  const entry = prune(key, Date.now());
  entry.count += 1;
}

/** Clear failures after a successful login. */
export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
