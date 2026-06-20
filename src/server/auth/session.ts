/**
 * Session = a signed cookie embedding `userId` (no role — looked up server-side).
 * Uses Web Crypto (HMAC-SHA256) so it runs in both the Edge proxy and Node
 * server actions.
 */
import { env } from '@/server/env';

export const SESSION_COOKIE = 'iw_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)

const encoder = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.COOKIE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return b64url(sig);
}

/** Build a fresh signed session value: "<userId>.<issuedAtMs>.<hmac>". */
export async function createSessionValue(userId: string): Promise<string> {
  const issued = Date.now().toString();
  const payload = `${userId}.${issued}`;
  return `${payload}.${await hmac(payload)}`;
}

export type ParsedSession = { userId: string; issuedAt: number };

/** Parse and cryptographically verify a session cookie value. */
export async function parseSessionValue(
  value: string | undefined | null,
): Promise<ParsedSession | null> {
  if (!value) return null;
  const lastDot = value.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const sig = value.slice(lastDot + 1);
  const rest = value.slice(0, lastDot);
  const firstDot = rest.indexOf('.');
  if (firstDot <= 0) return null;
  const userId = rest.slice(0, firstDot);
  const issued = rest.slice(firstDot + 1);
  if (sig !== (await hmac(rest))) return null;
  const ts = Number(issued);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > SESSION_MAX_AGE * 1000) return null;
  return { userId, issuedAt: ts };
}

/** Validate a session cookie value: signature matches and not expired. */
export async function verifySessionValue(value: string | undefined | null): Promise<boolean> {
  return (await parseSessionValue(value)) !== null;
}
