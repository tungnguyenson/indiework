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
  convertSubtaskToTask,
} from '@/app/_actions/tasks';
import { toggledDone } from '@/lib/optimistic';
import { useRun } from '@/components/ui/toast';
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
  const run = useRun();
  const [detail, setDetail] = useState<TaskDetail | null>(initialDetail);
  // `missing` = the task genuinely no longer exists (fetch resolved to null).
  // `loadError` = the fetch threw (network, auth, or a Server Action version-skew
  // 404 after a deploy) — the task may well exist; a refresh usually clears it.
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
    setLoadError(false);
    fetchDetail()
      .then((d) => {
        if (!alive) return;
        if (d) setDetail(d);
        else setMissing(true);
      })
      .catch(() => alive && setLoadError(true));
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
    if (fresh) setDetail(fresh);
    else setMissing(true);
    router.refresh();
  }, [fetchDetail, router]);

  const patch = useCallback(
    (p: UpdateTaskInput) => {
      if (!detail) return Promise.resolve(undefined);
      return run(
        async () => {
          const updated = await updateTask(detail.task.id, p);
          setDetail((d) => (d ? { ...d, task: updated } : d));
          router.refresh();
        },
        { error: "Couldn't save your changes." },
      );
    },
    [detail, router, run],
  );

  const saveStatusNote = useCallback(
    (note: string) => {
      if (!detail) return Promise.resolve(undefined);
      return run(
        async () => {
          const updated = await setTaskStatusNote(detail.task.id, note);
          setDetail((d) => (d ? { ...d, task: updated } : d));
          router.refresh();
        },
        { error: "Couldn't save the status note." },
      );
    },
    [detail, router, run],
  );

  const addComment = useCallback(
    (body: string) => {
      if (!detail) return Promise.resolve(undefined);
      return run(
        async () => {
          await addTaskComment(detail.task.id, body);
          const fresh = await fetchDetail();
          if (fresh) setDetail(fresh);
          router.refresh();
          return true as const;
        },
        { error: "Couldn't post your comment.", retry: false },
      );
    },
    [detail, fetchDetail, router, run],
  );

  const editComment = useCallback(
    (commentId: string, body: string) => {
      if (!detail) return Promise.resolve(undefined);
      return run(
        async () => {
          await editTaskComment(commentId, body);
          const fresh = await fetchDetail();
          if (fresh) setDetail(fresh);
          router.refresh();
          return true as const;
        },
        { error: "Couldn't save your edit." },
      );
    },
    [detail, fetchDetail, router, run],
  );

  const addChild = useCallback(
    (title: string) => {
      if (!detail) return Promise.resolve(undefined);
      return run(
        async () => {
          await addSubtask(detail.task.id, title);
          await reload();
          return true as const;
        },
        { error: "Couldn't add the sub-task.", retry: false },
      );
    },
    [detail, reload, run],
  );

  const toggleChild = useCallback(
    (childId: string) => {
      // Flip the sub-task circle now (manual-optimistic pattern). `toggledDone` is
      // its own inverse, so the same flip reverts it if the persist fails.
      const flip = () =>
        setDetail((d) =>
          d ? { ...d, children: d.children.map((x) => (x.id === childId ? { ...x, ...toggledDone(x.status) } : x)) } : d,
        );
      return run(
        async () => {
          flip();
          try {
            await toggleTaskDone(childId);
          } catch (e) {
            flip(); // the persist failed — revert the circle
            throw e;
          }
          await reload(); // reconcile; a reload failure here means the toggle already stuck
        },
        { error: "Couldn't update that sub-task." },
      );
    },
    [reload, run],
  );

  /**
   * Promote a sub-task to a standalone task (detach from its parent). Resolves
   * `true` on success. Reloads so the surface reflects the new shape: the
   * "Sub-task of…" link goes away and the sub-tasks section appears.
   */
  const convertToTask = useCallback(() => {
    if (!detail) return Promise.resolve(undefined);
    return run(
      async () => {
        await convertSubtaskToTask(detail.task.id);
        await reload();
        return true as const;
      },
      { error: "Couldn't convert this sub-task.", retry: false },
    );
  }, [detail, reload, run]);

  /** Delete the task. Resolves `true` on success; navigation is the caller's concern. */
  const remove = useCallback(() => {
    if (!detail) return Promise.resolve(undefined);
    return run(
      async () => {
        await deleteTask(detail.task.id);
        router.refresh();
        return true as const;
      },
      { error: "Couldn't delete that task.", retry: false },
    );
  }, [detail, router, run]);

  return {
    detail,
    missing,
    loadError,
    setDetail,
    reload,
    patch,
    saveStatusNote,
    addComment,
    editComment,
    addChild,
    toggleChild,
    convertToTask,
    remove,
  };
}

export type UseTaskDetail = ReturnType<typeof useTaskDetail>;
