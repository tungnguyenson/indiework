'use client';

import { useState } from 'react';
import type { TaskStatus } from '@/lib/domain';
import { Ic } from './icons';

/**
 * Circular checkbox: tick = done, × = cancelled. In-progress shows a pie,
 * in-review a violet 3/4 pie, pending an amber dash (matches the design).
 */
export function CircleCheck({
  done,
  status,
  onToggle,
  size = 18,
}: {
  done: boolean;
  status: TaskStatus;
  onToggle?: () => void;
  size?: number;
}) {
  const cancelled = status === 'cancelled';
  const inProgress = status === 'in_progress' && !done;
  const inReview = status === 'in_review' && !done;
  const pending = status === 'pending' && !done;
  return (
    <button
      className="circle-check"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      data-done={done ? '' : undefined}
      data-cancelled={cancelled && !done ? '' : undefined}
      data-status={!done && !cancelled ? status : undefined}
      style={{ width: size, height: size }}
      title={done ? 'Mark not done' : 'Mark done'}
      aria-pressed={done}
    >
      {done && <Ic.check size={size - 6} strokeWidth={2.6} />}
      {cancelled && !done && <Ic.close size={size - 8} strokeWidth={2.4} />}
      {inProgress && <span className="cc-pie" />}
      {inReview && <span className="cc-pie cc-review" />}
      {pending && <span className="cc-pend" />}
    </button>
  );
}

/** Monospace reference tag that copies to clipboard on click. */
export function RefTag({ value, big }: { value: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`ref-tag ${big ? 'ref-big' : ''}`}
      title="Copy reference"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1100);
      }}
    >
      {copied ? 'Copied!' : value}
    </button>
  );
}

/**
 * Icon button that copies a link to the clipboard, echoing RefTag's copy
 * micro-interaction (swaps to a check for ~1.1s). `getUrl` is resolved at click
 * time — not on render — so callers can safely read `window.location.origin`
 * without breaking SSR. A null url (e.g. an Inbox task with no ref) is a no-op.
 */
export function CopyLinkButton({ getUrl, label = 'Copy link' }: { getUrl: () => string | null; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      title={copied ? 'Link copied' : label}
      aria-label={label}
      onClick={async (e) => {
        e.stopPropagation();
        const url = getUrl();
        if (!url) return;
        try {
          await navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1100);
        } catch {
          // Clipboard unavailable (denied permission / insecure context) — skip.
        }
      }}
    >
      {copied ? <Ic.check size={16} /> : <Ic.link size={16} />}
    </button>
  );
}
