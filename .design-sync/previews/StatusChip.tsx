// StatusChip — the task-status pill used in rows, the detail panel, and boards.
// Eight statuses (each with its own palette dot), two sizes, optional dot.
import { StatusChip } from 'indiework';
import type { ReactNode } from 'react';
import { TASK_STATUS } from '@/lib/domain';

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
);

/** Every status, in lifecycle order — the full palette in one sweep. */
export function AllStatuses() {
  return <Row>{TASK_STATUS.map((s) => <StatusChip key={s} status={s} />)}</Row>;
}

/** The two sizes: sm for dense task rows, md for detail surfaces. */
export function Sizes() {
  return (
    <Row>
      <StatusChip status="in_progress" size="sm" />
      <StatusChip status="in_progress" size="md" />
      <StatusChip status="in_review" size="sm" />
      <StatusChip status="in_review" size="md" />
    </Row>
  );
}

/** Dot hidden — a quieter chip where status is already implied by context. */
export function WithoutDot() {
  return (
    <Row>
      <StatusChip status="todo" showDot={false} />
      <StatusChip status="done" showDot={false} />
      <StatusChip status="cancelled" showDot={false} />
    </Row>
  );
}
