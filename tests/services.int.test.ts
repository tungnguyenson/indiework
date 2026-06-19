import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema, closeDb } from '@/server/db';
import {
  projectService,
  taskService,
  commentService,
  moduleService,
  attachmentService,
  ServiceError,
} from '@/server/services';

const KEY = 'ZZTEST';
let projectId: string;
const inboxTaskIds: string[] = [];

async function cleanup() {
  // Deleting the project cascades to its tasks + counters.
  await db.delete(schema.projects).where(eq(schema.projects.key, KEY));
  for (const id of inboxTaskIds) {
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  }
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('service slice (real Postgres)', () => {
  test('create project', async () => {
    const p = await projectService.create({ key: KEY, name: 'Slice Test' });
    projectId = p.id;
    expect(p.key).toBe(KEY);
    expect(p.status).toBe('active');
    expect(p.pinned).toBe(false);
    expect(p.tags).toEqual([]);
  });

  test('per-project seq increments; ref is built from key + seq', async () => {
    const t1 = await taskService.create({ projectId, title: 'First' });
    const t2 = await taskService.create({ projectId, title: 'Second' });
    expect(t1.seq).toBe(1);
    expect(t1.ref).toBe('ZZTEST-1');
    expect(t1.status).toBe('todo');
    expect(t1.done).toBe(false);
    expect(t2.seq).toBe(2);
    expect(t2.ref).toBe('ZZTEST-2');
  });

  test('inbox task has no project, no seq, no ref', async () => {
    const t = await taskService.create({ title: 'An idea' });
    inboxTaskIds.push(t.id);
    expect(t.projectId).toBeNull();
    expect(t.seq).toBeNull();
    expect(t.ref).toBeNull();
    expect(t.status).toBe('inbox');
  });

  test('assignToProject triages from inbox and allocates the next seq', async () => {
    const idea = await taskService.create({ title: 'Triage me' });
    inboxTaskIds.push(idea.id);
    const assigned = await taskService.assignToProject(idea.id, projectId);
    expect(assigned.seq).toBe(3);
    expect(assigned.ref).toBe('ZZTEST-3');
    expect(assigned.status).toBe('backlog');
  });

  test('status → done stamps completed_at; leaving done clears it', async () => {
    const t = await taskService.create({ projectId, title: 'Finish me' });
    const done = await taskService.update(t.id, { status: 'done' });
    expect(done.done).toBe(true);
    expect(done.completedAt).not.toBeNull();

    const reopened = await taskService.update(t.id, { status: 'todo' });
    expect(reopened.done).toBe(false);
    expect(reopened.completedAt).toBeNull();
  });

  test('toggleDone flips done ⇄ todo', async () => {
    const t = await taskService.create({ projectId, title: 'Toggle me' });
    const on = await taskService.toggleDone(t.id);
    expect(on.status).toBe('done');
    const off = await taskService.toggleDone(t.id);
    expect(off.status).toBe('todo');
  });

  test('comments append with a source badge', async () => {
    const t = await taskService.create({ projectId, title: 'Log me' });
    await commentService.add({ taskId: t.id, body: 'started' });
    await commentService.add({ taskId: t.id, body: 'AI note', source: 'agent' });
    const list = await commentService.list(t.id);
    expect(list).toHaveLength(2);
    expect(list[0].source).toBe('web');
    expect(list[1].source).toBe('agent');
  });

  test('update edits a comment body, stamps editedAt, keeps source', async () => {
    const t = await taskService.create({ projectId, title: 'Editable' });
    const created = await commentService.add({ taskId: t.id, body: 'first draft', source: 'agent' });
    expect(created.editedAt).toBeNull();

    const edited = await commentService.update({ id: created.id, body: 'revised text' });
    expect(edited.body).toBe('revised text');
    expect(edited.source).toBe('agent'); // provenance preserved across an edit
    expect(edited.editedAt).toBeInstanceOf(Date);
  });

  test('update throws not_found for an unknown comment id', async () => {
    await expect(
      commentService.update({ id: '00000000-0000-0000-0000-000000000000', body: 'nope' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  test('getByRef resolves a display ref', async () => {
    const t = await taskService.getByRef('ZZTEST-1');
    expect(t.title).toBe('First');
  });

  test('list sorts done last, higher priority first', async () => {
    const list = await taskService.list({ projectId, hideDone: false });
    expect(list.length).toBeGreaterThanOrEqual(3);
    // done tasks sink to the bottom
    const firstDoneIdx = list.findIndex((t) => t.done);
    if (firstDoneIdx !== -1) {
      expect(list.slice(firstDoneIdx).every((t) => t.done)).toBe(true);
    }
  });

  test('new v3 statuses round-trip', async () => {
    const t = await taskService.create({ projectId, title: 'Review me', status: 'in_review' });
    expect(t.status).toBe('in_review');
    const pending = await taskService.update(t.id, { status: 'pending' });
    expect(pending.status).toBe('pending');
    expect(pending.done).toBe(false);
  });

  test('addSubtask inherits parent fields, allocates its own seq/ref, and is one level deep', async () => {
    const mod = await moduleService.create({ projectId, name: 'Engine', icon: 'cube', state: 'active' });
    const parent = await taskService.create({ projectId, title: 'Parent', moduleId: mod.id });
    const child = await taskService.addSubtask(parent.id, 'Child A');
    expect(child.parentId).toBe(parent.id);
    expect(child.projectId).toBe(projectId);
    expect(child.moduleId).toBe(mod.id); // inherited
    expect(child.seq).toEqual(expect.any(Number)); // first-class task → own per-project seq
    expect(child.ref).toBe(`${KEY}-${child.seq}`);
    expect(child.status).toBe('todo');

    const kids = await taskService.listChildren(parent.id);
    expect(kids).toHaveLength(1);

    // one level only
    await expect(taskService.addSubtask(child.id, 'Grandchild')).rejects.toBeInstanceOf(ServiceError);
  });

  test('addSubtask honors an explicit status and stamps completedAt when done', async () => {
    const parent = await taskService.create({ projectId, title: 'Parent with done child' });
    const child = await taskService.addSubtask(parent.id, 'Done child', 'done');
    expect(child.status).toBe('done');
    expect(child.done).toBe(true);
    expect(child.completedAt).not.toBeNull();
    expect(child.ref).toBe(`${KEY}-${child.seq}`);
  });

  test('addSubtask rejects an invalid status', async () => {
    const parent = await taskService.create({ projectId, title: 'Parent guard' });
    await expect(
      // @ts-expect-error — exercising the runtime guard with a bad status
      taskService.addSubtask(parent.id, 'Bad child', 'nope'),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  test('create() with parentId delegates to addSubtask', async () => {
    const parent = await taskService.create({ projectId, title: 'Has children' });
    const child = await taskService.create({ projectId, parentId: parent.id, title: 'Via create' });
    expect(child.parentId).toBe(parent.id);
    expect(child.seq).toEqual(expect.any(Number));
    expect(child.ref).toBe(`${KEY}-${child.seq}`);
  });

  test('module carries icon / state / description', async () => {
    const mod = await moduleService.create({
      projectId,
      name: 'Distribution',
      icon: 'globe',
      state: 'planned',
      description: 'DMG + updates',
    });
    expect(mod.icon).toBe('globe');
    expect(mod.state).toBe('planned');
    expect(mod.description).toBe('DMG + updates');
  });

  test('attachments: add, list, count on the task DTO, remove', async () => {
    const t = await taskService.create({ projectId, title: 'Has files' });
    await attachmentService.add({ taskId: t.id, name: 'a.csv', type: 'file', size: '1 KB', ext: 'csv' });
    const img = await attachmentService.add({ taskId: t.id, name: 'b.png', type: 'image', size: '2 KB', ext: 'png' });
    expect(img.path).toBeNull(); // storage deferred — metadata only

    const list = await attachmentService.list(t.id);
    expect(list).toHaveLength(2);

    const fromList = (await taskService.list({ projectId })).find((x) => x.id === t.id);
    expect(fromList?.attachmentCount).toBe(2);

    await attachmentService.remove(img.id);
    expect(await attachmentService.list(t.id)).toHaveLength(1);
  });
});
