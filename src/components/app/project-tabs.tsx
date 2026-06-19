'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { IconPicker } from '@/components/ui/icon-picker';
import { Ic } from '@/components/ui/icons';
import { updateProject } from '@/app/_actions/projects';
import { commitOnEnter } from '@/lib/inline-edit';
import {
  BUILTIN_VIEWS,
  DEFAULT_VIEW,
  type CustomView,
  type ViewId,
  type ViewMode,
} from '@/lib/views';

interface ProjectLite {
  id: string;
  key: string;
  name: string;
  emoji: string | null;
  color: string | null;
  pinned: boolean;
}

/**
 * Merged header (v3): project identity inline at the start of the tab strip,
 * then Overview + the views (All issues / Active / Backlog / custom) + add,
 * with a right slot for the Filter / Display buttons.
 */
export function ProjectTabs({
  project,
  activeView,
  customViews,
  onAddView,
  onRenameView,
  onRemoveView,
  modeFor,
  right,
}: {
  project: ProjectLite;
  activeView: 'overview' | ViewId;
  customViews: CustomView[];
  onAddView: () => string;
  onRenameView: (id: string, label: string) => void;
  onRemoveView: (id: string) => void;
  modeFor: (id: ViewId) => ViewMode;
  right?: ReactNode;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const base = `/app/p/${project.key}`;

  const save = async (patch: { name?: string; emoji?: string; color?: string; pinned?: boolean }) => {
    await updateProject(project.id, patch);
    router.refresh();
  };

  const goView = (id: ViewId) => router.push(`${base}?view=${id}`, { scroll: false });
  const modeIcon = (id: ViewId) => (modeFor(id) === 'board' ? <Ic.board size={15} /> : <Ic.list size={15} />);

  return (
    <div className="tabs">
      <div className="tabs-lead">
        <IconPicker
          value={project.emoji ?? '🚀'}
          color={project.color}
          onPick={(p) =>
            save({
              ...(p.value !== undefined ? { emoji: p.value } : {}),
              ...(p.color !== undefined ? { color: p.color } : {}),
            })
          }
          triggerClass="tabs-lead-emoji"
          triggerSize={19}
        />
        <input
          className="tabs-lead-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={commitOnEnter}
          onBlur={() => name.trim() && name !== project.name && save({ name: name.trim() })}
          spellCheck={false}
          aria-label="Project name"
        />
        <button
          className="tabs-lead-pin"
          type="button"
          data-on={project.pinned ? '' : undefined}
          aria-pressed={project.pinned}
          title={project.pinned ? 'Unpin project' : 'Pin project'}
          aria-label={project.pinned ? 'Unpin project' : 'Pin project'}
          onClick={() => save({ pinned: !project.pinned })}
        >
          <Ic.pin size={15} fill={project.pinned ? 'currentColor' : 'none'} />
        </button>
        <span className="tabs-lead-sep" />
      </div>

      <button className="tab" data-active={activeView === 'overview' ? '' : undefined} onClick={() => router.push(`${base}/overview`)} type="button">
        <Ic.layers size={15} /> Overview
      </button>

      {BUILTIN_VIEWS.map((v) => (
        <button key={v.id} className="tab" data-active={activeView === v.id ? '' : undefined} onClick={() => goView(v.id)} type="button">
          {modeIcon(v.id)} {v.label}
        </button>
      ))}

      {customViews.map((v) => (
        <CustomTab
          key={v.id}
          view={v}
          active={activeView === v.id}
          icon={modeIcon(v.id)}
          onOpen={() => goView(v.id)}
          onRename={(label) => onRenameView(v.id, label)}
          onRemove={() => {
            onRemoveView(v.id);
            if (activeView === v.id) goView(DEFAULT_VIEW);
          }}
        />
      ))}

      <button
        className="tab tab-add"
        type="button"
        aria-label="Add view"
        onClick={() => {
          const id = onAddView();
          goView(id);
        }}
      >
        <Ic.plus size={15} />
      </button>

      {right && <div className="tabs-right">{right}</div>}
    </div>
  );
}

function CustomTab({
  view,
  active,
  icon,
  onOpen,
  onRename,
  onRemove,
}: {
  view: CustomView;
  active: boolean;
  icon: ReactNode;
  onOpen: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(view.label);

  if (editing) {
    return (
      <span className="tab" data-active={active ? '' : undefined}>
        {icon}
        <input
          className="tab-name-input"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (label.trim() && label !== view.label) onRename(label.trim());
            else setLabel(view.label);
          }}
          onKeyDown={(e) => {
            commitOnEnter(e);
            if (e.key === 'Escape') {
              setLabel(view.label);
              setEditing(false);
            }
          }}
        />
      </span>
    );
  }

  return (
    <button
      className="tab"
      data-active={active ? '' : undefined}
      onClick={onOpen}
      onDoubleClick={() => active && setEditing(true)}
      type="button"
    >
      {icon} {view.label}
      <span
        className="tab-x"
        role="button"
        aria-label="Remove view"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Ic.close size={12} />
      </span>
    </button>
  );
}
