import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createSessionValue,
  verifySessionValue,
  parseSessionValue,
  SESSION_MAX_AGE,
} from '@/server/auth/session';
import { bearerOk } from '@/server/auth/token';
import { verifyPassword, hashPassword } from '@/server/auth/password';
import { ServiceError } from '@/server/services';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

const { cookieGet, getById } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  getById: vi.fn(),
}));

// requireSession reads the cookie jar + userService — mock both.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: cookieGet }),
}));

vi.mock('@/server/services/user.service', () => ({
  userService: { getById },
}));

/** Reproduce the session HMAC so we can forge an *expired-but-validly-signed* token. */
async function signed(userId: string, issued: string): Promise<string> {
  const payload = `${userId}.${issued}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.COOKIE_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return `${payload}.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

describe('session cookie', () => {
  test('a freshly minted value verifies and parses userId', async () => {
    const value = await createSessionValue(TEST_USER_ID);
    expect(await verifySessionValue(value)).toBe(true);
    expect(await parseSessionValue(value)).toEqual(
      expect.objectContaining({ userId: TEST_USER_ID }),
    );
  });

  test('rejects empty / malformed values', async () => {
    expect(await verifySessionValue(undefined)).toBe(false);
    expect(await verifySessionValue(null)).toBe(false);
    expect(await verifySessionValue('')).toBe(false);
    expect(await verifySessionValue('nodot')).toBe(false);
    expect(await verifySessionValue('.onlysig')).toBe(false);
  });

  test('rejects a tampered signature', async () => {
    const value = await createSessionValue(TEST_USER_ID);
    const dot = value.lastIndexOf('.');
    const rest = value.slice(0, dot);
    expect(await verifySessionValue(`${rest}.deadbeef`)).toBe(false);
  });

  test('rejects a tampered issued-at (signature no longer matches)', async () => {
    const value = await createSessionValue(TEST_USER_ID);
    const sig = value.slice(value.lastIndexOf('.') + 1);
    expect(await verifySessionValue(`${TEST_USER_ID}.9999999999999.${sig}`)).toBe(false);
  });

  test('rejects an expired but correctly-signed token', async () => {
    const old = String(Date.now() - (SESSION_MAX_AGE * 1000 + 60_000)); // 1 min past expiry
    expect(await verifySessionValue(await signed(TEST_USER_ID, old))).toBe(false);
  });
});

describe('password hashing', () => {
  test('verify succeeds for the correct password', async () => {
    const hash = await hashPassword('secret');
    expect(await verifyPassword('secret', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('bearerOk (legacy static token)', () => {
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
  let requireSession: typeof import('@/server/auth/require-session').requireSession;
  beforeEach(async () => {
    cookieGet.mockReset();
    getById.mockReset();
    getById.mockResolvedValue({
      id: TEST_USER_ID,
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    ({ requireSession } = await import('@/server/auth/require-session'));
  });

  test('returns userId when a valid session cookie is present', async () => {
    cookieGet.mockReturnValue({ value: await createSessionValue(TEST_USER_ID) });
    await expect(requireSession()).resolves.toBe(TEST_USER_ID);
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

  test('throws unauthorized when the user is disabled or missing', async () => {
    cookieGet.mockReturnValue({ value: await createSessionValue(TEST_USER_ID) });
    getById.mockResolvedValue(null);
    await expect(requireSession()).rejects.toBeInstanceOf(ServiceError);
  });
});
