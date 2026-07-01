import { parseRef } from './domain';

/** Minimal shape needed to build a task URL — TaskDto satisfies it. */
export interface OpenableTask {
  id: string;
  ref: string | null;
  title: string;
}

/**
 * Title → URL slug. ASCII-folds Vietnamese diacritics so "Sửa link … dùng SEQ"
 * becomes "sua-link-dung-seq". The slug is decorative — tasks resolve by `ref`,
 * so a stale slug from a later rename still opens the right task.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (incl. Vietnamese horn/hook)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * Detail path: /app/issue/IW-11/sua-link-task-cho-dung-seq. The ref already
 * encodes the project (IW-11 → project IW), so the URL stays project-agnostic.
 */
export function taskPath(ref: string, title: string): string | null {
  if (!parseRef(ref)) return null;
  const slug = slugify(title);
  return `/app/issue/${ref}${slug ? `/${slug}` : ''}`;
}

/**
 * Standalone full-page path: /app/task/IW-11/sua-link-task-cho-dung-seq. A
 * distinct segment from `taskPath` on purpose — `/app/task/...` is NOT matched
 * by the overlay's `refFromPath` regex, so the full page renders on its own
 * instead of also triggering the peek panel.
 */
export function taskFullPath(ref: string, title: string): string | null {
  if (!parseRef(ref)) return null;
  const slug = slugify(title);
  return `/app/task/${ref}${slug ? `/${slug}` : ''}`;
}

/**
 * Absolute, shareable canonical URL for a task: the origin prefixed onto the
 * standalone full-page path (`https://…/app/task/IW-11/<slug>`). This is the
 * link the side-panel "copy link" button writes to the clipboard — the same
 * `/app/task/…` form the app itself uses for a task's own page. Returns null
 * for an invalid ref (mirrors `taskFullPath`).
 */
export function taskCanonicalUrl(origin: string, ref: string, title: string): string | null {
  const path = taskFullPath(ref, title);
  return path === null ? null : `${origin}${path}`;
}

/** Pull the open task's ref out of a path-based detail URL. */
export function refFromPath(pathname: string): { ref: string } | null {
  const m = pathname.match(/^\/app\/issue\/([^/]+)/);
  if (!m) return null;
  return { ref: decodeURIComponent(m[1]) };
}

/** The base project list URL behind a task's panel (derived from its ref). */
export function projectPathForRef(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed ? `/app/p/${parsed.key}` : null;
}

/**
 * Stable key identifying a task in the URL: its `ref` for project tasks, else
 * its uuid (Inbox). Refs ("IW-3") and uuids never collide, so a single key can
 * back both the path scheme and the legacy `?task=` overlay.
 */
export function taskKey(task: { id: string; ref: string | null }): string {
  return task.ref ?? task.id;
}
