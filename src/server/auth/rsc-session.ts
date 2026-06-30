import { redirect } from 'next/navigation';
import { ServiceError } from '@/server/services';

/** Cookie-clearing logout route — see `app/auth/expire/route.ts`. */
const EXPIRE_ROUTE = '/auth/expire';

/**
 * Run an RSC data loader, turning a stale/invalid session into a graceful
 * logout instead of an unhandled 500.
 *
 * The edge proxy and `/login` gate on the cookie's *signature*; the RSC loaders
 * verify the `userId` against the DB. After a demo reset (or any user deletion)
 * a cookie can be signature-valid yet reference a row that's gone, so a
 * render-time `requireSession()` throws `unauthorized` mid-render. Thrown from a
 * layout it escapes the segment `error.tsx` and surfaces as a raw 500. We catch
 * exactly that case and redirect to the cookie-clearing expire route, so the
 * user lands on a usable `/login` rather than a dead end.
 *
 * Only `unauthorized` is converted. A `forbidden` (authenticated but not
 * allowed), a `redirect()`/`notFound()` control-flow signal, or any other error
 * is rethrown untouched for the normal error boundary.
 */
export async function withFreshSession<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'unauthorized') redirect(EXPIRE_ROUTE);
    throw e;
  }
}
