import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createSessionValue,
  verifySessionValue,
  passwordMatches,
  SESSION_MAX_AGE,
} from '@/server/auth/session';
import { bearerOk } from '@/server/auth/token';
import { ServiceError } from '@/server/services';

// requireSession reads the cookie jar via next/headers — mock it so we can drive
// the guard with arbitrary cookie values.
const cookieGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: cookieGet }),
}));

/** Reproduce the session HMAC so we can forge an *expired-but-validly-signed* token. */
async function signed(issued: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.COOKIE_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(issued));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return `${issued}.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

describe('session cookie', () => {
  test('a freshly minted value verifies', async () => {
    expect(await verifySessionValue(await createSessionValue())).toBe(true);
  });

  test('rejects empty / malformed values', async () => {
    expect(await verifySessionValue(undefined)).toBe(false);
    expect(await verifySessionValue(null)).toBe(false);
    expect(await verifySessionValue('')).toBe(false);
    expect(await verifySessionValue('nodot')).toBe(false);
    expect(await verifySessionValue('.onlysig')).toBe(false);
  });

  test('rejects a tampered signature', async () => {
    const value = await createSessionValue();
    const [issued] = value.split('.');
    expect(await verifySessionValue(`${issued}.deadbeef`)).toBe(false);
  });

  test('rejects a tampered issued-at (signature no longer matches)', async () => {
    const value = await createSessionValue();
    const sig = value.slice(value.lastIndexOf('.') + 1);
    expect(await verifySessionValue(`9999999999999.${sig}`)).toBe(false);
  });

  test('rejects an expired but correctly-signed token', async () => {
    const old = String(Date.now() - (SESSION_MAX_AGE * 1000 + 60_000)); // 1 min past expiry
    expect(await verifySessionValue(await signed(old))).toBe(false);
  });
});

describe('passwordMatches', () => {
  test('true for the configured password, false otherwise', async () => {
    expect(await passwordMatches(process.env.APP_PASSWORD!)).toBe(true);
    expect(await passwordMatches(`${process.env.APP_PASSWORD!}x`)).toBe(false);
    expect(await passwordMatches('')).toBe(false);
  });
});

describe('bearerOk', () => {
  test('accepts the exact token, case-insensitive scheme', () => {
    expect(bearerOk(`Bearer ${process.env.API_TOKEN!}`)).toBe(true);
    expect(bearerOk(`bearer ${process.env.API_TOKEN!}`)).toBe(true);
  });
  test('rejects missing / malformed / wrong token', () => {
    expect(bearerOk(null)).toBe(false);
    expect(bearerOk(undefined)).toBe(false);
    expect(bearerOk('Basic abc')).toBe(false);
    expect(bearerOk(`Bearer ${process.env.API_TOKEN!}x`)).toBe(false);
    expect(bearerOk('Bearer ')).toBe(false);
  });
});

describe('requireSession (Server Action guard)', () => {
  // Imported lazily so the next/headers mock is in place first.
  let requireSession: typeof import('@/server/auth/require-session').requireSession;
  beforeEach(async () => {
    cookieGet.mockReset();
    ({ requireSession } = await import('@/server/auth/require-session'));
  });

  test('passes when a valid session cookie is present', async () => {
    cookieGet.mockReturnValue({ value: await createSessionValue() });
    await expect(requireSession()).resolves.toBeUndefined();
  });

  test('throws unauthorized when the cookie is absent', async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(requireSession()).rejects.toMatchObject({
      constructor: ServiceError,
      code: 'unauthorized',
    });
  });

  test('throws unauthorized when the cookie is invalid', async () => {
    cookieGet.mockReturnValue({ value: 'forged.value' });
    await expect(requireSession()).rejects.toBeInstanceOf(ServiceError);
  });
});
