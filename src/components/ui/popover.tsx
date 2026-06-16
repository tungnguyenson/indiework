'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from './icons';

type PopoverChildren = ReactNode | ((close: () => void) => ReactNode);

interface PopoverProps {
  trigger: ReactNode;
  children: PopoverChildren;
  align?: 'left' | 'right';
  width?: number;
  className?: string;
}

/** A trigger + portaled, viewport-clamped popover. Closes on outside-click/Esc. */
export function Popover({ trigger, children, align = 'left', width = 220, className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const gap = 6;
    // Prefer opening below the trigger; flip above only when there isn't room.
    if (r.bottom + gap + 300 > window.innerHeight) {
      // Anchor the popover's BOTTOM edge to the trigger so the gap stays exact
      // regardless of the popover's height (heights vary by option count).
      setPos({ left, bottom: window.innerHeight - r.top + gap });
    } else {
      setPos({ left, top: r.bottom + gap });
    }
  }, [align, width]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onScroll = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  return (
    <>
      <span
        ref={btnRef}
        className="pop-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className={`popover fade-in ${className ?? ''}`}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width }}
            onClick={(e) => e.stopPropagation()}
          >
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface Option {
  id: string;
  label: string;
}

interface OptionListProps<T extends Option> {
  options: readonly T[];
  value?: string | null;
  onPick: (id: string) => void;
  renderOpt?: (o: T) => ReactNode;
}

export function OptionList<T extends Option>({ options, value, onPick, renderOpt }: OptionListProps<T>) {
  return (
    <div className="opt-list">
      {options.map((o) => (
        <button
          key={o.id}
          className="opt"
          data-active={o.id === value ? '' : undefined}
          onClick={() => onPick(o.id)}
        >
          {renderOpt ? renderOpt(o) : o.label}
          {o.id === value && (
            <Ic.check size={15} strokeWidth={2.4} style={{ marginLeft: 'auto', color: 'var(--accent-ink)' }} />
          )}
        </button>
      ))}
    </div>
  );
}
