import { describe, test, expect } from 'vitest';
import {
  buildRef,
  parseRef,
  isValidProjectKey,
  TASK_STATUS,
  BOARD_COLUMNS,
  DEFAULT_STATUS_ORDER,
  MODULE_STATE,
  MODULE_STATE_COLOR_KEY,
} from '@/lib/domain';

describe('isValidProjectKey', () => {
  test('accepts uppercase keys 2–10 chars', () => {
    expect(isValidProjectKey('DISK')).toBe(true);
    expect(isValidProjectKey('AB')).toBe(true);
    expect(isValidProjectKey('PROJ123')).toBe(true);
  });

  test('rejects malformed keys', () => {
    expect(isValidProjectKey('a')).toBe(false); // too short + lowercase
    expect(isValidProjectKey('disk')).toBe(false); // lowercase
    expect(isValidProjectKey('1ABC')).toBe(false); // leading digit
    expect(isValidProjectKey('A-B')).toBe(false); // hyphen
    expect(isValidProjectKey('TOOLONGKEYY')).toBe(false); // 11 chars
  });
});

describe('buildRef / parseRef', () => {
  test('buildRef joins key and seq', () => {
    expect(buildRef('DISK', 14)).toBe('DISK-14');
  });

  test('parseRef round-trips a valid ref', () => {
    expect(parseRef('DISK-14')).toEqual({ key: 'DISK', seq: 14 });
  });

  test('parseRef returns null for malformed refs', () => {
    expect(parseRef('DISK')).toBeNull();
    expect(parseRef('DISK-')).toBeNull();
    expect(parseRef('-14')).toBeNull();
    expect(parseRef('disk-14')).toBeNull();
    expect(parseRef('DISK-0')).toBeNull();
    expect(parseRef('DISK-1.5')).toBeNull(); // seq must be a whole number
  });
});

describe('v3 status model', () => {
  test('8 states; blocked removed, in_review + pending added', () => {
    expect(TASK_STATUS).toEqual([
      'inbox',
      'backlog',
      'todo',
      'in_progress',
      'in_review',
      'pending',
      'done',
      'cancelled',
    ]);
    expect(TASK_STATUS).not.toContain('blocked');
  });

  test('board columns are the v3 subset', () => {
    expect(BOARD_COLUMNS).toEqual(['todo', 'in_progress', 'pending', 'in_review', 'done']);
  });

  test('default status order leads with active work and excludes inbox', () => {
    expect(DEFAULT_STATUS_ORDER[0]).toBe('in_progress');
    expect(DEFAULT_STATUS_ORDER).not.toContain('inbox');
  });

  test('module states map onto status palette keys', () => {
    expect(MODULE_STATE).toEqual(['planned', 'active', 'done', 'archived']);
    expect(MODULE_STATE_COLOR_KEY.active).toBe('in_progress');
    expect(MODULE_STATE_COLOR_KEY.archived).toBe('cancelled');
  });
});
