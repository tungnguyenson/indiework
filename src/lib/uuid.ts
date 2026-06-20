import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUID v7 — canonical PK generator for Postgres and SQLite. */
export function newUuid(): string {
  return uuidv7();
}

/** True when the string is a RFC-4122 UUID with version nibble 7. */
export function isUuidV7(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
