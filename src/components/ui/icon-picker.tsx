'use client';

/**
 * Unified identity-icon picker for projects and modules. One control offering:
 *  - an Emoji tab (curated grid + a paste-any-emoji field), and
 *  - an Icons tab (curated suggestions + search over the full Lucide set), with
 *  - an optional color row that tints Lucide icons / accents.
 *
 * Storage is a single string (`value`): an emoji glyph or a Lucide key. The
 * renderer (`EntityIcon`) infers which from the value — see `isEmojiValue`.
 */
import { useState } from 'react';
import { iconNames } from 'lucide-react/dynamic';
import { Popover } from './popover';
import { Ic, iconByName, isEmojiValue } from './icons';
import { DynamicLucide } from './dyn-icon';
import { EntityIcon } from './bits';
import { PROJECT_COLORS } from '@/lib/colors';

/**
 * Curated quick-pick icons shown when the search box is empty. Generic on
 * purpose — this picker serves both projects and modules — so it is NOT tied to
 * `MODULE_ICONS`. The full Lucide library is always reachable via search.
 */
const SUGGESTED_ICONS = [
  'cube', 'layers', 'bolt', 'sparkle', 'globe', 'folder', 'board', 'table',
  'settings', 'search', 'target', 'key', 'tag', 'inbox', 'lock', 'sliders',
] as const;

/** Curated quick-pick emoji, grouped loosely (work · objects · nature · symbols). */
const EMOJI_SET = [
  '🚀', '🎯', '🧱', '🛠️', '⚙️', '🧪', '🔭', '📦', '🗂️', '📚', '📒', '📖', '📈', '📊', '🧭', '🧰',
  '💡', '🪄', '✨', '🔥', '⚡', '🌟', '🎨', '🖌️', '🧠', '🤖', '🛰️', '📡', '🔁', '🔄', '🧩', '🔌',
  '🪴', '🌱', '🌿', '🌳', '🍃', '🐢', '🦊', '🐙', '🦋', '🌊', '🏔️', '🌙', '☀️', '⭐', '❄️', '🔮',
  '🔐', '🔑', '🛡️', '🔒', '🏷️', '📌', '📍', '✉️', '📮', '🔍', '⏱️', '📅', '✅', '⚠️', '❤️', '🍀',
];

export interface IconPickerProps {
  /** Current stored value: an emoji glyph or a Lucide key. */
  value: string | null | undefined;
  color?: string | null;
  /** Emit only the field(s) that changed. */
  onPick: (patch: { value?: string; color?: string }) => void;
  triggerClass?: string;
  title?: string;
  /** Show the color row (modules always; projects opt in). */
  showColor?: boolean;
  /** Glyph size inside the trigger button. */
  triggerSize?: number;
  width?: number;
}

export function IconPicker({
  value,
  color,
  onPick,
  triggerClass = 'icon-trigger',
  title = 'Change icon',
  showColor = true,
  triggerSize = 18,
  width = 272,
}: IconPickerProps) {
  return (
    <Popover
      width={width}
      align="left"
      trigger={
        <button className={triggerClass} title={title} type="button" aria-label={title}>
          <EntityIcon icon={value} color={color} size={triggerSize} />
        </button>
      }
    >
      {(close) => (
        <PickerBody
          value={value}
          color={color}
          showColor={showColor}
          onPick={onPick}
          close={close}
        />
      )}
    </Popover>
  );
}

function PickerBody({
  value,
  color,
  showColor,
  onPick,
  close,
}: {
  value: string | null | undefined;
  color?: string | null;
  showColor: boolean;
  onPick: IconPickerProps['onPick'];
  close: () => void;
}) {
  // Default to Icons (Lucide) — only open on Emoji when the current value is one.
  const [tab, setTab] = useState<'emoji' | 'icon'>(
    value && isEmojiValue(value) ? 'emoji' : 'icon',
  );

  return (
    <div className="icp-pop">
      <div className="icp-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-on={tab === 'icon' ? '' : undefined}
          onClick={() => setTab('icon')}
        >
          Icons
        </button>
        <button
          type="button"
          role="tab"
          data-on={tab === 'emoji' ? '' : undefined}
          onClick={() => setTab('emoji')}
        >
          Emoji
        </button>
      </div>

      {showColor && (
        <div className="icp-colors">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="color-pick"
              data-on={c === color ? '' : undefined}
              style={{ background: c, color: c }}
              onClick={() => onPick({ color: c })}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
      )}

      {tab === 'emoji' ? (
        <EmojiTab
          value={value}
          onPick={(e) => {
            onPick({ value: e });
            close();
          }}
        />
      ) : (
        <IconTab
          value={value}
          color={color}
          onPick={(name) => {
            onPick({ value: name });
            close();
          }}
        />
      )}
    </div>
  );
}

function EmojiTab({
  value,
  onPick,
}: {
  value: string | null | undefined;
  onPick: (emoji: string) => void;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    // Only accept genuine glyphs — block ASCII words that would read as a Lucide key.
    if (t && isEmojiValue(t)) onPick(t);
  };

  return (
    <>
      <div className="icp-emoji-grid">
        {EMOJI_SET.map((e) => (
          <button
            key={e}
            type="button"
            className="icp-emoji"
            data-on={e === value ? '' : undefined}
            onClick={() => onPick(e)}
            aria-label={e}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="icp-emoji-input"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          placeholder="Paste any emoji…"
          maxLength={16}
          aria-label="Paste any emoji"
        />
        <button type="submit" className="icp-use" disabled={!isEmojiValue(text.trim())}>
          Use
        </button>
      </form>
    </>
  );
}

function IconTab({
  value,
  color,
  onPick,
}: {
  value: string | null | undefined;
  color?: string | null;
  onPick: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const trimmed = q.trim().toLowerCase();
  // Empty box → curated suggestions; otherwise search the full Lucide set.
  const results = trimmed
    ? (iconNames as readonly string[]).filter((n) => n.includes(trimmed)).slice(0, 56)
    : null;

  return (
    <>
      <div className="icp-search">
        <Ic.search size={14} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search all icons…"
          aria-label="Search icons"
        />
      </div>

      {results ? (
        results.length ? (
          <div className="icp-icon-grid">
            {results.map((name) => (
              <button
                key={name}
                type="button"
                className="icp-icon"
                data-on={name === value ? '' : undefined}
                style={name === value ? { color: color ?? undefined } : undefined}
                onClick={() => onPick(name)}
                aria-label={name}
                title={name}
              >
                <DynamicLucide name={name} size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="icp-empty">No icons match “{q}”.</div>
        )
      ) : (
        <>
          <div className="icp-grouplabel">Suggested</div>
          <div className="icp-icon-grid">
            {SUGGESTED_ICONS.map((name) => {
              const IconC = iconByName(name);
              return (
                <button
                  key={name}
                  type="button"
                  className="icp-icon"
                  data-on={name === value ? '' : undefined}
                  style={name === value ? { color: color ?? undefined } : undefined}
                  onClick={() => onPick(name)}
                  aria-label={name}
                  title={name}
                >
                  <IconC size={16} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
