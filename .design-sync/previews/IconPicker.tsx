// IconPicker — the unified identity picker for projects & modules: an Emoji tab and an
// Icons tab (curated suggestions + search over the full Lucide set), with an optional
// color row. Stores a single string (emoji glyph or Lucide key). It lives behind a
// click-to-open trigger, so the previews open it on mount to show the real picker body.
import { IconPicker } from 'indiework';
import { useEffect } from 'react';

/** Click the popover trigger once on mount so the open state renders for the card. */
function AutoOpen() {
  useEffect(() => {
    const id = setTimeout(() => {
      (document.querySelector('.pop-trigger') as HTMLElement | null)?.click();
    }, 60);
    return () => clearTimeout(id);
  }, []);
  return null;
}

/** Open on the Icons tab with a color selected — tabs, color row, suggested grid. */
export function OpenOnIcons() {
  return (
    <>
      <AutoOpen />
      <IconPicker value="layers" color="#A06BF0" onPick={() => {}} />
    </>
  );
}
