'use client';

/**
 * Root-level backstop for errors that escape every segment boundary — chiefly a
 * fault thrown in the app *layout* itself, which the same-segment `app/error.tsx`
 * can't catch. Replaces Next's bare default 500 ("This page couldn't load") with
 * the product's own retry affordance.
 *
 * Auth-stale sessions never reach here — the RSC paths redirect to `/auth/expire`
 * (see `withFreshSession`). This is the net for genuine faults, e.g. a transient
 * DB outage while the shell loads. It must render its own <html>/<body>: it
 * replaces the root layout, so app styles aren't available — keep styling inline.
 */
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global] uncaught error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#0a0a0a',
          color: '#ededed',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: '34ch', margin: 0, color: '#a1a1a1', lineHeight: 1.5 }}>
          The app hit an unexpected error. This is usually temporary — reload to try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem 1.4rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#ededed',
            color: '#0a0a0a',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        {error.digest ? (
          <code style={{ marginTop: '1rem', fontSize: '0.72rem', color: '#5a5a5a' }}>
            ERROR {error.digest}
          </code>
        ) : null}
      </body>
    </html>
  );
}
