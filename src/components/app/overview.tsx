'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaskDto } from '@/server/services';
import type { GroupModule, GroupMilestone } from '@/lib/grouping';
import {
  PROJECT_STATUS,
  PROJECT_STATUS_LABEL,
  MILESTONE_STATUS,
  MILESTONE_STATUS_LABEL,
  MODULE_STATE,
  MODULE_STATE_LABEL,
  MODULE_STATE_COLOR_KEY,
  MODULE_ICONS,
  type ProjectStatus,
  type MilestoneStatus,
  type ModuleState,
  type ModuleIcon as ModuleIconName,
} from '@/lib/domain';
import { fmtDate, toDateInputValue } from '@/lib/dates';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { commitOnEnter } from '@/lib/inline-edit';
import { PROJECT_COLORS } from '@/lib/colors';
import { updateProject, archiveProject, unarchiveProject } from '@/app/_actions/projects';
import {
  createMilestone,
  updateMilestone,
  setMilestoneStatus,
  deleteMilestone,
  reorderMilestones,
  createModule,
  updateModule,
  archiveModule,
  reorderModules,
} from '@/app/_actions/structure';
import { ProjectTabs } from './project-tabs';
import { useViews } from '@/lib/views';
import { Progress, ModuleIcon } from '@/components/ui/bits';
import { Popover, OptionList } from '@/components/ui/popover';
import { Ic, iconByName } from '@/components/ui/icons';

const DOT_KEY: Record<ProjectStatus, string> = {
  active: 'in_progress',
  planned: 'todo',
  paused: 'pending',
  done: 'done',
  backlog: 'backlog',
  cancelled: 'cancelled',
};

const MILE_COLOR_KEY: Record<MilestoneStatus, string> = {
  planned: 'backlog',
  active: 'in_progress',
  done: 'done',
};

interface Project {
  id: string;
  key: string;
  name: string;
  emoji: string | null;
  pinned: boolean;
  status: ProjectStatus;
  tags: string[];
  shortDesc: string | null;
  statusNote: string | null;
  description: string | null;
  workspaceId: string | null;
  archivedAt: Date | string | null;
}

interface WorkspaceOpt {
  id: string;
  name: string;
}

type OvTab = 'info' | 'milestones' | 'modules';

