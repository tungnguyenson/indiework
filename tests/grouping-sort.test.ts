import { describe, it, expect } from 'vitest';
import { taskComparator, buildSections, DEFAULT_FILTERS } from '@/lib/grouping';
import type { TaskDto } from '@/server/services';

function t(over: Partial<TaskDto>): TaskDto {
  return {
    id: 'x',
    title: 'x',
    status: 'todo',
    priority: 'none',
    moduleId: null,
    milestoneId: null,
    parentId: null,
    done: over.status === 'done',
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    dueDate: null,
    completedAt: null,
    ref: null,
    attachmentCount: 0,
    ...over,
  } as TaskDto;
}

const A = t({ id: 'A', title: 'A', createdAt: new Date('2021-01-01'), updatedAt: new Date('2021-06-01') });
const B = t({ id: 'B', title: 'B', createdAt: new Date('2022-01-01'), updatedAt: new Date('2021-01-01') });
const C = t({ id: 'C', title: 'C', createdAt: new Date('2020-01-01'), updatedAt: new Date('2023-01-01') });

describe('taskComparator', () => {
  it('created = most recently created first', () => {
    const ids = [A, B, C].sort(taskComparator('created')).map((x) => x.id);
    expect(ids).toEqual(['B', 'A', 'C']); // 2022, 2021, 2020
  });

  it('updated = most recently updated first', () => {
    const ids = [A, B, C].sort(taskComparator('updated')).map((x) => x.id);
    expect(ids).toEqual(['C', 'A', 'B']); // 2023, 2021-06, 2021-01
  });
});

describe('buildSections honors opts.sort', () => {
  it('sorts an ungrouped section by created (desc)', () => {
    const [sec] = buildSections([A, B, C], 'none', 'none', DEFAULT_FILTERS, [], [], { sort: 'created' });
    expect(sec.tasks.map((x) => x.id)).toEqual(['B', 'A', 'C']);
  });

  it('defaults to priority sort when opts.sort omitted', () => {
    const hi = t({ id: 'H', priority: 'high', createdAt: new Date('2024-01-01') });
    const lo = t({ id: 'L', priority: 'low', createdAt: new Date('2019-01-01') });
    const [sec] = buildSections([lo, hi], 'none', 'none', DEFAULT_FILTERS, [], []);
    expect(sec.tasks.map((x) => x.id)).toEqual(['H', 'L']); // higher priority first
  });
});
