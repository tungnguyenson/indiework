'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { taskPath, refFromPath, projectPathForRef, type OpenableTask } from './task-url';

export { slugify, taskPath, taskFullPath, taskCanonicalUrl, refFromPath, projectPathForRef, taskKey } from './task-url';
export type { OpenableTask } from './task-url';

/**
 * Single source of truth for opening/closing the task detail panel.
 *
 * Project tasks (have a `ref`) get a readable, shareable path URL
 * (`…/issue/IW-11/slug`). Inbox tasks have no ref until triaged, so they fall
 * back to the legacy `?task=<uuid>` overlay on the current surface.
 *
 * Opening/switching/closing a task is just an overlay — it must NOT trigger a
 * Next route navigation. `router.push` would cross route segments (project →
 * issue) and, with both pages `force-dynamic`, re-run `loadProject` on the
 * server and remount the entire list behind the panel on every click (flicker).
 * Instead we use the native History API: it updates the URL (and `usePathname`/
 * `useSearchParams`, which Next keeps in sync) with no server round-trip, so the
 * list stays mounted and untouched while only the panel reacts to the new ref.
 * Deep links / refresh still SSR via the issue route as before.
 */
export function useTaskNav() {
  const pathname = usePathname();
  const params = useSearchParams();

  const openTask = useCallback(
    (task: OpenableTask) => {
      const sp = new URLSearchParams(Array.from(params.entries()));
      sp.delete('task'); // never carry the legacy uuid param onto a ref URL
      const path = task.ref ? taskPath(task.ref, task.title) : null;
      if (path) {
        const qs = sp.toString();
        window.history.pushState(null, '', qs ? `${path}?${qs}` : path);
        return;
      }
      sp.set('task', task.id);
      window.history.pushState(null, '', `${pathname}?${sp.toString()}`);
    },
    [pathname, params],
  );

  const closeTask = useCallback(() => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('task');
    const qs = sp.toString();
    const fromPath = refFromPath(pathname);
    const base = (fromPath && projectPathForRef(fromPath.ref)) || pathname;
    window.history.pushState(null, '', qs ? `${base}?${qs}` : base);
  }, [pathname, params]);

  return { openTask, closeTask };
}

/** The key of the currently-open task, read from the path (ref) or `?task=` (uuid). */
export function useOpenTaskKey(): string | null {
  const pathname = usePathname();
  const params = useSearchParams();
  const fromPath = refFromPath(pathname);
  return fromPath ? fromPath.ref : params.get('task');
}
