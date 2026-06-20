import { BrandMark } from 'indiework';
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

/** Four canonical sizes, baseline-aligned with pixel captions. */
export function Sizes() {
  return (
    <Row>
      <Cell label="24px"><BrandMark size={24} /></Cell>
      <Cell label="40px"><BrandMark size={40} /></Cell>
      <Cell label="64px"><BrandMark size={64} /></Cell>
      <Cell label="96px"><BrandMark size={96} /></Cell>
    </Row>
  );
}
