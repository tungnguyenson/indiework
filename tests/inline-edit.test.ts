import { describe, test, expect, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { commitOnEnter } from '@/lib/inline-edit';

/**
 * Minimal stand-in for the React KeyboardEvent fields `commitOnEnter` touches.
 * Avoids pulling in jsdom — the helper only reads `key`/`isComposing` and calls
 * `preventDefault` / `currentTarget.blur`.
 */
function keyEvent(key: string, isComposing = false) {
  const blur = vi.fn();
  const preventDefault = vi.fn();
  const event = {
    key,
    preventDefault,
    currentTarget: { blur },
    nativeEvent: { isComposing },
  } as unknown as KeyboardEvent<HTMLInputElement>;
  return { event, blur, preventDefault };
}

describe('commitOnEnter', () => {
  test('commits on Enter by blurring the field', () => {
    const { event, blur, preventDefault } = keyEvent('Enter');
    commitOnEnter(event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(blur).toHaveBeenCalledOnce();
  });

  test('does not commit while an IME composition is active', () => {
    const { event, blur, preventDefault } = keyEvent('Enter', true);
    commitOnEnter(event);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
  });

  test('ignores other keys', () => {
    for (const key of ['a', 'Escape', 'Tab', ' ']) {
      const { event, blur, preventDefault } = keyEvent(key);
      commitOnEnter(event);
      expect(preventDefault, key).not.toHaveBeenCalled();
      expect(blur, key).not.toHaveBeenCalled();
    }
  });
});
