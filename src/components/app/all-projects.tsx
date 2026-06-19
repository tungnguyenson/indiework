'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShellData } from '@/server/load';
import { PROJECT_STATUS, PROJECT_STATUS_LABEL, type ProjectStatus } from '@/lib/domain';
import { unarchiveProject } from '@/app/_actions/projects';
import { Ic } from '@/components/ui/icons';

type Projects = ShellData['projects'];

const DOT_KEY: Record<ProjectStatus, string> = {
  active: 'in_progress',
  launching: 'launching',
  planned: 'todo',
  paused: 'blocked',
  done: 'done',
  backlog: 'backlog',
  cancelled: 'cancelled',
};

const ARCHIVED_KEY = '__archived';

export function AllProjectsScreen({ projects }: { projects: Projects }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set([ARCHIVED_KEY]));

  // Archive is orthogonal to status — partition it out first so an archived
  // `active` project doesn't reappear under the "Active" group.
  const { groups, archived } = useMemo(() => {
    const live = projects.filter((p) => !p.archivedAt);
    const archived = projects.filter((p) => p.archivedAt);
    const groups = PROJECT_STATUS.map((status) => ({
      status,
      items: live.filter((p) => p.status === status),
    })).filter((g) => g.items.length > 0);
    return { groups, archived };
  }, [projects]);

  const toggle = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const open = (key: string) => router.push(`/app/p/${key}/overview`);

  const restore = async (id: string) => {
    await unarchiveProject(id);
    router.refresh();
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <span className="topbar-emoji">🗂️</span>
          <h1>All projects</h1>
        </div>
      </div>
      <div className="ptable-wrap">
        <table className="ptable">
          <thead>
            <tr>
              <th>Project</th>
              <th>Description</th>
              <th>Status note</th>
              <th className="pt-num">Open</th>
              <th className="pt-tags">Tags</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.status);
              return (
                <FragmentGroup
                  key={g.status}
                  label={PROJECT_STATUS_LABEL[g.status]}
                  dotKey={DOT_KEY[g.status]}
                  count={g.items.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggle(g.status)}
                >
                  {!isCollapsed &&
                    g.items.map((p) => (
                      <ProjectRow key={p.id} p={p} onOpen={() => open(p.key)} />
                    ))}
                </FragmentGroup>
              );
            })}

            {archived.length > 0 && (
              <FragmentGroup
                label="Archived"
                dotKey="backlog"
                count={archived.length}
                collapsed={collapsed.has(ARCHIVED_KEY)}
                onToggle={() => toggle(ARCHIVED_KEY)}
              >
                {!collapsed.has(ARCHIVED_KEY) &&
                  archived.map((p) => (
                    <ProjectRow
                      key={p.id}
                      p={p}
                      onOpen={() => open(p.key)}
                      onRestore={() => restore(p.id)}
                    />
                  ))}
              </FragmentGroup>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProjectRow({
  p,
  onOpen,
  onRestore,
}: {
  p: Projects[number];
  onOpen: () => void;
  onRestore?: () => void;
}) {
  return (
    <tr className="pt-row" data-archived={onRestore ? '' : undefined} onClick={onOpen}>
      <td className="pt-name">
        <span className="nav-emoji">{p.emoji ?? '•'}</span>
        <span className="pt-pname">{p.name}</span>
        <span className="pt-key">{p.key}</span>
      </td>
      <td className="pt-desc">{p.shortDesc}</td>
      <td className="pt-note">{p.statusNote}</td>
      <td className="pt-num">{p.issues}</td>
      <td>
        <div className="pt-tagrow">
          {p.tags.map((t) => (
            <span className="tagchip sm" key={t}>
              {t}
            </span>
          ))}
          {onRestore && (
            <button
              className="pt-restore"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
            >
              <Ic.restore size={13} /> Restore
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function FragmentGroup({
  label,
  dotKey,
  count,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  dotKey: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="pt-grouprow" data-collapsed={collapsed ? '' : undefined} onClick={onToggle}>
        <td colSpan={5}>
          <span className="pt-groupcaret">
            <Ic.chevronDown size={13} />
          </span>
          <span className="dot" style={{ background: `var(--st-${dotKey})` }} />
          {label}
          <span className="pt-groupcount">{count}</span>
        </td>
      </tr>
      {children}
    </>
  );
}
