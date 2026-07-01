import { describe, test, expect } from 'vitest';
import { slugify, taskPath, taskFullPath, taskCanonicalUrl, refFromPath, projectPathForRef, taskKey } from '@/lib/task-url';

describe('slugify', () => {
  test('ASCII-folds Vietnamese diacritics (IW-11 target)', () => {
    expect(slugify('Sửa link task cho dùng SEQ')).toBe('sua-link-task-cho-dung-seq');
    expect(slugify('UI bug: Task title bị truncate ở inspector (sidebar)')).toBe(
      'ui-bug-task-title-bi-truncate-o-inspector-sidebar',
    );
    expect(slugify('Đặng Đỗ ăn phở')).toBe('dang-do-an-pho');
  });

  test('collapses separators and trims edges', () => {
    expect(slugify('  Hello,  World!!  ')).toBe('hello-world');
    expect(slugify('a___b---c')).toBe('a-b-c');
  });

  test('returns empty string for non-alphanumeric-only input', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('！？。')).toBe('');
  });

  test('truncates to 60 chars without a trailing hyphen', () => {
    const s = slugify('word '.repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('taskPath', () => {
  test('builds /app/issue/<ref>/<slug> (ref encodes the project)', () => {
    expect(taskPath('IW-11', 'Sửa link task cho dùng SEQ')).toBe(
      '/app/issue/IW-11/sua-link-task-cho-dung-seq',
    );
  });

  test('omits the slug segment when the title slugs to empty', () => {
    expect(taskPath('IW-3', '   ')).toBe('/app/issue/IW-3');
  });

  test('returns null for an invalid ref', () => {
    expect(taskPath('not-a-ref!', 'x')).toBeNull();
  });
});

describe('taskFullPath', () => {
  test('builds the standalone /app/task/<ref>/<slug> page path', () => {
    expect(taskFullPath('IW-11', 'Sửa link task cho dùng SEQ')).toBe(
      '/app/task/IW-11/sua-link-task-cho-dung-seq',
    );
  });

  test('omits the slug segment when the title slugs to empty', () => {
    expect(taskFullPath('IW-3', '   ')).toBe('/app/task/IW-3');
  });

  test('returns null for an invalid ref', () => {
    expect(taskFullPath('not-a-ref!', 'x')).toBeNull();
  });
});

describe('taskCanonicalUrl', () => {
  test('prefixes the origin onto the standalone /app/task page path', () => {
    expect(taskCanonicalUrl('https://app.indiework.space', 'IW-103', 'Nút copy Task canonical URL')).toBe(
      'https://app.indiework.space/app/task/IW-103/nut-copy-task-canonical-url',
    );
  });

  test('omits the slug segment when the title slugs to empty', () => {
    expect(taskCanonicalUrl('https://app.indiework.space', 'IW-3', '   ')).toBe(
      'https://app.indiework.space/app/task/IW-3',
    );
  });

  test('returns null for an invalid ref', () => {
    expect(taskCanonicalUrl('https://app.indiework.space', 'not-a-ref!', 'x')).toBeNull();
  });
});

describe('refFromPath', () => {
  test('extracts ref from a top-level detail URL', () => {
    expect(refFromPath('/app/issue/IW-11/some-slug')).toEqual({ ref: 'IW-11' });
    expect(refFromPath('/app/issue/IW-3')).toEqual({ ref: 'IW-3' });
  });

  test('ignores non-detail paths', () => {
    expect(refFromPath('/app/p/IW')).toBeNull();
    expect(refFromPath('/app/inbox')).toBeNull();
    expect(refFromPath('/app/p/IW/board')).toBeNull();
  });

  // The standalone page lives at /app/task/... precisely so it is NOT matched
  // here — otherwise AppShell would also slide the peek panel over the page.
  test('does NOT match the standalone /app/task/<ref> page (no peek overlay)', () => {
    expect(refFromPath('/app/task/IW-11/some-slug')).toBeNull();
    expect(refFromPath('/app/task/IW-3')).toBeNull();
  });
});

describe('projectPathForRef', () => {
  test('derives the project list path from a ref', () => {
    expect(projectPathForRef('IW-11')).toBe('/app/p/IW');
    expect(projectPathForRef('SITE-4')).toBe('/app/p/SITE');
  });

  test('returns null for an invalid ref', () => {
    expect(projectPathForRef('nope')).toBeNull();
  });
});

describe('taskKey', () => {
  test('uses ref for project tasks, uuid for Inbox tasks', () => {
    expect(taskKey({ id: 'uuid-1', ref: 'IW-5' })).toBe('IW-5');
    expect(taskKey({ id: 'uuid-1', ref: null })).toBe('uuid-1');
  });
});
