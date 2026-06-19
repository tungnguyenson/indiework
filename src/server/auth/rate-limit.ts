/**
 * Login throttle — DEFENSE IN DEPTH, not a brute-force cure.
 *
 * What it does: a per-IP exponential-backoff lockout, a small constant delay on
 * every attempt, and a capped global soft-delay. State lives in a process-local
 * `Map`, which is the right fit here: IndieWork runs as a single long-lived
 * container (one image serves the app + the demo) with one operator, so the Map
 * persists across requests and there's no need to write the DB on every attempt.
 * Assumption: a single replica. If this is ever scaled horizontally the per-IP
 * limit degrades to per-instance (the constant delay still applies everywhere).
 *
 * What it does NOT do (so the comments don't oversell it):
 *  - The per-IP key comes from `x-forwarded-for`, which the client controls
 *    unless a trusted proxy overwrites it — an attacker can rotate it to dodge
 *    the per-IP lockout.
 *  - `sleep()` is non-blocking, so a CONCURRENT attacker (N parallel requests)
 *    is not rate-bounded by the constant delay; it only stops naive sequential
 *    hammering.
 *
 * The real compensating control for the single-secret login is a high-entropy
 * `APP_PASSWORD` (see .env.example). This layer raises the cost of casual,
 * sequential brute force and abuse; it is not a substitute for that secret.
 */

export interface RateLimitConfig {
  /** Consecutive failures (within the window) before lockout begins. */
  threshold: number;
  /** Failures older than this no longer count toward the running total (ms). */
  windowMs: number;
  /** First lockout once the threshold is reached; doubles per extra failure (ms). */
  baseLockMs: number;
  /** Hard cap on any single lockout (ms). */
  maxLockMs: number;
  /** Global failures (across all keys, within the window) before a soft delay kicks in. */
  globalSoftThreshold: number;
  /** Extra delay added per global failure over the soft threshold (ms). */
  globalDelayStepMs: number;
  /** Cap on the global soft delay (ms). */
  maxGlobalDelayMs: number;
}

export interface RateLimitResult {
  /** True when the key must wait before another attempt is allowed. */
  blocked: boolean;
  /** Whole seconds to wait when blocked (ceil); 0 otherwise. */
  retryAfterSec: number;
}

interface Entry {
  /** Consecutive failures still inside the window. */
  fails: number;
  /** Timestamp of the most recent failure (ms). */
  lastFailAt: number;
  /** Locked out until this timestamp (ms); 0 = not locked. */
  lockedUntil: number;
}

export class LoginRateLimiter {
  private readonly entries = new Map<string, Entry>();
  /** Recent failure timestamps across every key, for the global soft-delay. */
  private globalFails: number[] = [];

  constructor(private readonly cfg: RateLimitConfig) {}

  /** Is this key currently locked out? Call BEFORE verifying the password. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const e = this.entries.get(key);
    if (e && now < e.lockedUntil) {
      return { blocked: true, retryAfterSec: Math.ceil((e.lockedUntil - now) / 1000) };
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  /** Record a failed attempt; returns the key's resulting lockout state. */
  fail(key: string, now: number = Date.now()): RateLimitResult {
    const prev = this.entries.get(key);
    const windowOpen = prev !== undefined && now - prev.lastFailAt <= this.cfg.windowMs;
    const fails = (windowOpen ? prev.fails : 0) + 1;

    let lockedUntil = windowOpen ? prev.lockedUntil : 0;
    if (fails >= this.cfg.threshold) {
      const over = fails - this.cfg.threshold;
      const lock = Math.min(this.cfg.maxLockMs, this.cfg.baseLockMs * 2 ** over);
      lockedUntil = now + lock;
    }

    this.entries.set(key, { fails, lastFailAt: now, lockedUntil });
    this.prune(now);
    return this.check(key, now);
  }

  /** Clear a key's failures after a successful login. */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /** Record one global failure (any key) for the global soft-delay accounting. */
  recordGlobalFailure(now: number = Date.now()): void {
    const fresh = [...this.globalFails, now].filter((t) => now - t <= this.cfg.windowMs);
    // Past this many in-window failures the soft delay is already maxed, so
    // older timestamps can no longer change globalDelayMs — drop them to keep
    // the array bounded under a sustained flood.
    const cap =
      this.cfg.globalSoftThreshold +
      Math.ceil(this.cfg.maxGlobalDelayMs / this.cfg.globalDelayStepMs) +
      1;
    this.globalFails = fresh.length > cap ? fresh.slice(fresh.length - cap) : fresh;
  }

