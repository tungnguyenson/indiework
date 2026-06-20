import { RefTag } from 'indiework';
import type { ReactNode } from 'react';

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>{children}</div>
);

/** A row of typical project refs — confirms monospace rendering. */
export function Refs() {
  return (
    <Row>
      <RefTag value="IW-51" />
      <RefTag value="AUR-3" />
      <RefTag value="SITE-128" />
    </Row>
  );
}

/** Big variant — larger pill for detail surfaces. */
export function Big() {
  return <RefTag value="IW-51" big />;
}
