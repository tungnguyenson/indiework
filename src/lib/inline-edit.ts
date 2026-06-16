import type { KeyboardEvent } from 'react';

/**
 * Commit an inline single-line edit when the user presses Enter (IW-14).
 *
 * These fields save in their existing `onBlur` handler, but a bare input never
 * blurs on Enter — so the edit silently never persisted. Blurring on Enter
 * routes the save through that single existing path (no risk of double-saving,
 * since blur would still fire afterwards) and works identically for controlled
 * (`value={state}`) and uncontrolled (`defaultValue`) inputs.
 *
 * Guards against IME composition: the Enter that confirms a Vietnamese/CJK
 * candidate must not commit the field. `preventDefault` also stops the newline
 * when the field is a textarea used as a single-line title.
 *
 * Do NOT use on multi-line textareas where Enter should insert a newline.
 */
export function commitOnEnter(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.blur();
  }
}
