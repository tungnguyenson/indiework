'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { taskPath, refFromPath, projectPathForRef, type OpenableTask } from './task-url';

export { slugify, taskPath, refFromPath, projectPathForRef, taskKey } from './task-url';
export type { OpenableTask } from './task-url';

/**
 * Single source of truth for opening/closing the task detail panel.
 *
 * Project tasks (have a `ref`) get a readable, shareable path URL
 * (`…/issue/IW-11/slug`). Inbox tasks have no ref until triaged, so they fall
 * back to the legacy `?task=<uuid>` overlay on the current surface.
 */
export function useTaskNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const openTask = useCallback(
    (task: OpenableTask) => {
      const sp = new URLSearchParams(Array.from(params.entries()));
      sp.delete('task'); // never carry the legacy uuid param onto a ref URL
      const path = task.ref ? taskPath(task.ref, task.title) : null;
      if (path) {
        const qs = sp.toString();
        router.push(qs ? `${path}?${qs}` : path, { scroll: false });
        return;
      }
      sp.set('task', task.id);
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [router, pathname, params],
  );

  const closeTask = useCallback(() => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('task');
    const qs = sp.toString();
    const fromPath = refFromPath(pathname);
    const base = (fromPath && projectPathForRef(fromPath.ref)) || pathname;
    router.push(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [router, pathname, params]);

  return { openTask, closeTask };
}

/** The key of the currently-open task, read from the path (ref) or `?task=` (uuid). */
export function useOpenTaskKey(): string | null {
  const pathname = usePathname();
  const params = useSearchParams();
  const fromPath = refFromPath(pathname);
  return fromPath ? fromPath.ref : params.get('task');
}
