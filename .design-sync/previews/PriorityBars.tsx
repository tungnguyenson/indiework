// PriorityBars — three stacked bars filled/colored by priority level.
// none = empty bars, low/medium/high/urgent each fill more bars with distinct colors.
import { PriorityBars } from 'indiework';
import type { ReactNode } from 'react';
import { TASK_PRIORITY } from '@/lib/domain';

const Col = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>{children}</div>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>{children}</div>
);

/** All five priority levels with label — reads the full spectrum from none → urgent. */
export function AllPriorities() {
  return (
    <Col>
      {TASK_PRIORITY.map((p) => (
        <PriorityBars key={p} priority={p} showLabel />
      ))}
    </Col>
  );
}

/** All five priorities without label — compact bar-only display used in task rows. */
export function BarsOnly() {
  return (
    <Row>
      {TASK_PRIORITY.map((p) => (
        <PriorityBars key={p} priority={p} />
      ))}
    </Row>
  );
}
