'use client';

/**
 * Lazy access to the full lucide-react set (~1,900 icons) for values that
 * aren't in the curated `Ic` facade. Each icon's SVG is code-split and loaded
 * on demand by `DynamicIcon`, so the static bundle only carries the import map,
 * not the glyphs. Isolated in its own `'use client'` module to keep `bits.tsx`
 * renderable from server trees.
 */
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Ic } from './icons';

export function DynamicLucide({ name, size = 13 }: { name: string; size?: number }) {
  // Stroke + absolute width mirror the `Ic` facade (icons.tsx) for visual parity.
  // Unknown names (free-string `icon` over MCP, typos) degrade to a cube rather
  // than rendering blank.
  return (
    <DynamicIcon
      name={name as IconName}
      size={size}
      strokeWidth={1.7}
      absoluteStrokeWidth
      fallback={() => <Ic.cube size={size} />}
    />
  );
}