  /**
   * Extra per-attempt delay (ms) when the *global* failure volume is high.
   * Deliberately a delay, never a hard block: a hard global lockout would let a
   * distributed attacker deny the one legitimate operator access (self-DoS).
   */
  globalDelayMs(now: number = Date.now()): number {
    const recent = this.globalFails.filter((t) => now - t <= this.cfg.windowMs).length;
    if (recent <= this.cfg.globalSoftThreshold) return 0;
    const over = recent - this.cfg.globalSoftThreshold;
    return Math.min(this.cfg.maxGlobalDelayMs, over * this.cfg.globalDelayStepMs);
  }

  /** Drop entries that are no longer locked and whose window has elapsed. */
  private prune(now: number): void {
    for (const [key, e] of this.entries) {
      if (now >= e.lockedUntil && now - e.lastFailAt > this.cfg.windowMs) {
        this.entries.delete(key);
      }
    }
  }
}

/** Constant delay applied to *every* login attempt (ms). */
export const LOGIN_CONSTANT_DELAY_MS = 400;

/** Shared singleton limiter for the login action. Tuned for a single operator. */
export const loginRateLimiter = new LoginRateLimiter({
  threshold: 5,
  windowMs: 15 * 60_000, // 15 minutes
  baseLockMs: 2_000, // short first lock — a fat-finger isn't punished for long…
  maxLockMs: 15 * 60_000, // …escalation (doubling) handles a persistent attacker
  globalSoftThreshold: 20,
  globalDelayStepMs: 250,
  maxGlobalDelayMs: 5_000,
});

/**
 * Best-effort client IP from proxy headers, or `null` when none is present.
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it
 * (see file header). A `null` result means "no distinguishable IP" — the caller
 * MUST NOT hard-lock on it: every such request would share one bucket and a hard
 * lock would lock out the sole operator. Fall back to the soft global delay.
 */
export function clientIp(reqHeaders: Headers): string | null {
  const xff = reqHeaders.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return reqHeaders.get('x-real-ip')?.trim() || null;
}

/** Non-blocking delay helper. */
export const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

// ---------------------------------------------------------------------------
// Bearer API / MCP throttle
// ---------------------------------------------------------------------------
/**
 * Per-IP sliding-window request cap for the Bearer surface (REST + MCP). The
 * token is high-entropy so brute-force isn't the threat; this guards against
 * abuse / request floods. It's a soft, self-healing 429 (the window drains on
 * its own), so — unlike the login hard-lock — a shared `'unknown'` bucket for
 * header-less callers is acceptable: a flood can briefly 429 a header-less
 * operator, but it clears within the window rather than locking them out.
 */
export interface RequestRateConfig {
  /** Max requests allowed per key within the window. */
  limit: number;
  /** Sliding window length (ms). */
  windowMs: number;
}

export interface RequestRateResult {
  /** True when the key is over its quota for the current window. */
  limited: boolean;
  /** Whole seconds until a slot frees up (ceil, min 1); 0 when not limited. */
  retryAfterSec: number;
}

export class RequestRateLimiter {
  private readonly hits = new Map<string, number[]>();
  /** Last full-map sweep; throttled to once per window to stay cheap. */
  private lastSweep = 0;

  constructor(private readonly cfg: RequestRateConfig) {}

  /** Record a request for `key`; returns whether it is over quota. */
  hit(key: string, now: number = Date.now()): RequestRateResult {
    this.maybeSweep(now);
    const fresh = (this.hits.get(key) ?? []).filter((t) => now - t < this.cfg.windowMs);

    if (fresh.length >= this.cfg.limit) {
      // Over quota: don't count this request (let the window drain on its own).
      this.hits.set(key, fresh);
      const oldest = fresh[0];
      return {
        limited: true,
        retryAfterSec: Math.max(1, Math.ceil((oldest + this.cfg.windowMs - now) / 1000)),
      };
    }

    this.hits.set(key, [...fresh, now]);
    return { limited: false, retryAfterSec: 0 };
  }

  /** Drop keys whose hits have all aged out — at most once per window. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.cfg.windowMs) return;
    this.lastSweep = now;
    for (const [key, arr] of this.hits) {
      const fresh = arr.filter((t) => now - t < this.cfg.windowMs);
      if (fresh.length === 0) this.hits.delete(key);
      else if (fresh.length !== arr.length) this.hits.set(key, fresh);
    }
  }
}

/**
 * Shared singleton for the Bearer surface. 300/min per IP is far above any
 * human + agent workload (bulk writes go through single `create_tasks` /
 * `update_tasks` calls) but caps a flood at 5 req/s per IP.
 */
export const apiRateLimiter = new RequestRateLimiter({ limit: 300, windowMs: 60_000 });

/** Rate-limit state for a Bearer API/MCP request, keyed by client IP. */
export function apiRateState(req: Request): RequestRateResult {
  const ip = clientIp(req.headers) ?? 'unknown';
  return apiRateLimiter.hit(ip);
}
