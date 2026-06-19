import { describe, test, expect } from 'vitest';
import { tooManyRequests } from '@/lib/api-response';

describe('tooManyRequests', () => {
  test('is a 429 carrying the Retry-After header and the standard envelope', async () => {
    const res = tooManyRequests(5);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    await expect(res.json()).resolves.toEqual({ data: null, error: 'Too many requests' });
  });
});
