'use client';

import { useEffect } from 'react';

/**
 * Remembers which view (a `?view=` view id, or `overview`) was last open for
 * each project, so landing on the bare project route restores it (IW-109).
 * Per project, per device — stored alongside the other `iw-*` view prefs.
 */
const LAST_VIEW_PREFIX = 'iw-last-view-';

export function lastViewStorageKey(projectKey: string): string {
  return `${LAST_VIEW_PREFIX}${projectKey}`;
}

export function readLastView(projectKey: string): string | null {
  try {
    return localStorage.getItem(lastViewStorageKey(projectKey));
  } catch {
    return null; // storage unavailable (SSR, private mode)
  }
}

export function writeLastView(projectKey: string, view: string): void {
  try {
    localStorage.setItem(lastViewStorageKey(projectKey), view);
  } catch {
    // ignore write failures (private mode, quota)
  }
}

/** Record `view` as this project's last-opened view whenever it changes. */
export function useRecordLastView(projectKey: string, view: string): void {
  useEffect(() => {
    writeLastView(projectKey, view);
  }, [projectKey, view]);
}
