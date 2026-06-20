import { describe, expect, test } from 'vitest';
import { isUuidV7, newUuid } from '@/lib/uuid';

describe('newUuid', () => {
  test('generates RFC-4122 UUID v7 strings', () => {
    const id = newUuid();
    expect(isUuidV7(id)).toBe(true);
  });

  test('generates distinct values', () => {
    expect(newUuid()).not.toBe(newUuid());
  });
});
