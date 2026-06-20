import { OptionList } from 'indiework';
import { TASK_STATUS, TASK_STATUS_LABEL } from '@/lib/domain';
import type { ReactNode } from 'react';

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="popover" style={{ position: 'static', width: 220 }}>
    {children}
  </div>
);

/** Status picker: all task statuses with a colored dot and a check on "in_progress". */
export function StatusOptions() {
  return (
    <Frame>
      <OptionList
        options={TASK_STATUS.map((s) => ({ id: s, label: TASK_STATUS_LABEL[s] }))}
        value="in_progress"
        onPick={() => {}}
        renderOpt={(o) => (
          <>
            <span className="dot" style={{ background: `var(--st-${o.id})` }} />
            {o.label}
          </>
        )}
      />
    </Frame>
  );
}

/** A plain sort menu — four text-only options with "newest" checked. */
export function SortMenu() {
  const options = [
    { id: 'newest', label: 'Newest' },
    { id: 'oldest', label: 'Oldest' },
    { id: 'priority', label: 'Priority' },
    { id: 'due', label: 'Due date' },
  ];
  return (
    <Frame>
      <OptionList
        options={options}
        value="newest"
        onPick={() => {}}
      />
    </Frame>
  );
}
