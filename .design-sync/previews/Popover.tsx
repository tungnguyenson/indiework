import { Popover, OptionList } from 'indiework';
import { useEffect } from 'react';
import { TASK_STATUS, TASK_STATUS_LABEL } from '@/lib/domain';

function AutoOpen() {
  useEffect(() => {
    const id = setTimeout(() => {
      (document.querySelector('.pop-trigger') as HTMLElement | null)?.click();
    }, 60);
    return () => clearTimeout(id);
  }, []);
  return null;
}

/** A property-control trigger that opens a status menu (auto-opened for the card). */
export function StatusMenu() {
  return (
    <>
      <AutoOpen />
      <Popover
        width={200}
        trigger={
          <button className="prop-control" type="button">
            <span className="dot" style={{ background: 'var(--st-in_progress)' }} /> In progress
          </button>
        }
      >
        {(close) => (
          <OptionList
            options={TASK_STATUS.map((s) => ({ id: s, label: TASK_STATUS_LABEL[s] }))}
            value="in_progress"
            onPick={() => close()}
            renderOpt={(o) => (<><span className="dot" style={{ background: `var(--st-${o.id})` }} /> {o.label}</>)}
          />
        )}
      </Popover>
    </>
  );
}
