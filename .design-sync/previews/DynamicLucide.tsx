import { DynamicLucide } from 'indiework';
import type { ReactNode } from 'react';

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
    {children}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
  </div>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>{children}</div>
);

/** A row of six common Lucide icons loaded by kebab name. */
export function Icons() {
  const names = ['rocket', 'compass', 'heart', 'star', 'zap', 'bell'];
  return (
    <Row>
      {names.map((n) => (
        <Cell key={n} label={n}>
          <DynamicLucide name={n} size={26} />
        </Cell>
      ))}
    </Row>
  );
}

/** Unknown name degrades to the cube fallback icon. */
export function UnknownFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <DynamicLucide name="totally-not-an-icon" size={26} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>unknown → cube</span>
    </div>
  );
}
