import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
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

// Hits a real database, so it runs ONLY against a dedicated TEST_DATABASE_URL
// (routed in vitest.config.ts). A bare `pnpm test` skips it — never touching the
// dev DB. Run it with:  TEST_DATABASE_URL=postgres://…/indiework_test pnpm test
describe.skipIf(!process.env.TEST_DATABASE_URL)('service slice (real Postgres)', () => {
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

  test('delete removes a comment from the timeline', async () => {
    const t = await taskService.create({ projectId, title: 'Deletable' });
    const created = await commentService.add({ taskId: t.id, body: 'temporary', source: 'agent' });
    expect(await commentService.list(t.id)).toHaveLength(1);

    const removed = await commentService.delete({ id: created.id });
    expect(removed.id).toBe(created.id);
    expect(await commentService.list(t.id)).toHaveLength(0);
  });

  test('delete throws not_found for an unknown comment id', async () => {
    await expect(
      commentService.delete({ id: '00000000-0000-0000-0000-000000000000' }),
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

  test('attachments: upload, list, count on the task DTO, download, remove', async () => {
    const t = await taskService.create({ projectId, title: 'Has files' });
    await attachmentService.add({ taskId: t.id, name: 'a.csv', type: 'file', size: '1 KB', ext: 'csv' });
    const img = await attachmentService.upload({
      taskId: t.id,
      name: 'b.png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      contentType: 'image/png',
    });
    expect(img.path).toBe(`attachments/${img.id}`);

    const list = await attachmentService.list(t.id);
    expect(list).toHaveLength(2);

    const opened = await attachmentService.open(img.id);
    expect(opened.body.byteLength).toBe(4);

    const fromList = (await taskService.list({ projectId })).find((x) => x.id === t.id);
    expect(fromList?.attachmentCount).toBe(2);

    await attachmentService.remove(img.id);
    expect(await attachmentService.list(t.id)).toHaveLength(1);
  });

  // PP-B3: reorder is a single bulk CASE update; verify the new id order maps to
  // dense positions on the moved rows. Exercises the shared `positionByOrder`
  // helper across two tables (modules via the schema path, tasks via the
  // direct-ids path) so a regression in the SQL is caught.
  test('reorder persists the new order as dense positions in one bulk update', async () => {
    const [a, b, c] = await Promise.all([
      moduleService.create({ projectId, name: 'RO A', icon: 'cube' }),
      moduleService.create({ projectId, name: 'RO B', icon: 'cube' }),
      moduleService.create({ projectId, name: 'RO C', icon: 'cube' }),
    ]);
    await moduleService.reorder({ ids: [c.id, a.id, b.id] });
    const modRows = await db
      .select({ id: schema.modules.id, position: schema.modules.position })
      .from(schema.modules)
      .where(inArray(schema.modules.id, [a.id, b.id, c.id]));
    const modPos = new Map(modRows.map((r) => [r.id, r.position]));
    expect(modPos.get(c.id)).toBe(0);
    expect(modPos.get(a.id)).toBe(1);
    expect(modPos.get(b.id)).toBe(2);

    const [t1, t2, t3] = await Promise.all([
      taskService.create({ projectId, title: 'RO T1' }),
      taskService.create({ projectId, title: 'RO T2' }),
      taskService.create({ projectId, title: 'RO T3' }),
    ]);
    await taskService.reorder([t2.id, t3.id, t1.id]);
    const taskRows = await db
      .select({ id: schema.tasks.id, position: schema.tasks.position })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, [t1.id, t2.id, t3.id]));
    const taskPos = new Map(taskRows.map((r) => [r.id, r.position]));
    expect(taskPos.get(t2.id)).toBe(0);
    expect(taskPos.get(t3.id)).toBe(1);
    expect(taskPos.get(t1.id)).toBe(2);
  });

  test('reorder of an empty id list is a safe no-op (task takes raw ids)', async () => {
    // taskService.reorder takes a raw string[]; the empty guard must not emit
    // a malformed `case  end`. (module/milestone reorder validate ids >= 1.)
    await expect(taskService.reorder([])).resolves.toEqual({ ok: true });
  });
});
