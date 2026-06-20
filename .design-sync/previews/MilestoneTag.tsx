// MilestoneTag — target icon + milestone name; splits on ' · ' and shows only the first segment.
// "Beta · Q3" renders as "Beta"; used in task rows to show which milestone owns the task.
import { MilestoneTag } from 'indiework';
import type { ReactNode } from 'react';

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>{children}</div>
);

/** Three realistic milestone names — the last two demonstrate the ' · ' truncation behavior. */
export function Milestones() {
  return (
    <Row>
      <MilestoneTag name="v1.0 Launch" />
      <MilestoneTag name="Public Beta" />
      <MilestoneTag name="MVP · Q3" />
    </Row>
  );
}
