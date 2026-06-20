import { Wordmark } from 'indiework';

/** Full wordmark with TLD — "indiework.space" at a prominent size. */
export function Default() {
  return (
    <div style={{ fontSize: 30 }}>
      <Wordmark withTld={true} />
    </div>
  );
}

/** Bare wordmark without TLD — "indiework" only. */
export function Bare() {
  return (
    <div style={{ fontSize: 30 }}>
      <Wordmark withTld={false} />
    </div>
  );
}
