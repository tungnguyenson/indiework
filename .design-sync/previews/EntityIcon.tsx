import { EntityIcon } from 'indiework';
import type { ReactNode } from 'react';

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
    {children}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
  </div>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>{children}</div>
);

/** All four EntityIcon kinds in a single row: color dot, emoji, facade icon, full-library Lucide. */
export function Variants() {
  return (
    <Row>
      <Cell label="color dot">
        <EntityIcon icon={null} color="#4C8DFF" size={22} />
      </Cell>
      <Cell label="emoji">
        <EntityIcon icon="🚀" size={22} />
      </Cell>
      <Cell label="facade (layers)">
        <EntityIcon icon="layers" color="#A06BF0" size={22} />
      </Cell>
      <Cell label="lucide (compass)">
        <EntityIcon icon="compass" color="#34BE9A" size={22} />
      </Cell>
    </Row>
  );
}