export function OverviewScreen({
  project,
  modules,
  milestones,
  tasks,
  workspaces,
}: {
  project: Project;
  modules: GroupModule[];
  milestones: GroupMilestone[];
  tasks: TaskDto[];
  workspaces: WorkspaceOpt[];
}) {
  const [tab, setTab] = useState<OvTab>('info');
  const views = useViews(project.key);

  return (
    <>
      <ProjectTabs
        project={project}
        activeView="overview"
        customViews={views.customViews}
        onAddView={views.addView}
        onRenameView={views.renameView}
        onRemoveView={views.removeView}
        modeFor={views.modeFor}
      />
      <div className="overview">
        <div className="ov-vlayout">
          <nav className="ov-vnav" aria-label="Overview sections">
            <button className="ov-vtab" data-active={tab === 'info' ? '' : undefined} onClick={() => setTab('info')} type="button">
              <Ic.list size={16} /> <span className="ov-vtab-label">Info</span>
            </button>
            <button className="ov-vtab" data-active={tab === 'milestones' ? '' : undefined} onClick={() => setTab('milestones')} type="button">
              <Ic.target size={16} /> <span className="ov-vtab-label">Milestones</span>
              <span className="ov-vtab-count">{milestones.length}</span>
            </button>
            <button className="ov-vtab" data-active={tab === 'modules' ? '' : undefined} onClick={() => setTab('modules')} type="button">
              <Ic.cube size={16} /> <span className="ov-vtab-label">Modules</span>
              <span className="ov-vtab-count">{modules.length}</span>
            </button>
          </nav>

          <div className="ov-vpanel">
            {tab === 'info' && <InfoPanel project={project} workspaces={workspaces} />}
            {tab === 'milestones' && <MilestonesPanel projectId={project.id} milestones={milestones} tasks={tasks} />}
            {tab === 'modules' && <ModulesPanel projectId={project.id} modules={modules} tasks={tasks} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Info panel
function InfoPanel({ project, workspaces }: { project: Project; workspaces: WorkspaceOpt[] }) {
  const router = useRouter();
  const save = async (patch: Parameters<typeof updateProject>[1]) => {
    await updateProject(project.id, patch);
    router.refresh();
  };
  const currentWs = workspaces.find((w) => w.id === project.workspaceId) ?? null;

  const isArchived = !!project.archivedAt;

  const archive = async () => {
    if (!confirm(`Archive “${project.name}”? It will be hidden from the sidebar. You can restore it later from All projects.`)) return;
    await archiveProject(project.id);
    router.push('/app/all');
  };

  const restore = async () => {
    await unarchiveProject(project.id);
    router.refresh();
  };

  return (
    <>
      <div className="ov-grid">
        <span className="ov-label">Short description</span>
        <input
          className="ov-input"
          defaultValue={project.shortDesc ?? ''}
          placeholder="One line about this project"
          onKeyDown={commitOnEnter}
          onBlur={(e) => e.target.value !== (project.shortDesc ?? '') && save({ shortDesc: e.target.value || null })}
        />

        <span className="ov-label">Status</span>
        <span>
          <Popover
            width={190}
            trigger={
              <button className="ov-pickbtn" type="button">
                <span className="pstatus">
                  <span className="dot" style={{ background: `var(--st-${DOT_KEY[project.status]})` }} />
                  {PROJECT_STATUS_LABEL[project.status]}
                </span>
              </button>
            }
          >
            {(close) => (
              <OptionList
                options={PROJECT_STATUS.map((s) => ({ id: s, label: PROJECT_STATUS_LABEL[s] }))}
                value={project.status}
                onPick={(id) => {
                  save({ status: id as ProjectStatus });
                  close();
                }}
                renderOpt={(o) => (
                  <>
                    <span className="dot" style={{ background: `var(--st-${DOT_KEY[o.id as ProjectStatus]})` }} />
                    {o.label}
                  </>
                )}
              />
            )}
          </Popover>
        </span>

        <span className="ov-label">Status note</span>
        <input
          className="ov-input"
          defaultValue={project.statusNote ?? ''}
          placeholder="Where is this project right now?"
          onKeyDown={commitOnEnter}
          onBlur={(e) => e.target.value !== (project.statusNote ?? '') && save({ statusNote: e.target.value || null })}
        />

        {workspaces.length > 0 && (
          <>
            <span className="ov-label">Workspace</span>
            <span>
              <Popover
                width={220}
                trigger={
                  <button className="ov-pickbtn" type="button">
                    {currentWs?.name ?? 'No workspace'}
                  </button>
                }
              >
                {(close) => (
                  <OptionList
                    options={workspaces.map((w) => ({ id: w.id, label: w.name }))}
                    value={project.workspaceId ?? ''}
                    onPick={(id) => {
                      if (id !== project.workspaceId) save({ workspaceId: id });
                      close();
                    }}
                  />
                )}
              </Popover>
            </span>
          </>
        )}

        <span className="ov-label">Prefix</span>
        <input className="ov-input ov-key" value={project.key} readOnly />

        <span className="ov-label">Tags</span>
        <TagEditor tags={project.tags} onChange={(tags) => save({ tags })} />
      </div>

      <label className="ov-label ov-desc-label">Description</label>
      <MarkdownField value={project.description ?? ''} onSave={(d) => save({ description: d || null })} />

      <div className="ov-danger" data-archived={isArchived ? '' : undefined}>
        <div className="ov-danger-text">
          <span className="ov-danger-title">{isArchived ? 'Restore project' : 'Archive project'}</span>
          <span className="ov-danger-desc">
            {isArchived
              ? 'This project is archived and hidden from the sidebar.'
              : 'Hide it from the sidebar. You can restore it later from All projects.'}
          </span>
        </div>
        {isArchived ? (
          <button className="ov-danger-btn" type="button" data-restore="" onClick={restore}>
            <Ic.restore size={14} /> Restore
          </button>
        ) : (
          <button className="ov-danger-btn" type="button" onClick={archive}>
            <Ic.archive size={14} /> Archive
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------- Milestones panel
function MilestonesPanel({
  projectId,
  milestones,
  tasks,
}: {
  projectId: string;
  milestones: GroupMilestone[];
  tasks: TaskDto[];
}) {
  const router = useRouter();
  const progress = useProgress(milestones, tasks, (t) => t.milestoneId);
  const drag = useDragReorder(milestones, (ids) => reorderMilestones(ids));

  return (
    <div className="ov-list-block">
      <div className="ov-list-head">
        <Ic.target size={16} /> Milestones <span className="ov-count">{milestones.length}</span>
      </div>
      {drag.ordered.map((m) => {
        const prog = progress.get(m.id) ?? { done: 0, total: 0 };
        const st = m.status as MilestoneStatus;
        return (
          <div
            className="ov-mile"
            key={m.id}
            data-dragging={drag.dragId === m.id ? '' : undefined}
            data-dragover={drag.overId === m.id ? '' : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              drag.setOverId(m.id);
            }}
            onDrop={() => drag.onDrop(m.id)}
          >
            <div className="ov-mile-top">
              <span
                className="ov-grip"
                draggable
                onDragStart={() => drag.setDragId(m.id)}
                onDragEnd={drag.reset}
                aria-label="Drag to reorder"
              >
                <Ic.grip size={14} />
              </span>
              <input
                className="ov-rowname"
                defaultValue={m.name}
                onKeyDown={commitOnEnter}
                onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && saveMile(m.id, { name: e.target.value.trim() }, router)}
              />
              <button
                className="icon-btn ov-del"
                type="button"
                onClick={async () => {
                  await deleteMilestone(m.id);
                  router.refresh();
                }}
                aria-label="Delete milestone"
              >
                <Ic.trash size={14} />
              </button>
            </div>
            <div className="ov-mile-bottom">
              <StatePicker
                value={st}
                options={MILESTONE_STATUS.map((s) => ({ id: s, label: MILESTONE_STATUS_LABEL[s], colorKey: MILE_COLOR_KEY[s] }))}
                onPick={async (s) => {
                  await setMilestoneStatus(m.id, s as MilestoneStatus);
                  router.refresh();
                }}
              />
              <CompactDate
                value={m.targetDate}
                onChange={(d) => saveMile(m.id, { targetDate: d }, router)}
              />
              <span className="ov-mile-prog">
                <Progress value={prog.total ? prog.done / prog.total : 0} width={54} tone={prog.total && prog.done === prog.total ? 'done' : 'accent'} />
                <span className="ov-rowmeta">
                  {prog.done}/{prog.total}
                </span>
              </span>
            </div>
          </div>
        );
      })}
      <button
        className="add-row-btn sm"
        type="button"
        onClick={async () => {
          await createMilestone({ projectId, name: 'New milestone' });
          router.refresh();
        }}
      >
        <Ic.plus size={15} /> Add milestone
      </button>
    </div>
  );
}

// ------------------------------------------------------------- Modules panel
function ModulesPanel({
  projectId,
  modules,
  tasks,
}: {
  projectId: string;
  modules: GroupModule[];
  tasks: TaskDto[];
}) {
  const router = useRouter();
  const progress = useProgress(modules, tasks, (t) => t.moduleId);
  const drag = useDragReorder(modules, (ids) => reorderModules(ids));

  return (
    <div className="ov-list-block">
      <div className="ov-list-head">
        <Ic.cube size={16} /> Modules <span className="ov-count">{modules.length}</span>
      </div>
      {drag.ordered.map((m) => {
        const prog = progress.get(m.id) ?? { done: 0, total: 0 };
        const state = (m.state ?? 'active') as ModuleState;
        return (
          <div
            className="ov-mod"
            key={m.id}
            data-dragging={drag.dragId === m.id ? '' : undefined}
            data-dragover={drag.overId === m.id ? '' : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              drag.setOverId(m.id);
            }}
            onDrop={() => drag.onDrop(m.id)}
          >
            <div className="ov-mod-main">
              <span
                className="ov-grip"
                draggable
                onDragStart={() => drag.setDragId(m.id)}
                onDragEnd={drag.reset}
                aria-label="Drag to reorder"
              >
                <Ic.grip size={14} />
              </span>
              <IconColorPicker
                icon={m.icon}
                color={m.color}
                onPick={async (patch) => {
                  await updateModule(m.id, patch);
                  router.refresh();
                }}
              />
              <input
                className="ov-rowname"
                defaultValue={m.name}
                onKeyDown={commitOnEnter}
                onBlur={async (e) => {
                  if (e.target.value.trim() && e.target.value !== m.name) {
                    await updateModule(m.id, { name: e.target.value.trim() });
                    router.refresh();
                  }
                }}
              />
              <StatePicker
                value={state}
                options={MODULE_STATE.map((s) => ({ id: s, label: MODULE_STATE_LABEL[s], colorKey: MODULE_STATE_COLOR_KEY[s] }))}
                onPick={async (s) => {
                  await updateModule(m.id, { state: s as ModuleState });
                  router.refresh();
                }}
              />
              <span className="ov-mod-prog">
                <Progress value={prog.total ? prog.done / prog.total : 0} width={48} tone={prog.total && prog.done === prog.total ? 'done' : 'accent'} />
                <span className="ov-rowmeta">
                  {prog.done}/{prog.total}
                </span>
              </span>
              <button
                className="icon-btn ov-del"
                type="button"
                onClick={async () => {
                  await archiveModule(m.id);
                  router.refresh();
                }}
                aria-label="Remove module"
              >
                <Ic.trash size={14} />
              </button>
            </div>
            <input
              className="ov-mod-desc"
              defaultValue={m.description ?? ''}
              placeholder="What does this module cover?"
              onKeyDown={commitOnEnter}
              onBlur={async (e) => {
                if (e.target.value !== (m.description ?? '')) {
                  await updateModule(m.id, { description: e.target.value || null });
                  router.refresh();
                }
              }}
            />
          </div>
        );
      })}
      <button
        className="add-row-btn sm"
        type="button"
        onClick={async () => {
          await createModule({ projectId, name: 'New module', color: '#6E8BFF', icon: 'cube' });
          router.refresh();
        }}
      >
        <Ic.plus size={15} /> Add module
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- primitives
interface StateOpt {
  id: string;
  label: string;
  colorKey: string;
}
function StatePicker({ value, options, onPick }: { value: string; options: StateOpt[]; onPick: (id: string) => void }) {
  const cur = options.find((o) => o.id === value) ?? options[0];
  return (
    <Popover
      width={170}
      trigger={
        <button className="ov-mstate" data-state={value} type="button">
          <span className="dot" style={{ background: `var(--st-${cur.colorKey})` }} />
          {cur.label}
        </button>
      }
    >
      {(close) => (
        <OptionList
          options={options.map((o) => ({ id: o.id, label: o.label }))}
          value={value}
          onPick={(id) => {
            onPick(id);
            close();
          }}
          renderOpt={(o) => {
            const opt = options.find((x) => x.id === o.id);
            return (
              <>
                <span className="dot" style={{ background: `var(--st-${opt?.colorKey ?? 'backlog'})` }} />
                {o.label}
              </>
            );
          }}
        />
      )}
    </Popover>
  );
}

function IconColorPicker({
  icon,
  color,
  onPick,
}: {
  icon?: string | null;
  color?: string | null;
  onPick: (patch: { icon?: ModuleIconName; color?: string }) => void;
}) {
  return (
    <Popover
      width={250}
      trigger={
        <button className="ov-modicon" type="button" aria-label="Module icon and colour">
          <ModuleIcon icon={icon ?? 'cube'} color={color} size={16} />
        </button>
      }
    >
      {(close) => (
        <div className="modicon-pop">
          <div className="modicon-colors">
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
          <div className="modicon-grid">
            {MODULE_ICONS.map((name) => {
              const IconC = iconByName(name);
              return (
                <button
                  key={name}
                  type="button"
                  className="modicon-cell"
                  data-on={name === icon ? '' : undefined}
                  style={name === icon ? { color: color ?? undefined } : undefined}
                  onClick={() => {
                    onPick({ icon: name });
                    close();
                  }}
                  aria-label={name}
                >
                  <IconC size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

function CompactDate({ value, onChange }: { value: Date | string | null; onChange: (d: Date | null) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        className="ov-date"
        autoFocus
        defaultValue={toDateInputValue(value)}
        onBlur={() => setEditing(false)}
        onChange={(e) => onChange(e.target.value ? new Date(`${e.target.value}T00:00:00`) : null)}
      />
    );
  }
  return (
    <button className="ov-mile-dbtn" data-empty={value ? undefined : ''} type="button" onClick={() => setEditing(true)}>
      <Ic.calendar size={12} /> {value ? fmtDate(value, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set date'}
    </button>
  );
}

// progress per group (done/total of tasks pointing at each item)
function useProgress<T extends { id: string }>(
  items: T[],
  tasks: TaskDto[],
  keyOf: (t: TaskDto) => string | null | undefined,
) {
  return useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const i of items) map.set(i.id, { done: 0, total: 0 });
    for (const t of tasks) {
      const k = keyOf(t);
      if (k && map.has(k)) {
        const e = map.get(k)!;
        e.total++;
        if (t.done) e.done++;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tasks]);
}

// local drag-reorder state; persists the new id order on drop
function useDragReorder<T extends { id: string }>(items: T[], persist: (ids: string[]) => void) {
  const idsKey = items.map((i) => i.id).join(',');
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  useEffect(() => {
    setOrder(items.map((i) => i.id));
  }, [idsKey]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as T[];

  const reset = () => {
    setDragId(null);
    setOverId(null);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return reset();
    const next = order.slice();
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return reset();
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrder(next);
    reset();
    persist(next);
  };

  return { ordered, dragId, overId, setDragId, setOverId, onDrop, reset };
}

function saveMile(
  id: string,
  patch: Parameters<typeof updateMilestone>[1],
  router: ReturnType<typeof useRouter>,
) {
  updateMilestone(id, patch).then(() => router.refresh());
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setV('');
  };
  return (
    <div className="tag-edit">
      {tags.map((t) => (
        <span className="tagchip" key={t}>
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            <Ic.close size={11} />
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Add tag…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

function MarkdownField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <MarkdownEditor
      value={value}
      onSave={onSave}
      className="md-wysiwyg--lg"
      placeholder="Describe the project in markdown…"
    />
  );
}
