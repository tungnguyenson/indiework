// Progress — a slim horizontal progress bar; value 0..1, optional width and tone.
// accent = in-flight work color; done = completion color.
import { Progress } from 'indiework';
import type { ReactNode } from 'react';

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>{children}</div>
);

const CaptionedBar = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
    {children}
    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
  </div>
);

/** Four fill levels at a readable width — 10 %, 40 %, 75 %, 100 %. */
export function Levels() {
  return (
    <Row>
      <CaptionedBar label="10%"><Progress value={0.1} width={140} /></CaptionedBar>
      <CaptionedBar label="40%"><Progress value={0.4} width={140} /></CaptionedBar>
      <CaptionedBar label="75%"><Progress value={0.75} width={140} /></CaptionedBar>
      <CaptionedBar label="100%"><Progress value={1} width={140} /></CaptionedBar>
    </Row>
  );
}

/** Accent vs done tone at 60 % — shows the semantic color split. */
export function Tones() {
  return (
    <Row>
      <CaptionedBar label="accent"><Progress value={0.6} width={140} tone="accent" /></CaptionedBar>
      <CaptionedBar label="done"><Progress value={0.6} width={140} tone="done" /></CaptionedBar>
    </Row>
  );
}
