/** Presentational design bits — pure render, safe in server or client trees. */
import {
  TASK_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/domain';
import { fmtDate, dueState } from '@/lib/dates';
import { Ic, iconByName, isEmojiValue } from './icons';
import { DynamicLucide } from './dyn-icon';

/**
 * Renders a project/module identity icon from a single stored value:
 *  - empty        → a color dot
 *  - emoji/glyph  → the glyph, verbatim
 *  - facade key   → curated `Ic` icon (checked first; handles legacy aliases
 *                   like `cube`→Box, `sparkle`→Sparkles)
 *  - kebab name   → lazy full-library Lucide icon
 * Lucide branches are tinted with `color`; emoji glyphs render in their own hue.
 */
export function EntityIcon({
  icon,
  color,
  size = 13,
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
}) {
  if (!icon) return <span className="dot" style={{ background: color ?? 'var(--text-faint)' }} />;
  if (isEmojiValue(icon)) {
    return (
      <span className="ei-emoji" style={{ fontSize: size + 2 }}>
        {icon}
      </span>
    );
  }
  if (icon in Ic) {
    const IconC = iconByName(icon);
    return (
      <span className="mod-ic" style={{ color: color ?? 'var(--text-faint)' }}>
        <IconC size={size} />
      </span>
    );
  }
  return (
    <span className="mod-ic" style={{ color: color ?? 'var(--text-faint)' }}>
      <DynamicLucide name={icon} size={size} />
    </span>
  );
}

/** Back-compat alias — many call sites still import `ModuleIcon`. */
export const ModuleIcon = EntityIcon;

export function StatusChip({
  status,
  size = 'md',
  showDot = true,
}: {
  status: TaskStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
}) {
  return (
    <span className={`chip st-chip ${size === 'sm' ? 'chip-sm' : ''}`} data-st={status}>
      {showDot && <span className="dot" style={{ background: `var(--st-${status})` }} />}
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBars({
  priority,
  showLabel = false,
}: {
  priority: TaskPriority;
  showLabel?: boolean;
}) {
  if (priority === 'none' && !showLabel) {
    return (
      <span className="pri-bars" data-pri="none" title="No priority">
        <i />
        <i />
        <i />
      </span>
    );
  }
  return (
    <span className="pri-wrap" title={`Priority: ${TASK_PRIORITY_LABEL[priority]}`}>
      <span className="pri-bars" data-pri={priority}>
        <i />
        <i />
        <i />
      </span>
      {showLabel && (
        <span className="pri-label" data-pri={priority}>
          {TASK_PRIORITY_LABEL[priority]}
        </span>
      )}
    </span>
  );
}

export function ModuleTag({
  name,
  color,
  icon,
  faint,
}: {
  name: string;
  color?: string | null;
  icon?: string | null;
  faint?: boolean;
}) {
  return (
    <span className="meta-tag" style={faint ? { color: 'var(--text-muted)' } : undefined}>
      <ModuleIcon icon={icon} color={color} size={13} />
      {name}
    </span>
  );
}

export function MilestoneTag({ name }: { name: string }) {
  const short = name.split(' · ')[0];
  return (
    <span className="meta-tag milestone-tag" title={name}>
      <Ic.target size={12} /> {short}
    </span>
  );
}

export function DuePill({ due, muted }: { due: Date | string | null | undefined; muted?: boolean }) {
  if (!due) return null;
  // A closed task's deadline is just history — never flag it overdue/soon (red/amber).
  return (
    <span className="meta-tag due-pill" data-due={muted ? undefined : (dueState(due) ?? undefined)}>
      <Ic.calendar size={12} /> {fmtDate(due)}
    </span>
  );
}

export function Progress({
  value,
  width = 56,
  tone = 'accent',
}: {
  value: number;
  width?: number;
  tone?: 'accent' | 'done';
}) {
  return (
    <span className="progress" style={{ width }}>
      <span
        className="progress-fill"
        data-tone={tone}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </span>
  );
}
