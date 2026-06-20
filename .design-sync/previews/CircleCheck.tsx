import { CircleCheck } from 'indiework';
import type { ReactNode } from 'react';

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>{children}</div>
);
const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
    {children}
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
  </div>
);

/** All six visual states at size 22, each labeled. */
export function States() {
  return (
    <Row>
      <Cell label="done">
        <CircleCheck done={true} status="done" size={22} />
      </Cell>
      <Cell label="cancelled">
        <CircleCheck done={false} status="cancelled" size={22} />
      </Cell>
      <Cell label="in progress">
        <CircleCheck done={false} status="in_progress" size={22} />
      </Cell>
      <Cell label="in review">
        <CircleCheck done={false} status="in_review" size={22} />
      </Cell>
      <Cell label="pending">
        <CircleCheck done={false} status="pending" size={22} />
      </Cell>
      <Cell label="todo">
        <CircleCheck done={false} status="todo" size={22} />
      </Cell>
    </Row>
  );
}
