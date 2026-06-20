// ModuleTag — inline identity tag: icon (Lucide facade key or emoji) + module name.
// color = hex tint for the icon; faint = muted text for deprioritized context.
import { ModuleTag } from 'indiework';
import type { ReactNode } from 'react';

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>{children}</div>
);

/** Five realistic modules covering Lucide icons + an emoji glyph, each with a distinct brand color. */
export function Modules() {
  return (
    <Row>
      <ModuleTag name="Auth" icon="lock" color="#A06BF0" />
      <ModuleTag name="API" icon="bolt" color="#4C8DFF" />
      <ModuleTag name="Web" icon="globe" color="#34BE9A" />
      <ModuleTag name="Infra" icon="layers" color="#E8A33D" />
      <ModuleTag name="Launch" icon="🚀" />
    </Row>
  );
}

/** Faint variant — used when the module tag is secondary context (e.g. in a subtask row). */
export function Faint() {
  return <ModuleTag name="Auth" icon="lock" color="#A06BF0" faint />;
}
