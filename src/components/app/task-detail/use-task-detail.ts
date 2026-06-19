'use client';

/**
 * Data + mutation surface shared by the inspector panel and the standalone task
 * page. Owns the detail fetch, the cross-surface `iw:task-updated` sync, and
 * every persistence call (so both layouts mutate through one path).
 *
 * Deliberately excludes panel-only concerns (escape-to-close, the close
 * button): the full page has a back button, not a close, so those stay in the
 * panel component.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTaskDetail, getTaskDetailByRef, type TaskDetail } from '@/app/_actions/queries';
import {
  updateTask,
  setTaskStatusNote,
  addTaskComment,
  editTaskComment,
  deleteTask,
  addSubtask,
  toggleTaskDone,
} from '@/app/_actions/tasks';
import { toggledDone } from '@/lib/optimistic';
import type { UpdateTaskInput } from '@/server/validators/task';

export function useTaskDetail({
  taskRef,
  taskId,
  initialDetail = null,
}: {
  taskRef: string | null;
  taskId: string | null;
  /** SSR-seeded detail so a deep-linked page paints content on first frame. */
  initialDetail?: TaskDetail | null;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(initialDetail);
  const [missing, setMissing] = useState(false);

  // Project tasks resolve by ref (path URL); Inbox tasks by uuid (?task=).
  const fetchDetail = useCallback(
    () => (taskRef ? getTaskDetailByRef(taskRef) : getTaskDetail(taskId as string)),
    [taskRef, taskId],
  );

  // Re-fetch on task switch. We intentionally don't reset detail to null here:
  // the surface keeps showing the previous task until the new one loads, so
  // switching issues neither flashes the skeleton nor replays the slide-in.
  useEffect(() => {
    let alive = true;
    setMissing(false);
    fetchDetail()
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [fetchDetail]);

  // Stay in sync when the same task is edited elsewhere (e.g. inline rename in
  // the list) — the list broadcasts the patch so the open surface reflects it.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const { id, patch } = (e as CustomEvent<{ id: string; patch: UpdateTaskInput }>).detail;
      setDetail((d) => (d && d.task.id === id ? { ...d, task: { ...d.task, ...patch } } : d));
    };
    window.addEventListener('iw:task-updated', onUpdated);
    return () => window.removeEventListener('iw:task-updated', onUpdated);
  }, []);

  const reload = useCallback(async () => {
    const fresh = await fetchDetail();
    setDetail(fresh);
    router.refresh();
  }, [fetchDetail, router]);

  const patch = useCallback(
    async (p: UpdateTaskInput) => {
      if (!detail) return;
      const updated = await updateTask(detail.task.id, p);
      setDetail((d) => (d ? { ...d, task: updated } : d));
      router.refresh();
    },
    [detail, router],
  );

  const saveStatusNote = useCallback(
    async (note: string) => {
      if (!detail) return;
      const updated = await setTaskStatusNote(detail.task.id, note);
      setDetail((d) => (d ? { ...d, task: updated } : d));
      router.refresh();
    },
    [detail, router],
  );

  const addComment = useCallback(
    async (body: string) => {
      if (!detail) return;
      await addTaskComment(detail.task.id, body);
      const fresh = await fetchDetail();
      setDetail(fresh);
      router.refresh();
    },
    [detail, fetchDetail, router],
  );

  const editComment = useCallback(
    async (commentId: string, body: string) => {
      if (!detail) return;
      await editTaskComment(commentId, body);
      const fresh = await fetchDetail();
      setDetail(fresh);
      router.refresh();
    },
    [detail, fetchDetail, router],
  );

  const addChild = useCallback(
    async (title: string) => {
      if (!detail) return;
      await addSubtask(detail.task.id, title);
      await reload();
    },
    [detail, reload],
  );

  const toggleChild = useCallback(
    async (childId: string) => {
      // Flip the sub-task circle now (matches the manual-optimistic pattern), then reconcile.
      setDetail((d) =>
        d ? { ...d, children: d.children.map((x) => (x.id === childId ? { ...x, ...toggledDone(x.status) } : x)) } : d,
      );
      await toggleTaskDone(childId);
      await reload();
    },
    [reload],
  );

  /** Delete the task. Navigation afterwards is the caller's concern. */
  const remove = useCallback(async () => {
    if (!detail) return;
    await deleteTask(detail.task.id);
    router.refresh();
  }, [detail, router]);

  return {
    detail,
    missing,
    setDetail,
    reload,
    patch,
    saveStatusNote,
    addComment,
    editComment,
    addChild,
    toggleChild,
    remove,
  };
}

export type UseTaskDetail = ReturnType<typeof useTaskDetail>;
