// DuePill — a due-date chip that flags urgency from how far the date is from today:
// overdue (red), soon ≤3 days (amber), later (neutral). `muted` keeps the date as
// plain history for a closed task — never red/amber.
import { DuePill } from 'indiework';
import type { ReactNode } from 'react';

const DAY = 86_400_000;
const rel = (days: number) => new Date(Date.now() + days * DAY);

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
);

/** The three urgency states, derived live from today's date. */
export function UrgencyStates() {
  return (
    <Row>
      <DuePill due={rel(-4)} />
      <DuePill due={rel(2)} />
      <DuePill due={rel(24)} />
    </Row>
  );
}

/** Same overdue date, muted — how a finished task shows its old deadline. */
export function MutedForClosed() {
  return (
    <Row>
      <DuePill due={rel(-4)} />
      <DuePill due={rel(-4)} muted />
    </Row>
  );
}
